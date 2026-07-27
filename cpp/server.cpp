#include <zmq.hpp>
#include <iostream>
#include <filesystem>
#include <vector>
#include "utils.hpp"
#include "market_state.hpp"
#include "orderbook.hpp"

// ============================================================================
//  PORTFOLIO / STATUS helpers (defined here — after both headers are included)
// ============================================================================

std::string get_portfolio_display() {
    std::lock_guard<std::mutex> lock(market_lock);
    std::lock_guard<std::mutex> olock(orderbook_lock);

    if (live_market_prices.empty()) return "ERROR | No market data loaded.";

    std::ostringstream oss;
    oss << "PORTFOLIO\n" << std::string(72, '=') << "\n";
    oss << std::left
        << std::setw(14) << "TICKER"
        << std::setw(14) << "PRICE ($)"
        << std::setw(14) << "VOLUME"
        << std::setw(14) << "BEST BID"
        << std::setw(14) << "BEST ASK"
        << "\n" << std::string(72, '-') << "\n";

    for (const auto& [ticker, info] : live_market_prices) {
        double best_bid = 0.0, best_ask = 0.0;
        if (order_books.count(ticker)) {
            if (!order_books[ticker].bids.empty()) best_bid = order_books[ticker].bids.begin()->first;
            if (!order_books[ticker].asks.empty()) best_ask = order_books[ticker].asks.begin()->first;
        }
        oss << std::fixed << std::setprecision(2)
            << std::left << std::setw(14) << ticker
            << std::left << std::setw(14) << info.price
            << std::left << std::setw(14) << info.volume
            << std::left << std::setw(14) << best_bid
            << std::left << std::setw(14) << best_ask
            << "\n";
    }
    oss << std::string(72, '=');
    return oss.str();
}

std::string get_status_display() {
    std::lock_guard<std::mutex> mlock(market_lock);
    std::lock_guard<std::mutex> hlock(history_lock);
    std::lock_guard<std::mutex> olock(orderbook_lock);

    std::ostringstream oss;
    oss << "STATUS_CHECK | TradeVerse Server\n" << std::string(40, '=') << "\n";
    oss << "  Tickers loaded      : " << live_market_prices.size() << "\n";
    oss << "  Order books seeded  : " << order_books.size() << "\n";
    oss << "  Trades executed     : " << trade_history.size() << "\n";
    oss << "  Next trade ID       : " << next_trade_id.load() << "\n";
    oss << "  Next order ID       : " << next_order_id.load() << "\n";
    oss << "  WAL dirty flag      : " << (dirty_flag.load() ? "YES" : "NO") << "\n";
    oss << std::string(40, '=') << "\n  Server is HEALTHY";
    return oss.str();
}

// ============================================================================
//  TRADE EXECUTION (MARKET ORDERS)
// ============================================================================

std::string execute_trade(const std::string& action, const std::string& ticker, int qty) {
    std::lock_guard<std::mutex> lock(market_lock);

    if (live_market_prices.find(ticker) == live_market_prices.end()) {
        return "REJECTED | Asset '" + ticker + "' not found.";
    }

    StockInfo& stock = live_market_prices[ticker];
    std::string ts = get_timestamp();
    int tid = next_trade_id.fetch_add(1);

    if (action == "BUY") {
        int buyable = get_buyable_qty(ticker);
        if (buyable < qty) return "REJECTED | Insufficient ask-side liquidity!";

        if (stock.volume >= qty) {
            stock.volume -= qty;
            wal_log("BUY", ticker, qty, stock.price);
            dirty_flag.store(true);
            log_trade_history({tid, "BUY", ticker, qty, stock.price, ts, false});
            return "SUCCESS | Bought " + std::to_string(qty) + " " + ticker +
                   " @ $" + [&]{ std::ostringstream o; o << std::fixed << std::setprecision(2) << stock.price; return o.str(); }();
        }
        return "REJECTED | Insufficient volume.";
    } else if (action == "SELL") {
        int sellable = get_sellable_qty(ticker);
        if (sellable < qty) return "REJECTED | Insufficient bid-side liquidity!";

        stock.volume += qty;
        wal_log("SELL", ticker, qty, stock.price);
        dirty_flag.store(true);
        log_trade_history({tid, "SELL", ticker, qty, stock.price, ts, false});
        return "SUCCESS | Sold " + std::to_string(qty) + " " + ticker +
               " @ $" + [&]{ std::ostringstream o; o << std::fixed << std::setprecision(2) << stock.price; return o.str(); }();
    }
    return "REJECTED | Invalid action.";
}

// ============================================================================
//  CANCEL MARKET ORDER (mark as cancelled in history)
// ============================================================================

