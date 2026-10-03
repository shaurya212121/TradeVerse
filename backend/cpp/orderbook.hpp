#pragma once
#include <string>
#include <map>
#include <list>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <future>
#include <iostream>
#include "market_state.hpp"
#include "account_manager.hpp"

// ============================================================================
//  STRUCTURES
// ============================================================================

struct Order {
    int order_id;
    std::string side;
    std::string ticker;
    int qty;
    double price;
    std::string timestamp;
    bool is_synthetic;
    std::string client_id;
};

struct OrderBook {
    std::map<double, std::list<Order>, std::greater<double>> bids;
    std::map<double, std::list<Order>>                       asks;
};

struct OrderRequest {
    std::string type;
    std::string ticker;
    int qty;
    double price;
    int order_id;
    std::promise<std::string> result_promise;
    std::string client_id;
};

// ============================================================================
//  PER-TICKER SHARD
//  Each ticker gets its own queue, CV, and book lock.
//  Orders for AAPL and TSLA are processed concurrently on separate threads.
// ============================================================================

struct TickerShard {
    std::queue<std::shared_ptr<OrderRequest>> queue;
    std::mutex  queue_lock;
    std::condition_variable cv;
    std::mutex  book_lock;   // protects this ticker's OrderBook for reads + writes
};

inline std::unordered_map<std::string, OrderBook>   order_books;
inline std::unordered_map<std::string, TickerShard> shards;      // one per ticker
inline std::atomic<int> next_order_id{1};

// ============================================================================
//  O(1) CANCEL INDEX
//  Maps order_id → { ticker, price, side, list::iterator }
//  Lets CANCEL_ORDER erase in O(1) without scanning the book.
// ============================================================================

struct OrderLocation {
    std::string ticker;
    double price;
    std::string side;   // "BID" or "ASK"
    std::list<Order>::iterator it;
};

inline std::unordered_map<int, OrderLocation> order_location_map;
inline std::mutex order_location_map_lock;

const int ORDERBOOK_DISPLAY_DEPTH = 10;

// ============================================================================
//  HELPERS — register / unregister order locations for O(1) cancel
// ============================================================================

inline void register_order_location(int oid, const std::string& ticker, double price,
                                     const std::string& side, std::list<Order>::iterator it) {
    std::lock_guard<std::mutex> lk(order_location_map_lock);
    order_location_map[oid] = {ticker, price, side, it};
}
inline void unregister_order_id(int oid) {
    std::lock_guard<std::mutex> lk(order_location_map_lock);
    order_location_map.erase(oid);
}
// Legacy helper — used by seed_orderbook (no iterator available yet at push_back time)
inline void register_order_id(int oid, const std::string& ticker) {
    // Seed-time only: we don't need cancel support for synthetic orders,
    // but we register a placeholder so submit_order_request routing works.
    std::lock_guard<std::mutex> lk(order_location_map_lock);
    order_location_map[oid] = {ticker, 0.0, "", {}};
}
// ============================================================================
//  SEED ORDER BOOK  (called once per ticker at startup, before threads start)
// ============================================================================

inline void seed_orderbook(const std::string& ticker, double base_price) {
    shards[ticker];                           // default-constructs the shard
    std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
    OrderBook& book = order_books[ticker];

    std::mt19937 rng(std::hash<std::string>{}(ticker));
    std::uniform_int_distribution<int> qty_dist(50, 500);
    std::string ts = get_timestamp();

    for (int i = 1; i <= 8; ++i) {
        double ask_price = std::round((base_price * (1.0 + i * 0.002)) * 100.0) / 100.0;
        int oid = next_order_id.fetch_add(1);
        register_order_id(oid, ticker);
        book.asks[ask_price].push_back({oid, "ASK", ticker, qty_dist(rng), ask_price, ts, true});
    }
    for (int i = 1; i <= 8; ++i) {
        double bid_price = std::round((base_price * (1.0 - i * 0.002)) * 100.0) / 100.0;
        int oid = next_order_id.fetch_add(1);
        register_order_id(oid, ticker);
        book.bids[bid_price].push_back({oid, "BID", ticker, qty_dist(rng), bid_price, ts, true});
    }
}

