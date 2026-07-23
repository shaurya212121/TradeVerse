#include <zmq.hpp>
#include <string>
#include <iostream>
#include <chrono>
#include <thread>
#include <fstream>
#include <sstream>
#include <unordered_map>
#include <mutex>
#include <vector>
#include <iomanip>
#include <deque>
#include <atomic>
#include <ctime>
#include <filesystem>

// ============================================================================
//  DATA STRUCTURES
// ============================================================================

struct StockInfo {
    std::string timestamp;
    double price;
    int volume;
};

struct TradeRecord {
    int trade_id;
    std::string action;   // BUY or SELL
    std::string ticker;
    int qty;
    double price;
    std::string timestamp;
    bool cancelled;
};

// ============================================================================
//  GLOBAL STATE
// ============================================================================

// Market data matrix — shared across all threads
std::unordered_map<std::string, StockInfo> live_market_prices;
std::mutex market_lock;

// Trade history — in-memory ring buffer for CANCEL support
std::deque<TradeRecord> trade_history;
std::mutex history_lock;
std::atomic<int> next_trade_id{1};

// WAL dirty flag — signals the async flush thread to write
std::atomic<bool> dirty_flag{false};

// File paths (relative to project root, server runs from TradeVerse/)
const std::string CSV_FILE       = "data/market_data1.csv";
const std::string WAL_FILE       = "logs/wal.log";
const std::string HISTORY_FILE   = "logs/trade_history.log";

// Async flush interval in seconds
const int FLUSH_INTERVAL_SEC = 5;

// Max trade history entries kept in memory
const size_t MAX_HISTORY_SIZE = 500;

// ============================================================================
//  UTILITY FUNCTIONS
// ============================================================================

std::string trim(const std::string& str) {
    size_t first = str.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return "";
    size_t last = str.find_last_not_of(" \t\r\n");
    return str.substr(first, (last - first + 1));
}

std::string get_timestamp() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    std::tm tm_buf;
#ifdef _WIN32
    localtime_s(&tm_buf, &time);
#else
    localtime_r(&time, &tm_buf);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm_buf, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

// ============================================================================
//  WAL (Write-Ahead Log) — APPEND ONLY, NEAR-ZERO LATENCY
// ============================================================================

// Append a single trade entry to the WAL file (fast append, no rewrite)
void wal_log(const std::string& action, const std::string& ticker, int qty, double price) {
    std::ofstream wal(WAL_FILE, std::ios::app);
    if (!wal.is_open()) {
        std::cerr << "[WAL ERROR] Could not open " << WAL_FILE << std::endl;
        return;
    }
    wal << action << "|" << ticker << "|" << qty << "|"
        << std::fixed << std::setprecision(2) << price << "|"
        << get_timestamp() << "\n";
    wal.flush();
}

// Replay WAL entries on startup to recover state after a crash
void replay_wal() {
    std::ifstream wal(WAL_FILE);
    if (!wal.is_open()) return; // No WAL to replay

    std::string line;
    int replayed = 0;

    while (std::getline(wal, line)) {
        line = trim(line);
        if (line.empty()) continue;

        std::stringstream ss(line);
        std::string action, ticker, qty_str, price_str, timestamp;
        std::getline(ss, action, '|');
        std::getline(ss, ticker, '|');
        std::getline(ss, qty_str, '|');
        std::getline(ss, price_str, '|');
        std::getline(ss, timestamp, '|');

        try {
            int qty = std::stoi(qty_str);

            if (live_market_prices.find(ticker) != live_market_prices.end()) {
                if (action == "BUY") {
                    live_market_prices[ticker].volume -= qty;
                } else if (action == "SELL") {
                    live_market_prices[ticker].volume += qty;
                }
                replayed++;
            }
        } catch (...) {
            std::cerr << "[WAL REPLAY] Skipping malformed entry: " << line << std::endl;
        }
    }
    wal.close();

    if (replayed > 0) {
        std::cout << "[WAL REPLAY] Recovered " << replayed << " pending trades from WAL." << std::endl;
    }
}

// ============================================================================
//  TRADE HISTORY LOG — PERMANENT AUDIT TRAIL
// ============================================================================

void log_trade_history(const TradeRecord& trade) {
    // Append to disk
    std::ofstream hist(HISTORY_FILE, std::ios::app);
    if (hist.is_open()) {
        hist << trade.trade_id << "|" << trade.action << "|" << trade.ticker << "|"
             << trade.qty << "|" << std::fixed << std::setprecision(2) << trade.price << "|"
             << trade.timestamp << "|" << (trade.cancelled ? "CANCELLED" : "EXECUTED") << "\n";
        hist.flush();
    }

    // Keep in memory (bounded)
    std::lock_guard<std::mutex> lock(history_lock);
    trade_history.push_back(trade);
    if (trade_history.size() > MAX_HISTORY_SIZE) {
        trade_history.pop_front();
    }
}