std::string cancel_trade(int trade_id) {
    std::lock_guard<std::mutex> lock(history_lock);
    for (auto& t : trade_history) {
        if (t.trade_id == trade_id) {
            if (t.cancelled) return "REJECTED | Trade #" + std::to_string(trade_id) + " already cancelled.";
            t.cancelled = true;
            // Reverse the volume effect
            {
                std::lock_guard<std::mutex> mlock(market_lock);
                if (live_market_prices.count(t.ticker)) {
                    if (t.action == "BUY")  live_market_prices[t.ticker].volume += t.qty;
                    else                    live_market_prices[t.ticker].volume -= t.qty;
                    dirty_flag.store(true);
                }
            }
            return "SUCCESS | Trade #" + std::to_string(trade_id) + " cancelled & reversed.";
        }
    }
    return "REJECTED | Trade #" + std::to_string(trade_id) + " not found.";
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
        std::string reply_msg;

        // ---- LIMIT ORDERS ----
        if (client_msg.rfind("LIMIT_BUY:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string cmd, ticker, qty_str, price_str;
            std::getline(ss, cmd, ':'); std::getline(ss, ticker, ':');
            std::getline(ss, qty_str, ':'); std::getline(ss, price_str, ':');
            try {
                reply_msg = submit_order_request("LIMIT_BUY", trim(ticker), std::stoi(trim(qty_str)), std::stod(trim(price_str)));
            } catch (...) { reply_msg = "REJECTED | Invalid params. Format: LIMIT_BUY:TICKER:QTY:PRICE"; }
        }
        else if (client_msg.rfind("LIMIT_SELL:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string cmd, ticker, qty_str, price_str;
            std::getline(ss, cmd, ':'); std::getline(ss, ticker, ':');
            std::getline(ss, qty_str, ':'); std::getline(ss, price_str, ':');
            try {
                reply_msg = submit_order_request("LIMIT_SELL", trim(ticker), std::stoi(trim(qty_str)), std::stod(trim(price_str)));
            } catch (...) { reply_msg = "REJECTED | Invalid params. Format: LIMIT_SELL:TICKER:QTY:PRICE"; }
        }
        // ---- ORDER BOOK VIEW ----
        else if (client_msg.rfind("ORDERBOOK:", 0) == 0) {
            reply_msg = get_orderbook_display(trim(client_msg.substr(10)));
        }
        // ---- CANCEL LIMIT ORDER ----
        else if (client_msg.rfind("CANCEL_ORDER:", 0) == 0) {
            try {
                reply_msg = submit_order_request("CANCEL_ORDER", "", 0, 0, std::stoi(trim(client_msg.substr(13))));
            } catch (...) { reply_msg = "REJECTED | Invalid order ID."; }
        }
        // ---- CANCEL MARKET TRADE ----
        else if (client_msg.rfind("CANCEL:", 0) == 0) {
            try {
                reply_msg = cancel_trade(std::stoi(trim(client_msg.substr(7))));
            } catch (...) { reply_msg = "REJECTED | Invalid trade ID."; }
        }
        // ---- MARKET ORDERS ----
        else if (client_msg.rfind("BUY:", 0) == 0 || client_msg.rfind("SELL:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string action, ticker, qty_str;
            std::getline(ss, action, ':'); std::getline(ss, ticker, ':'); std::getline(ss, qty_str, ':');
            try {
                reply_msg = execute_trade(trim(action), trim(ticker), std::stoi(trim(qty_str)));
            } catch (...) { reply_msg = "REJECTED | Invalid qty. Format: BUY:TICKER:QTY"; }
        }
        // ---- FETCH PRICE ----
        else if (client_msg.rfind("FETCH:", 0) == 0) {
            std::string target = trim(client_msg.substr(6));
            std::lock_guard<std::mutex> lock(market_lock);
            if (live_market_prices.count(target)) {
                auto& info = live_market_prices[target];
                auto [bid, ask] = get_best_bid_ask(target);
                std::ostringstream oss;
                oss << std::fixed << std::setprecision(2);
                oss << "SUCCESS | " << target
                    << " | Price: $" << info.price
                    << " | Volume: "  << info.volume
                    << " | Bid: $"   << bid
                    << " | Ask: $"   << ask;
                reply_msg = oss.str();
            } else {
                reply_msg = "ERROR | Asset '" + target + "' not found.";
            }
        }
        // ---- PORTFOLIO ----
        else if (client_msg == "PORTFOLIO") {
            reply_msg = get_portfolio_display();
        }
        // ---- HISTORY ----
        else if (client_msg == "HISTORY") {
            reply_msg = get_history_display();
        }
        // ---- STATUS CHECK ----
        else if (client_msg == "STATUS_CHECK") {
            reply_msg = get_status_display();
        }
        // ---- UNKNOWN ----
        else {
            reply_msg = "ERROR | Unknown command. Valid commands:\n"
                        "  BUY:<TICKER>:<QTY>  SELL:<TICKER>:<QTY>  CANCEL:<TRADE_ID>\n"
                        "  LIMIT_BUY:<TICKER>:<QTY>:<PRICE>  LIMIT_SELL:<TICKER>:<QTY>:<PRICE>\n"
                        "  CANCEL_ORDER:<ORDER_ID>  ORDERBOOK:<TICKER>\n"
                        "  FETCH:<TICKER>  PORTFOLIO  HISTORY  STATUS_CHECK";
        }

        zmq::message_t reply(reply_msg.size());
        memcpy(reply.data(), reply_msg.data(), reply_msg.size());
        worker.send(reply, zmq::send_flags::none);
    }
}

// ============================================================================
//  ROUTER-DEALER PROXY
// ============================================================================

void run_chatbox_proxy_server() {
    zmq::context_t context(1);
    zmq::socket_t frontend(context, zmq::socket_type::router);
    frontend.bind("tcp://*:5556");
    zmq::socket_t backend(context, zmq::socket_type::dealer);
    backend.bind("inproc://backend");

    std::vector<std::thread> workers;
    for (int i = 0; i < 10; ++i) workers.push_back(std::thread(chatbox_worker_routine, &context));

    std::cout << "[INIT] Multithreaded Control Plane active on port 5556." << std::endl;
    zmq::proxy(frontend, backend);
    for (auto& t : workers) if (t.joinable()) t.join();
}

// ============================================================================
//  MAIN STARTUP SEQUENCE
// ============================================================================

int main() {
    std::cout << "\nStarting TradeVerse Server...\n";
    std::filesystem::create_directories("data");
    std::filesystem::create_directories("logs");

    std::ifstream file(CSV_FILE);
    if (!file.is_open()) {
        std::cerr << "[FATAL] Cannot open " << CSV_FILE << ". Run python/data.py first.\n";
        return 1;
    }

    std::string line;
    std::getline(file, line); // Skip header — read column names to know format
    std::cout << "[INIT] CSV header: " << line << "\n";

    // Determine if volume column exists
    bool has_volume = (line.find("VOLUME") != std::string::npos ||
                       line.find("Volume") != std::string::npos);

    int loaded = 0;
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string ts, tkr, prc, vol;
        std::getline(ss, ts, ',');
        std::getline(ss, tkr, ',');
        std::getline(ss, prc, ',');
        if (has_volume) std::getline(ss, vol, ',');

        try {
            int volume = 0;
            if (has_volume && !trim(vol).empty()) {
                volume = std::stoi(trim(vol));
            } else {
                // Default volume if column missing or empty
                volume = 1000000;
            }
            // Keep only the latest price per ticker (CSV is sorted by time)
            live_market_prices[trim(tkr)] = {trim(ts), std::stod(trim(prc)), volume};
            loaded++;
        } catch (...) {
            // Skip malformed rows silently
        }
    }
    file.close();

    if (live_market_prices.empty()) {
        std::cerr << "[FATAL] No valid rows parsed from CSV. Check data/market_data1.csv.\n";
        return 1;
    }

    std::cout << "[INIT] Loaded " << live_market_prices.size() << " tickers from " << loaded << " CSV rows.\n";

    // Seed order books for every loaded ticker
    for (const auto& [ticker, info] : live_market_prices) {
        base_prices[ticker] = info.price;
        seed_orderbook(ticker, info.price);
        std::cout << "[INIT] Seeded order book for " << ticker << " @ $"
                  << std::fixed << std::setprecision(2) << info.price << "\n";
    }

    replay_wal();

    std::thread queue_worker(order_queue_processor_thread); queue_worker.detach();
    std::thread flush_worker(async_flush_thread); flush_worker.detach();
    std::thread sim_worker(price_simulator_thread); sim_worker.detach();
    std::thread proxy_worker(run_chatbox_proxy_server); proxy_worker.detach();

    zmq::context_t context(1);
    zmq::socket_t publisher(context, zmq::socket_type::pub);
    publisher.bind("tcp://*:5555");
    std::cout << "[INIT] Exchange Stream broadcasting on port 5555...\n";
    std::cout << "[INIT] Server fully started. Ready to accept trades.\n\n";

    while (true) {
        {
            std::lock_guard<std::mutex> lock(market_lock);
            for (const auto& [ticker, info] : live_market_prices) {
                std::ostringstream msg_ss;
                msg_ss << ticker << ",$" << std::fixed << std::setprecision(2) << info.price;
                std::string msg = msg_ss.str();
                zmq::message_t zmq_msg(msg.size());
                memcpy(zmq_msg.data(), msg.data(), msg.size());
                publisher.send(zmq_msg, zmq::send_flags::none);
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    }
    return 0;
}