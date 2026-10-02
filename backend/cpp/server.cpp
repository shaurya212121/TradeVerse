#include <zmq.hpp>
#include <iostream>
#include <filesystem>
#include <vector>
#include "utils.hpp"
#include "market_state.hpp"
#include "orderbook.hpp"
#include "account_manager.hpp"

// ============================================================================
//  IDEMPOTENCY — Request deduplication cache
//  Maps request_id → cached_response.  If a client retries a request
//  whose ID we've already processed, we return the cached reply.
//  LRU eviction at 10,000 entries to bound memory.
// ============================================================================
inline std::unordered_map<std::string, std::string> dedup_cache;
inline std::mutex dedup_lock;
const size_t DEDUP_MAX_SIZE = 10000;

inline bool check_dedup(const std::string& req_id, std::string& cached_reply) {
    std::lock_guard<std::mutex> lk(dedup_lock);
    auto it = dedup_cache.find(req_id);
    if (it != dedup_cache.end()) {
        cached_reply = it->second;
        return true;
    }
    return false;
}

inline void store_dedup(const std::string& req_id, const std::string& reply) {
    std::lock_guard<std::mutex> lk(dedup_lock);
    if (dedup_cache.size() >= DEDUP_MAX_SIZE) {
        // Simple eviction: clear half the cache (in production, use proper LRU)
        auto it = dedup_cache.begin();
        for (size_t i = 0; i < DEDUP_MAX_SIZE / 2 && it != dedup_cache.end(); ++i)
            it = dedup_cache.erase(it);
    }
    dedup_cache[req_id] = reply;
}
// ============================================================================
//  PORTFOLIO / STATUS helpers (defined here — after both headers are included)
// ============================================================================
std::string get_portfolio_display() {
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
    // Lock each ticker individually — consistent with execute_trade's lock ordering.
    // get_best_bid_ask() will then take book_lock internally (price-lock released first
    // to avoid holding two locks simultaneously).
    for (const auto& [ticker, info_ignored] : live_market_prices) {
        StockInfo snap;
        {
            std::lock_guard<std::mutex> plock(ticker_price_locks.at(ticker));
            snap = live_market_prices.at(ticker);
        }
        auto [best_bid, best_ask] = get_best_bid_ask(ticker); // takes book_lock internally
        oss << std::fixed << std::setprecision(2)
            << std::left << std::setw(14) << ticker
            << std::left << std::setw(14) << snap.price
            << std::left << std::setw(14) << snap.volume
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

    std::ostringstream oss;
    oss << "STATUS_CHECK | TradeVerse Server\n" << std::string(40, '=') << "\n";
    oss << "  Tickers loaded      : " << live_market_prices.size() << "\n";
    oss << "  Order books seeded  : " << order_books.size() << "\n";
    oss << "  Active shards       : " << shards.size() << "\n";
    oss << "  Trades executed     : " << trade_history.size() << "\n";
    oss << "  Next trade ID       : " << next_trade_id.load() << "\n";
    oss << "  Next order ID       : " << next_order_id.load() << "\n";
    oss << "  WAL dirty flag      : " << (dirty_flag.load() ? "YES" : "NO") << "\n";
    oss << "  Registered accounts : " << accounts.size() << "\n";
    oss << "  Dedup cache entries : " << dedup_cache.size() << "\n";
    oss << std::string(40, '=') << "\n  Server is HEALTHY";
    return oss.str();
}
// ============================================================================
//  TRADE EXECUTION (MARKET ORDERS) — NOW WALKS THE BOOK
//
//  Market orders are routed through the per-ticker shard queue as IOC
//  (Immediate-Or-Cancel) limit orders with aggressive prices:
//    BUY  → LIMIT_BUY  at DBL_MAX  (will match any ask)
//    SELL → LIMIT_SELL  at 0.01     (will match any bid)
//
//  The matching engine sweeps multiple price levels, calculating true VWAP.
//  Unfilled remainder is discarded (IOC), not rested in the book.
// ============================================================================
std::string execute_trade(const std::string& action, const std::string& ticker, int qty) {
    if (!shards.count(ticker) || !ticker_price_locks.count(ticker))
        return "REJECTED | Asset '" + ticker + "' not found.";

    // Route through the shard queue so matching is serialized per-ticker
    std::string order_type;
    double aggressive_price;
    if (action == "BUY") {
        order_type = "MARKET_BUY";
        aggressive_price = 1e18;   // effectively infinite — matches any ask
    } else if (action == "SELL") {
        order_type = "MARKET_SELL";
        aggressive_price = 0.01;   // effectively zero — matches any bid
    } else {
        return "REJECTED | Invalid action.";
    }

    // Build request and route through the shard processor
    auto req = std::make_shared<OrderRequest>();
    req->type = order_type;
    req->ticker = ticker;
    req->qty = qty;
    req->price = aggressive_price;
    req->order_id = 0;
    std::future<std::string> fut = req->result_promise.get_future();
    {
        std::lock_guard<std::mutex> lg(shards[ticker].queue_lock);
        shards[ticker].queue.push(req);
    }
    shards[ticker].cv.notify_one();
    return fut.get();
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
            // Reverse the volume effect — use per-ticker lock, not global market_lock
            if (live_market_prices.count(t.ticker) && ticker_price_locks.count(t.ticker)) {
                std::lock_guard<std::mutex> plock(ticker_price_locks.at(t.ticker));
                if (t.action == "BUY")  live_market_prices.at(t.ticker).volume += t.qty;
                else                    live_market_prices.at(t.ticker).volume -= t.qty;
                dirty_flag.store(true);
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

        auto exec_start = std::chrono::high_resolution_clock::now();

        std::string client_msg(static_cast<char*>(request.data()), request.size());
        client_msg = trim(client_msg);
        std::string reply_msg;

        try {
        // ---- REGISTER CLIENT ----
        if (client_msg.rfind("REGISTER:", 0) == 0) {
            std::string cid = trim(client_msg.substr(9));
            if (cid.empty()) { reply_msg = "REJECTED | Client ID cannot be empty."; }
            else {
                register_account(cid);
                reply_msg = "SUCCESS | Client '" + cid + "' registered with $100,000.00 cash.";
            }
        }
        // ---- ACCOUNT VIEW ----
        else if (client_msg.rfind("ACCOUNT:", 0) == 0) {
            reply_msg = get_account_display(trim(client_msg.substr(8)));
        }
        // ---- LIMIT ORDERS ----
        else if (client_msg.rfind("LIMIT_BUY:", 0) == 0) {
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
        // ---- MARKET ORDERS (with optional account checks) ----
        // New format:  BUY:CLIENT_ID:TICKER:QTY[:REQUEST_ID]
        // Legacy:      BUY:TICKER:QTY  (no account checks, backward compatible)
        else if (client_msg.rfind("BUY:", 0) == 0 || client_msg.rfind("SELL:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string action;
            std::getline(ss, action, ':');
            action = trim(action);

            // Collect remaining fields
            std::vector<std::string> fields;
            std::string field;
            while (std::getline(ss, field, ':')) {
                fields.push_back(trim(field));
            }

            try {
                if (fields.size() >= 3) {
                    // New format: BUY:CLIENT_ID:TICKER:QTY[:REQUEST_ID]
                    std::string client_id = fields[0];
                    std::string ticker    = fields[1];
                    int qty               = std::stoi(fields[2]);
                    std::string req_id    = (fields.size() >= 4) ? fields[3] : "";

                    // Idempotency check
                    if (!req_id.empty()) {
                        std::string cached;
                        if (check_dedup(req_id, cached)) {
                            reply_msg = cached;
                            goto send_reply;
                        }
                    }

                    // Account validation
                    if (!account_exists(client_id)) {
                        reply_msg = "REJECTED | Unknown client '" + client_id + "'. Send REGISTER:" + client_id + " first.";
                    } else {
                        // Pre-trade risk check
                        std::string rejection;
                        if (action == "BUY") {
                            // Estimate price from best ask
                            auto [bid, ask] = get_best_bid_ask(ticker);
                            double est_price = (ask > 0) ? ask : 999999.0;
                            rejection = validate_buy(client_id, ticker, qty, est_price);
                        } else {
                            rejection = validate_sell(client_id, ticker, qty);
                        }

                        if (!rejection.empty()) {
                            reply_msg = rejection;
                        } else {
                            reply_msg = execute_trade(action, ticker, qty);

                            // Post-trade settlement: extract price from response
                            if (reply_msg.find("SUCCESS") != std::string::npos ||
                                reply_msg.find("PARTIAL") != std::string::npos) {
                                // Parse VWAP from response: "... @ $123.45 ..."
                                auto dollar_pos = reply_msg.find("$");
                                if (dollar_pos != std::string::npos) {
                                    double exec_price = 0;
                                    try { exec_price = std::stod(reply_msg.substr(dollar_pos + 1)); } catch (...) {}
                                    // Parse filled qty from response
                                    int filled_qty = qty;  // default: assume full fill
                                    auto bought_pos = reply_msg.find("Bought ");
                                    auto sold_pos   = reply_msg.find("Sold ");
                                    if (bought_pos != std::string::npos) {
                                        try { filled_qty = std::stoi(reply_msg.substr(bought_pos + 7)); } catch (...) {}
                                    } else if (sold_pos != std::string::npos) {
                                        try { filled_qty = std::stoi(reply_msg.substr(sold_pos + 5)); } catch (...) {}
                                    }
                                    if (exec_price > 0 && filled_qty > 0) {
                                        if (action == "BUY")
                                            settle_buy(client_id, ticker, filled_qty, exec_price);
                                        else
                                            settle_sell(client_id, ticker, filled_qty, exec_price);
                                    }
                                }
                            }
                        }
                    }

                    // Store in dedup cache
                    if (!req_id.empty()) {
                        store_dedup(req_id, reply_msg);
                    }
                } else if (fields.size() == 2) {
                    // Legacy format: BUY:TICKER:QTY (no account checks)
                    std::string ticker = fields[0];
                    int qty            = std::stoi(fields[1]);
                    reply_msg = execute_trade(action, ticker, qty);
                } else {
                    reply_msg = "REJECTED | Invalid format. Use BUY:TICKER:QTY or BUY:CLIENT_ID:TICKER:QTY";
                }
            } catch (...) { reply_msg = "REJECTED | Invalid params."; }
        }
        // ---- FETCH PRICE ----
        else if (client_msg.rfind("FETCH:", 0) == 0) {
            std::string target = trim(client_msg.substr(6));
            StockInfo info_copy;
            bool found = false;
            if (ticker_price_locks.count(target)) {
                std::lock_guard<std::mutex> plock(ticker_price_locks.at(target));
                if (live_market_prices.count(target)) {
                    info_copy = live_market_prices.at(target);
                    found = true;
                }
            }
            if (found) {
                auto [bid, ask] = get_best_bid_ask(target);
                std::ostringstream oss;
                oss << std::fixed << std::setprecision(2);
                oss << "SUCCESS | " << target
                    << " | Price: $" << info_copy.price
                    << " | Volume: " << info_copy.volume
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
                        "  REGISTER:<CLIENT_ID>\n"
                        "  BUY:<CLIENT_ID>:<TICKER>:<QTY>[:<REQ_ID>]\n"
                        "  SELL:<CLIENT_ID>:<TICKER>:<QTY>[:<REQ_ID>]\n"
                        "  BUY:<TICKER>:<QTY>  SELL:<TICKER>:<QTY>  (legacy, no account)\n"
                        "  CANCEL:<TRADE_ID>\n"
                        "  LIMIT_BUY:<TICKER>:<QTY>:<PRICE>  LIMIT_SELL:<TICKER>:<QTY>:<PRICE>\n"
                        "  CANCEL_ORDER:<ORDER_ID>  ORDERBOOK:<TICKER>\n"
                        "  FETCH:<TICKER>  PORTFOLIO  HISTORY  STATUS_CHECK\n"
                        "  ACCOUNT:<CLIENT_ID>";
        }
        } catch (const std::exception& e) {
            reply_msg = std::string("ERROR | Server exception: ") + e.what();
        } catch (...) {
            reply_msg = "ERROR | Unknown server exception.";
        }

        send_reply:
        auto exec_end = std::chrono::high_resolution_clock::now();
        auto exec_us = std::chrono::duration_cast<std::chrono::microseconds>(exec_end - exec_start).count();
        reply_msg += "\n[LATENCY] Server Execution: " + std::to_string(exec_us) + " us";

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
            std::string clean_tkr = trim(tkr);
            live_market_prices[clean_tkr] = {trim(ts), std::stod(trim(prc)), volume};
            // Populate ticker_price_locks now (single-threaded) — no concurrent-insertion risk
            ticker_price_locks[clean_tkr];
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

    // Launch one dedicated processor thread per ticker (per-ticker parallelism)
    for (const auto& [ticker, info] : live_market_prices) {
        std::thread(ticker_processor_thread, ticker).detach();
    }
    std::thread wal_writer(async_wal_writer_thread); wal_writer.detach();
    std::thread flush_worker(async_flush_thread); flush_worker.detach();
    std::thread sim_worker(price_simulator_thread); sim_worker.detach();
    std::thread proxy_worker(run_chatbox_proxy_server); proxy_worker.detach();

    zmq::context_t context(1);
    zmq::socket_t publisher(context, zmq::socket_type::pub);
    publisher.bind("tcp://*:5555");
    std::cout << "[INIT] Exchange Stream broadcasting on port 5555...\n";
    std::cout << "[INIT] Server fully started. Ready to accept trades.\n\n";

    while (true) {
        // Fix 4 (broadcaster): snapshot each ticker's price under its own lock,
        // then send outside the lock.  No single lock is held across the whole sweep,
        // so execute_trade on any ticker is never blocked by this loop.
        std::vector<std::pair<std::string, std::string>> snapshots;
        snapshots.reserve(live_market_prices.size());
        for (const auto& [ticker, info_ignored] : live_market_prices) {
            double price_snap;
            {
                std::lock_guard<std::mutex> plock(ticker_price_locks.at(ticker));
                price_snap = live_market_prices.at(ticker).price;
            }
            std::ostringstream msg_ss;
            msg_ss << ticker << ",$" << std::fixed << std::setprecision(2) << price_snap;
            snapshots.emplace_back(ticker, msg_ss.str());
        }
        for (const auto& [ticker, msg] : snapshots) {
            zmq::message_t zmq_msg(msg.size());
            memcpy(zmq_msg.data(), msg.data(), msg.size());
            publisher.send(zmq_msg, zmq::send_flags::none);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    }
    return 0;
}