// ============================================================================
//  READ HELPERS  (lock per-ticker book_lock, not a global lock)
// ============================================================================

inline int get_buyable_qty(const std::string& ticker) {
    if (!shards.count(ticker)) return 0;
    std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
    int total = 0;
    for (const auto& [p, orders] : order_books[ticker].asks)
        for (const auto& o : orders) total += o.qty;
    return total;
}

inline int get_sellable_qty(const std::string& ticker) {
    if (!shards.count(ticker)) return 0;
    std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
    int total = 0;
    for (const auto& [p, orders] : order_books[ticker].bids)
        for (const auto& o : orders) total += o.qty;
    return total;
}

// ============================================================================
//  LOCK-FREE READ HELPERS — caller MUST already hold shard.book_lock
// ============================================================================

inline int get_buyable_qty_unsafe(const std::string& ticker) {
    int total = 0;
    for (const auto& [p, orders] : order_books[ticker].asks)
        for (const auto& o : orders) total += o.qty;
    return total;
}

inline int get_sellable_qty_unsafe(const std::string& ticker) {
    int total = 0;
    for (const auto& [p, orders] : order_books[ticker].bids)
        for (const auto& o : orders) total += o.qty;
    return total;
}

inline std::pair<double, double> get_best_bid_ask(const std::string& ticker) {
    double best_bid = 0.0, best_ask = 0.0;
    if (!shards.count(ticker)) return {best_bid, best_ask};
    std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
    const auto& book = order_books[ticker];
    if (!book.bids.empty()) best_bid = book.bids.begin()->first;
    if (!book.asks.empty()) best_ask = book.asks.begin()->first;
    return {best_bid, best_ask};
}
inline std::string get_orderbook_display(const std::string& ticker, int depth = ORDERBOOK_DISPLAY_DEPTH) {
    if (!shards.count(ticker))
        return "ERROR | No order book found for '" + ticker + "'.";
    std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
    const auto& book = order_books[ticker];
    std::ostringstream oss;
    oss << "ORDERBOOK | " << ticker << "\n" << std::string(48, '=') << "\n";
    oss << "         ASKS (Sellers)\n  " << std::string(38, '-') << "\n";
    std::vector<std::pair<double, int>> ask_levels;
    for (const auto& [price, orders] : book.asks) {
        int lq = 0; for (const auto& o : orders) lq += o.qty;
        ask_levels.push_back({price, lq});
        if ((int)ask_levels.size() >= depth) break;
    }
    for (int i = (int)ask_levels.size() - 1; i >= 0; --i)
        oss << "   $" << std::fixed << std::setprecision(2) << std::setw(10)
            << ask_levels[i].first << "     x " << std::setw(6) << ask_levels[i].second << "\n";
    double best_bid = book.bids.empty() ? 0.0 : book.bids.begin()->first;
    double best_ask = book.asks.empty() ? 0.0 : book.asks.begin()->first;
    double spread   = (best_ask > 0 && best_bid > 0) ? (best_ask - best_bid) : 0.0;
    oss << "  " << std::string(38, '-') << "\n   >>> SPREAD: $" << spread << " <<<\n  " << std::string(38, '-') << "\n";

    int bc = 0;
    for (const auto& [price, orders] : book.bids) {
        int lq = 0; for (const auto& o : orders) lq += o.qty;
        oss << "   $" << std::fixed << std::setprecision(2) << std::setw(10)
            << price << "     x " << std::setw(6) << lq << "\n";
        if (++bc >= depth) break;
    }
    oss << "  " << std::string(38, '-') << "\n         BIDS (Buyers)\n" << std::string(48, '=') << "\n";
    return oss.str();
}
// ============================================================================
//  PROCESS LIMIT ORDER  (called from each ticker's own processor thread)
//  Acquires only this ticker's book_lock — other tickers run in parallel.
//
//  IOC mode (Immediate-Or-Cancel):  When ioc=true, any unfilled remainder
//  is discarded instead of resting in the book.  Market orders use this path
//  with an aggressive price (DBL_MAX for buys, 0.01 for sells) so they
//  naturally walk the entire book and fill at VWAP.
// ============================================================================
inline std::string process_limit_order(const std::string& side, const std::string& ticker,
                                       int qty, double price, bool ioc = false, const std::string& client_id_agg = "") {
    if (!shards.count(ticker)) return "REJECTED | No order book for '" + ticker + "'.";
    int new_oid   = 0;
    int original  = qty, filled = 0;
    double fill_val = 0.0;
    std::string ts = get_timestamp();
    {
        std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
        OrderBook& book = order_books[ticker];

        if (side == "BID") {
            while (qty > 0 && !book.asks.empty()) {
                auto it = book.asks.begin();
                if (it->first > price) break;
                auto& q = it->second;
                while (qty > 0 && !q.empty()) {
                    Order& r = q.front();
                    int f = std::min(qty, r.qty);
                    qty -= f; r.qty -= f; filled += f; fill_val += f * r.price;
                    
                    if (!r.client_id.empty()) settle_sell(r.client_id, ticker, f, r.price, f);

                    if (r.qty == 0) { unregister_order_id(r.order_id); q.pop_front(); }
                }
                if (q.empty()) book.asks.erase(it);
            }
            // Rest unfilled quantity in book — unless IOC mode
            if (qty > 0 && !ioc) {
                new_oid = next_order_id.fetch_add(1);
                book.bids[price].push_back({new_oid, "BID", ticker, qty, price, ts, false, client_id_agg});
                // Register iterator for O(1) cancel
                auto& lvl = book.bids[price];
                auto last_it = std::prev(lvl.end());
                register_order_location(new_oid, ticker, price, "BID", last_it);
            }
        } else {
            while (qty > 0 && !book.bids.empty()) {
                auto it = book.bids.begin();
                if (it->first < price) break;
                auto& q = it->second;
                while (qty > 0 && !q.empty()) {
                    Order& r = q.front();
                    int f = std::min(qty, r.qty);
                    qty -= f; r.qty -= f; filled += f; fill_val += f * r.price;

                    if (!r.client_id.empty()) settle_buy(r.client_id, ticker, f, r.price, r.price);

                    if (r.qty == 0) { unregister_order_id(r.order_id); q.pop_front(); }
                }
                if (q.empty()) book.bids.erase(it);
            }
            // Rest unfilled quantity in book — unless IOC mode
            if (qty > 0 && !ioc) {
                new_oid = next_order_id.fetch_add(1);
                book.asks[price].push_back({new_oid, "ASK", ticker, qty, price, ts, false, client_id_agg});
                // Register iterator for O(1) cancel
                auto& lvl = book.asks[price];
                auto last_it = std::prev(lvl.end());
                register_order_location(new_oid, ticker, price, "ASK", last_it);
            }
        }
    } // book_lock released here

    if (qty > 0 && !ioc) {
        std::string act = (side == "BID") ? "LIMIT_BUY" : "LIMIT_SELL";
        wal_log(act, ticker, qty, price);
    }

    // Log filled portion + price discovery: executed fill price becomes the market price
    if (filled > 0) {
        double avg_fill = fill_val / filled;

        // NEW FIX: Settle the limit order aggressor mid-match so they get their shares/cash
        if (!ioc && !client_id_agg.empty()) {
            if (side == "BID") settle_buy(client_id_agg, ticker, filled, avg_fill, price);
            else               settle_sell(client_id_agg, ticker, filled, avg_fill, filled);
        }

        std::string act = (side == "BID") ? "BUY" : "SELL";
        wal_log(act, ticker, filled, avg_fill);
        dirty_flag.store(true);
        log_trade_history({next_trade_id.fetch_add(1), act, ticker, filled, avg_fill, ts, false});
        // ── PRICE DISCOVERY ──────────────────────────────────────────────────
        // The price at which orders actually matched in the book is now the
        // official market price for broadcast on port 5555.
        if (ticker_price_locks.count(ticker)) {
            std::lock_guard<std::mutex> plock(ticker_price_locks.at(ticker));
            if (live_market_prices.count(ticker)) {
                live_market_prices.at(ticker).price     = avg_fill;
                live_market_prices.at(ticker).timestamp = ts;
            }
        }
    }

    // Build response
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2);
    if (ioc) {
        // Market order (IOC) response format
        if (filled == original) {
            double avg = fill_val / filled;
            std::string verb = (side == "BID") ? "Bought" : "Sold";
            oss << "SUCCESS | " << verb << " " << filled << " " << ticker
                << " @ $" << avg << " (VWAP, " << filled << " shares across book)";
        } else if (filled > 0) {
            double avg = fill_val / filled;
            std::string verb = (side == "BID") ? "Bought" : "Sold";
            oss << "PARTIAL | " << verb << " " << filled << "/" << original
                << " " << ticker << " @ $" << avg << " | " << qty << " unfilled (no liquidity)";
        } else {
            oss << "REJECTED | Insufficient " << ((side == "BID") ? "ask" : "bid")
                << "-side liquidity for " << ticker << "!";
        }
    } else {
        // Limit order response format (unchanged)
        if (filled == original)    oss << "FILLED  | " << side << " " << filled << " " << ticker << " fully filled @ avg $" << (fill_val / filled);
        else if (filled > 0)       oss << "PARTIAL | " << side << " " << filled << "/" << original << " " << ticker << " filled | " << qty << " resting @ $" << price;
        else                       oss << "RESTING | " << side << " " << original << " " << ticker << " placed in book @ $" << price << " (order #" << new_oid << ")";
    }
    return oss.str();
}