// ============================================================================
//  CSV SYNC — CALLED ONLY BY BACKGROUND FLUSH THREAD
// ============================================================================

void sync_to_csv() {
    std::lock_guard<std::mutex> lock(market_lock);

    std::ofstream file(CSV_FILE, std::ios::trunc);
    if (!file.is_open()) {
        std::cerr << "[FLUSH ERROR] Could not write to " << CSV_FILE << std::endl;
        return;
    }

    file << "Date,Ticker,Price,Volume\n";
    for (const auto& [ticker, info] : live_market_prices) {
        file << info.timestamp << "," << ticker << "," << std::fixed << std::setprecision(2)
             << info.price << "," << info.volume << "\n";
    }
    file.close();

    // Truncate WAL after successful CSV flush
    std::ofstream wal_clear(WAL_FILE, std::ios::trunc);
    wal_clear.close();

    std::cout << "[FLUSH] CSV synced & WAL truncated at " << get_timestamp() << std::endl;
}

// Background thread: periodically flushes dirty state to CSV
void async_flush_thread() {
    std::cout << "[INIT] Async flush thread started (interval: " << FLUSH_INTERVAL_SEC << "s)" << std::endl;

    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(FLUSH_INTERVAL_SEC));

        if (dirty_flag.exchange(false)) {
            sync_to_csv();
        }
    }
}

// ============================================================================
//  TRADE EXECUTION ENGINE — WAL-BACKED, NON-BLOCKING
// ============================================================================

std::string execute_trade(const std::string& action, const std::string& ticker, int qty) {
    std::lock_guard<std::mutex> lock(market_lock);

    if (live_market_prices.find(ticker) == live_market_prices.end()) {
        return "REJECTED | Asset '" + ticker + "' not found in market matrix.";
    }

    StockInfo& stock = live_market_prices[ticker];
    std::string ts = get_timestamp();
    int tid = next_trade_id.fetch_add(1);

    if (action == "BUY") {
        if (stock.volume >= qty) {
            stock.volume -= qty;

            // WAL append (fast) instead of full CSV rewrite (slow)
            wal_log("BUY", ticker, qty, stock.price);
            dirty_flag.store(true);

            // Record trade
            TradeRecord rec{tid, "BUY", ticker, qty, stock.price, ts, false};
            log_trade_history(rec);

            return "SUCCESS | Trade #" + std::to_string(tid) + " | Bought " + std::to_string(qty) +
                   " shares of " + ticker + " @ $" + std::to_string(stock.price) +
                   " | Remaining Vol: " + std::to_string(stock.volume);
        } else {
            return "REJECTED | Insufficient volume! Requested: " + std::to_string(qty) +
                   ", Available: " + std::to_string(stock.volume);
        }
    } else if (action == "SELL") {
        stock.volume += qty;

        wal_log("SELL", ticker, qty, stock.price);
        dirty_flag.store(true);

        TradeRecord rec{tid, "SELL", ticker, qty, stock.price, ts, false};
        log_trade_history(rec);

        return "SUCCESS | Trade #" + std::to_string(tid) + " | Sold " + std::to_string(qty) +
               " shares of " + ticker + " @ $" + std::to_string(stock.price) +
               " | Updated Vol: " + std::to_string(stock.volume);
    }

    return "REJECTED | Invalid trade action.";
}

// ============================================================================
//  CANCEL TRADE — REVERSES VOLUME CHANGE
// ============================================================================

std::string cancel_trade(int trade_id) {
    std::lock_guard<std::mutex> hlock(history_lock);

    for (auto& trade : trade_history) {
        if (trade.trade_id == trade_id) {
            if (trade.cancelled) {
                return "REJECTED | Trade #" + std::to_string(trade_id) + " was already cancelled.";
            }

            std::lock_guard<std::mutex> mlock(market_lock);
            if (live_market_prices.find(trade.ticker) == live_market_prices.end()) {
                return "REJECTED | Asset '" + trade.ticker + "' no longer exists in market.";
            }

            StockInfo& stock = live_market_prices[trade.ticker];

            // Reverse the trade
            if (trade.action == "BUY") {
                stock.volume += trade.qty; // Return shares to market
                wal_log("SELL", trade.ticker, trade.qty, stock.price); // WAL reversal
            } else if (trade.action == "SELL") {
                stock.volume -= trade.qty; // Take shares back
                wal_log("BUY", trade.ticker, trade.qty, stock.price);
            }

            trade.cancelled = true;
            dirty_flag.store(true);

            return "SUCCESS | Trade #" + std::to_string(trade_id) + " cancelled. " +
                   trade.action + " " + std::to_string(trade.qty) + " " + trade.ticker + " reversed.";
        }
    }

    return "REJECTED | Trade #" + std::to_string(trade_id) + " not found in recent history.";
}