// ============================================================================
//  PROCESS CANCEL ORDER — O(1) via order_location_map
//  Looks up the order's exact position in the book and erases directly.
// ============================================================================

inline std::string process_cancel_order(const std::string& ticker, int order_id) {
    if (!shards.count(ticker)) return "REJECTED | Order #" + std::to_string(order_id) + " not found.";

    OrderLocation loc;
    {
        std::lock_guard<std::mutex> lk(order_location_map_lock);
        auto map_it = order_location_map.find(order_id);
        if (map_it == order_location_map.end())
            return "REJECTED | Order #" + std::to_string(order_id) + " not found.";
        loc = map_it->second;
    }

    // Verify ticker matches (should always match if routing is correct)
    if (loc.ticker != ticker)
        return "REJECTED | Order #" + std::to_string(order_id) + " not found in " + ticker + " book.";

    // If this was a seed-time placeholder (side is empty), fall back to linear scan
    if (loc.side.empty()) {
        std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
        auto& book = order_books[ticker];
        for (auto& [price, orders] : book.bids) {
            for (auto it = orders.begin(); it != orders.end(); ++it) {
                if (it->order_id == order_id) {
                    std::string info = "SUCCESS | Cancelled BID order #" + std::to_string(order_id) + " (" + ticker + ")";
                    orders.erase(it);
                    if (orders.empty()) book.bids.erase(price);
                    unregister_order_id(order_id);
                    return info;
                }
            }
        }
        for (auto& [price, orders] : book.asks) {
            for (auto it = orders.begin(); it != orders.end(); ++it) {
                if (it->order_id == order_id) {
                    std::string info = "SUCCESS | Cancelled ASK order #" + std::to_string(order_id) + " (" + ticker + ")";
                    orders.erase(it);
                    if (orders.empty()) book.asks.erase(price);
                    unregister_order_id(order_id);
                    return info;
                }
            }
        }
        return "REJECTED | Order #" + std::to_string(order_id) + " not found in " + ticker + " book.";
    }

    // O(1) cancel path: we know the exact side, price, and iterator
    std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
    auto& book = order_books[ticker];
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2);

    if (loc.side == "BID") {
        auto lvl_it = book.bids.find(loc.price);
        if (lvl_it != book.bids.end()) {
            int q = loc.it->qty;
            std::string cid = loc.it->client_id;
            if (!cid.empty()) refund_buy(cid, q, loc.price);
            
            lvl_it->second.erase(loc.it);
            if (lvl_it->second.empty()) book.bids.erase(lvl_it);
        }
        wal_log("CANCEL_ORDER", ticker, order_id, 0.0);
        oss << "SUCCESS | Cancelled BID order #" << order_id << " (" << ticker << " @ $" << loc.price << ")";
    } else {
        auto lvl_it = book.asks.find(loc.price);
        if (lvl_it != book.asks.end()) {
            int q = loc.it->qty;
            std::string cid = loc.it->client_id;
            if (!cid.empty()) refund_sell(cid, ticker, q);
            
            lvl_it->second.erase(loc.it);
            if (lvl_it->second.empty()) book.asks.erase(lvl_it);
        }
        wal_log("CANCEL_ORDER", ticker, order_id, 0.0);
        oss << "SUCCESS | Cancelled ASK order #" << order_id << " (" << ticker << " @ $" << loc.price << ")";
    }
    unregister_order_id(order_id);
    return oss.str();
}

// ============================================================================
//  PER-TICKER PROCESSOR THREAD
//  One thread per ticker — AAPL thread only processes AAPL orders, etc.
// ============================================================================

inline void ticker_processor_thread(std::string ticker) {
    auto& shard = shards[ticker];
    std::cout << "[INIT] Order processor started for " << ticker << "\n";
    while (true) {
        std::shared_ptr<OrderRequest> req;
        {
            std::unique_lock<std::mutex> ul(shard.queue_lock);
            shard.cv.wait(ul, [&]{ return !shard.queue.empty(); });
            req = shard.queue.front();
            shard.queue.pop();
        }
        try {
            std::string res;
            if      (req->type == "LIMIT_BUY")    res = process_limit_order("BID", ticker, req->qty, req->price, false, req->client_id);
            else if (req->type == "LIMIT_SELL")   res = process_limit_order("ASK", ticker, req->qty, req->price, false, req->client_id);
            else if (req->type == "MARKET_BUY")   res = process_limit_order("BID", ticker, req->qty, req->price, true, req->client_id);
            else if (req->type == "MARKET_SELL")  res = process_limit_order("ASK", ticker, req->qty, req->price, true, req->client_id);
            else if (req->type == "CANCEL_ORDER") res = process_cancel_order(ticker, req->order_id);
            else res = "REJECTED | Unknown order type.";
            req->result_promise.set_value(res);
        } catch (const std::exception& e) {
            try { req->result_promise.set_value(std::string("ERROR | ") + e.what()); } catch (...) {}
        } catch (...) {
            try { req->result_promise.set_value("ERROR | Unknown exception in order processor."); } catch (...) {}
        }
    }
}