// ============================================================================
//  PORTFOLIO SNAPSHOT
// ============================================================================

std::string get_portfolio() {
    std::lock_guard<std::mutex> lock(market_lock);

    std::ostringstream oss;
    oss << "PORTFOLIO | " << live_market_prices.size() << " assets tracked\n";
    oss << std::left << std::setw(16) << "TICKER"
        << std::right << std::setw(12) << "PRICE"
        << std::setw(12) << "VOLUME" << "\n";
    oss << std::string(40, '-') << "\n";

    for (const auto& [ticker, info] : live_market_prices) {
        oss << std::left << std::setw(16) << ticker
            << std::right << std::setw(12) << std::fixed << std::setprecision(2) << info.price
            << std::setw(12) << info.volume << "\n";
    }

    return oss.str();
}

// ============================================================================
//  TRADE HISTORY VIEWER
// ============================================================================

std::string get_history(int count = 20) {
    std::lock_guard<std::mutex> lock(history_lock);

    if (trade_history.empty()) {
        return "HISTORY | No trades recorded yet.";
    }

    std::ostringstream oss;
    oss << "HISTORY | Last " << std::min(count, (int)trade_history.size()) << " trades\n";
    oss << std::left << std::setw(8) << "ID"
        << std::setw(6) << "ACT"
        << std::setw(14) << "TICKER"
        << std::setw(8) << "QTY"
        << std::setw(12) << "PRICE"
        << std::setw(10) << "STATUS" << "\n";
    oss << std::string(58, '-') << "\n";

    int start = std::max(0, (int)trade_history.size() - count);
    for (int i = (int)trade_history.size() - 1; i >= start; --i) {
        const auto& t = trade_history[i];
        oss << std::left << std::setw(8) << ("#" + std::to_string(t.trade_id))
            << std::setw(6) << t.action
            << std::setw(14) << t.ticker
            << std::setw(8) << t.qty
            << std::setw(12) << std::fixed << std::setprecision(2) << t.price
            << std::setw(10) << (t.cancelled ? "CANCELLED" : "EXECUTED") << "\n";
    }

    return oss.str();
}

// ============================================================================
//  WORKER THREAD — HANDLES ALL CLIENT COMMANDS
// ============================================================================