// ============================================================================
//  SUBMIT ORDER REQUEST
//  Routes LIMIT_BUY/SELL to the ticker's shard.
//  Routes CANCEL_ORDER by looking up which ticker owns that order_id.
// ============================================================================

inline std::string submit_order_request(const std::string& type, const std::string& ticker_in,
                                        int qty, double price, int order_id = 0, const std::string& client_id = "") {
    std::string ticker = ticker_in;

    // For cancel: look up which ticker this order belongs to
    if (type == "CANCEL_ORDER") {
        std::lock_guard<std::mutex> lk(order_location_map_lock);
        auto it = order_location_map.find(order_id);
        if (it == order_location_map.end())
            return "REJECTED | Order #" + std::to_string(order_id) + " not found.";
        ticker = it->second.ticker;
    }

    if (!shards.count(ticker))
        return "REJECTED | No shard for '" + ticker + "'.";

    auto req = std::make_shared<OrderRequest>();
    req->type = type; req->ticker = ticker;
    req->qty = qty;   req->price = price; req->order_id = order_id;
    req->client_id = client_id;
    std::future<std::string> fut = req->result_promise.get_future();
    {
        std::lock_guard<std::mutex> lg(shards[ticker].queue_lock);
        shards[ticker].queue.push(req);
    }
    shards[ticker].cv.notify_one();
    return fut.get();
}