void chatbox_worker_routine(zmq::context_t* context) {
    zmq::socket_t worker(*context, zmq::socket_type::rep);
    worker.connect("inproc://backend");

    while (true) {
        zmq::message_t request;
        auto result = worker.recv(request, zmq::recv_flags::none);
        if (!result) continue;

        std::string client_msg(static_cast<char*>(request.data()), request.size());
        client_msg = trim(client_msg);

        std::cout << "\n[Thread " << std::this_thread::get_id() << "] Request: " << client_msg << std::endl;

        std::string reply_msg;

        // --- BUY / SELL ---
        if (client_msg.rfind("BUY:", 0) == 0 || client_msg.rfind("SELL:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string action, ticker, qty_str;
            std::getline(ss, action, ':');
            std::getline(ss, ticker, ':');
            std::getline(ss, qty_str, ':');

            try {
                int qty = std::stoi(qty_str);
                reply_msg = execute_trade(action, ticker, qty);
            } catch (...) {
                reply_msg = "REJECTED | Invalid trade quantity.";
            }
        }
        // --- FETCH ---
        else if (client_msg.rfind("FETCH:", 0) == 0) {
            std::string target_ticker = trim(client_msg.substr(6));

            std::lock_guard<std::mutex> lock(market_lock);
            if (live_market_prices.count(target_ticker)) {
                auto& info = live_market_prices[target_ticker];
                reply_msg = "SUCCESS | Asset: " + target_ticker + " | Price: $" +
                            std::to_string(info.price) + " | Vol: " + std::to_string(info.volume);
            } else {
                reply_msg = "ERROR | Asset '" + target_ticker + "' is not active in the tracking matrix.";
            }
        }
        // --- PORTFOLIO ---
        else if (client_msg == "PORTFOLIO") {
            reply_msg = get_portfolio();
        }
        // --- HISTORY ---
        else if (client_msg == "HISTORY") {
            reply_msg = get_history();
        }
        // --- CANCEL ---
        else if (client_msg.rfind("CANCEL:", 0) == 0) {
            std::string id_str = trim(client_msg.substr(7));
            try {
                int tid = std::stoi(id_str);
                reply_msg = cancel_trade(tid);
            } catch (...) {
                reply_msg = "REJECTED | Invalid trade ID for cancellation.";
            }
        }
        // --- STATUS ---
        else if (client_msg == "STATUS_CHECK") {
            reply_msg = "HEALTH: WAL-backed async engine online. " +
                        std::to_string(live_market_prices.size()) + " assets tracked. " +
                        std::to_string(next_trade_id.load() - 1) + " trades processed.";
        }
        // --- MANUAL OVERRIDE ---
        else if (client_msg == "MANUAL_OVERRIDE") {
            reply_msg = "SUCCESS: Emergency command protocols initialized.";
        }
        // --- DEFAULT ---
        else {
            reply_msg = "ACK: Query processed by assigned worker thread.";
        }

        // Send reply
        zmq::message_t reply(reply_msg.size());
        memcpy(reply.data(), reply_msg.data(), reply_msg.size());
        worker.send(reply, zmq::send_flags::none);

        std::cout << "[Thread " << std::this_thread::get_id() << "] Response sent." << std::endl;
    }
}

// ============================================================================
//  ROUTER-DEALER PROXY — TRAFFIC MANAGER
// ============================================================================

void run_chatbox_proxy_server() {
    zmq::context_t context(1);

    zmq::socket_t frontend(context, zmq::socket_type::router);
    frontend.bind("tcp://*:5556");

    zmq::socket_t backend(context, zmq::socket_type::dealer);
    backend.bind("inproc://backend");

    std::vector<std::thread> worker_threads;
    for (int i = 0; i < 10; ++i) {
        worker_threads.push_back(std::thread(chatbox_worker_routine, &context));
    }

    std::cout << "[INIT] Multithreaded Control Plane active with 10 workers on port 5556." << std::endl;

    zmq::proxy(frontend, backend);

    for (auto& t : worker_threads) {
        if (t.joinable()) t.join();
    }
}

// ============================================================================
//  MAIN — DATA PLANE ENGINE + STARTUP SEQUENCE
// ============================================================================

int main() {
    std::cout << R"(
  ___________              .___     ____   ____
  \__    ___/___________  __| _/____\   \ /   /___________  ______ ____
    |    |  \_  __ \__  \ / __ |/ __ \   Y   // __ \_  __ \/  ___// __ \
    |    |   |  | \// __ \\ /_/ \  ___/\     /\  ___/|  | \/\___ \\  ___/
    |____|   |__|  (____  /\____ |\___  >\___/  \___  >__|  /____  >\___  >
                        \/      \/    \/            \/           \/     \/
    )" << "\n";

    // Ensure directories exist
    std::filesystem::create_directories("data");
    std::filesystem::create_directories("logs");

    // 1. Load CSV data into RAM
    std::ifstream file(CSV_FILE);
    if (!file.is_open()) {
        std::cerr << "CRITICAL ERROR: Could not open " << CSV_FILE << std::endl;
        return 1;
    }

    std::string line;
    std::getline(file, line); // Skip header

    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string timestamp, ticker, price_str, volume_str = "1000";

        std::getline(ss, timestamp, ',');
        std::getline(ss, ticker, ',');
        std::getline(ss, price_str, ',');
        std::getline(ss, volume_str, ',');

        timestamp = trim(timestamp);
        ticker = trim(ticker);
        price_str = trim(price_str);
        volume_str = trim(volume_str);

        try {
            double price = std::stod(price_str);
            int vol = volume_str.empty() ? 1000 : std::stoi(volume_str);
            live_market_prices[ticker] = {timestamp, price, vol};
        } catch (...) {
            continue;
        }
    }
    file.close();
    std::cout << "[INIT] Market data loaded: " << live_market_prices.size() << " assets in RAM." << std::endl;

    // 2. Replay WAL to recover any pending trades from last session
    replay_wal();

    // 3. Start async CSV flush thread
    std::thread flush_worker(async_flush_thread);
    flush_worker.detach();

    // 4. Start the multithreaded ROUTER-DEALER proxy on Port 5556
    std::thread proxy_worker(run_chatbox_proxy_server);
    proxy_worker.detach();

    // 5. Setup Data Broadcast Socket on Port 5555
    zmq::context_t context(1);
    zmq::socket_t publisher(context, zmq::socket_type::pub);
    publisher.bind("tcp://*:5555");

    std::cout << "[INIT] Exchange Stream broadcasting on port 5555...\n" << std::endl;

    // 6. Infinite Live Broadcast Loop
    while (true) {
        {
            std::lock_guard<std::mutex> lock(market_lock);
            for (const auto& [ticker, info] : live_market_prices) {
                std::string message_string = ticker + "," + info.timestamp + ",$" +
                                            std::to_string(info.price) + ",Vol:" + std::to_string(info.volume);

                zmq::message_t message(message_string.size());
                memcpy(message.data(), message_string.data(), message_string.size());
                publisher.send(message, zmq::send_flags::none);
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    }

    return 0;
}