// ============================================================================
//  WAL REPLAY (runs once at startup, before threads)
// ============================================================================
inline void replay_wal() {
    std::ifstream wal(WAL_FILE);
    if (!wal.is_open()) return; 

    std::string line;
    int replayed = 0;
    int corrupted = 0;

    while (std::getline(wal, line)) {
        line = trim(line);
        if (line.empty()) continue;

        // New format: ACTION|TICKER|QTY|PRICE|TIMESTAMP|CRC32HEX
        // Find last '|' to extract checksum
        auto last_pipe = line.rfind('|');
        if (last_pipe == std::string::npos) {
            corrupted++;
            std::cerr << "[WAL REPLAY] Malformed line (no pipe), skipping.\n";
            continue;
        }

        std::string payload   = line.substr(0, last_pipe);
        std::string checksum  = line.substr(last_pipe + 1);

        // Verify CRC32 integrity
        if (checksum.size() == 8 && !verify_crc32(payload, checksum)) {
            corrupted++;
            std::cerr << "[WAL REPLAY] CRC32 MISMATCH — corrupted entry, skipping: " << payload << "\n";
            continue;
        }

        // If no checksum (old format), still try to replay for backward compatibility
        std::string parse_str = (checksum.size() == 8) ? payload : line;

        std::stringstream ss(parse_str);
        std::string action, ticker, qty_str, price_str, timestamp;
        std::getline(ss, action, '|');
        std::getline(ss, ticker, '|');
        std::getline(ss, qty_str, '|');
        std::getline(ss, price_str, '|');
        std::getline(ss, timestamp, '|');
        try {
            int qty = std::stoi(qty_str);
            double price = std::stod(price_str);

            if (action == "BUY" || action == "SELL") {
                // Market trade volume adjustment
                if (live_market_prices.find(ticker) != live_market_prices.end()) {
                    if (action == "BUY") live_market_prices[ticker].volume -= qty;
                    else if (action == "SELL") live_market_prices[ticker].volume += qty;
                    replayed++;
                }
            } else if (action == "LIMIT_BUY" || action == "LIMIT_SELL") {
                // Directly reconstruct the order book
                if (order_books.find(ticker) != order_books.end()) {
                    int new_oid = next_order_id.fetch_add(1);
                    if (action == "LIMIT_BUY") {
                        order_books[ticker].bids[price].push_back({new_oid, "BID", ticker, qty, price, timestamp, false});
                        auto& lvl = order_books[ticker].bids[price];
                        auto last_it = std::prev(lvl.end());
                        register_order_location(new_oid, ticker, price, "BID", last_it);
                    } else {
                        order_books[ticker].asks[price].push_back({new_oid, "ASK", ticker, qty, price, timestamp, false});
                        auto& lvl = order_books[ticker].asks[price];
                        auto last_it = std::prev(lvl.end());
                        register_order_location(new_oid, ticker, price, "ASK", last_it);
                    }
                    replayed++;
                }
            } else if (action == "CANCEL_ORDER") {
                // The order_id was logged in the 'qty' field for cancels
                int order_id = qty;
                // Replay cancel
                OrderLocation loc;
                bool found = false;
                {
                    std::lock_guard<std::mutex> lk(order_location_map_lock);
                    auto map_it = order_location_map.find(order_id);
                    if (map_it != order_location_map.end()) {
                        loc = map_it->second;
                        found = true;
                    }
                }
                if (found && loc.ticker == ticker && order_books.find(ticker) != order_books.end()) {
                    auto& book = order_books[ticker];
                    if (loc.side == "BID") {
                        auto lvl_it = book.bids.find(loc.price);
                        if (lvl_it != book.bids.end()) {
                            lvl_it->second.erase(loc.it);
                            if (lvl_it->second.empty()) book.bids.erase(lvl_it);
                        }
                    } else {
                        auto lvl_it = book.asks.find(loc.price);
                        if (lvl_it != book.asks.end()) {
                            lvl_it->second.erase(loc.it);
                            if (lvl_it->second.empty()) book.asks.erase(lvl_it);
                        }
                    }
                    unregister_order_id(order_id);
                    replayed++;
                }
            }
        } catch (...) {
            corrupted++;
        }
    }
    wal.close();
    if (replayed > 0)
        std::cout << "[WAL REPLAY] Recovered " << replayed << " entries." << std::endl;
    if (corrupted > 0)
        std::cerr << "[WAL REPLAY] WARNING: " << corrupted << " corrupted/invalid entries skipped." << std::endl;

    // FIX: Recover next_trade_id and next_order_id so they don't reset to 1
    int max_tid = 0;
    {
        std::lock_guard<std::mutex> lk(history_lock);
        for (const auto& t : trade_history) {
            if (t.trade_id > max_tid) max_tid = t.trade_id;
        }
    }
    next_trade_id.store(max_tid + 1);
    // Setting order ID safely above trade IDs to avoid collision with unlogged resting orders
    next_order_id.store(max_tid + 100000);
}
