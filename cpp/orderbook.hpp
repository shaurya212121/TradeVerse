#pragma once
#include <string>
#include <map>
#include <deque>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <future>
#include <iostream>
#include "market_state.hpp"

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
};

struct OrderBook {
    std::map<double, std::deque<Order>, std::greater<double>> bids;
    std::map<double, std::deque<Order>>                       asks;
};

struct OrderRequest {
    std::string type;
    std::string ticker;
    int qty;
    double price;
    int order_id;
    std::promise<std::string> result_promise;
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

// order_id → ticker: lets CANCEL_ORDER route to the right shard without a global search
inline std::unordered_map<int, std::string> order_ticker_map;
inline std::mutex order_ticker_map_lock;

const int ORDERBOOK_DISPLAY_DEPTH = 10;

// ============================================================================
//  HELPERS — register / unregister order IDs for cancel routing
// ============================================================================

inline void register_order_id(int oid, const std::string& ticker) {
    std::lock_guard<std::mutex> lk(order_ticker_map_lock);
    order_ticker_map[oid] = ticker;
}

inline void unregister_order_id(int oid) {
    std::lock_guard<std::mutex> lk(order_ticker_map_lock);
    order_ticker_map.erase(oid);
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
// ============================================================================

inline std::string process_limit_order(const std::string& side, const std::string& ticker, int qty, double price) {
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
                    if (r.qty == 0) { unregister_order_id(r.order_id); q.pop_front(); }
                }
                if (q.empty()) book.asks.erase(it);
            }
            if (qty > 0) {
                new_oid = next_order_id.fetch_add(1);
                book.bids[price].push_back({new_oid, "BID", ticker, qty, price, ts, false});
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
                    if (r.qty == 0) { unregister_order_id(r.order_id); q.pop_front(); }
                }
                if (q.empty()) book.bids.erase(it);
            }
            if (qty > 0) {
                new_oid = next_order_id.fetch_add(1);
                book.asks[price].push_back({new_oid, "ASK", ticker, qty, price, ts, false});
            }
        }
    } // book_lock released here

    // Register resting order ID outside book_lock (safe — client doesn't have the ID yet)
    if (new_oid > 0) register_order_id(new_oid, ticker);

    // Log filled portion
    if (filled > 0) {
        std::string act = (side == "BID") ? "BUY" : "SELL";
        wal_log(act, ticker, filled, fill_val / filled);
        dirty_flag.store(true);
        log_trade_history({next_trade_id.fetch_add(1), act, ticker, filled, fill_val / filled, ts, false});
    }

    std::ostringstream oss;
    if (filled == original)    oss << "FILLED  | " << side << " " << filled << " " << ticker << " fully filled @ avg $" << std::fixed << std::setprecision(2) << (fill_val / filled);
    else if (filled > 0)       oss << "PARTIAL | " << side << " " << filled << "/" << original << " " << ticker << " filled | " << qty << " resting @ $" << price;
    else                       oss << "RESTING | " << side << " " << original << " " << ticker << " placed in book @ $" << price << " (order #" << new_oid << ")";
    return oss.str();
}

// ============================================================================
//  PROCESS CANCEL ORDER  (routed to the correct ticker's shard via order_ticker_map)
// ============================================================================

inline std::string process_cancel_order(const std::string& ticker, int order_id) {
    if (!shards.count(ticker)) return "REJECTED | Order #" + std::to_string(order_id) + " not found.";
    std::lock_guard<std::mutex> bk(shards[ticker].book_lock);
    auto& book = order_books[ticker];

    for (auto& [price, orders] : book.bids) {
        for (auto it = orders.begin(); it != orders.end(); ++it) {
            if (it->order_id == order_id) {
                std::string info = "SUCCESS | Cancelled BID order #" + std::to_string(order_id) + " (" + ticker + " @ $" + std::to_string(price) + ")";
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
                std::string info = "SUCCESS | Cancelled ASK order #" + std::to_string(order_id) + " (" + ticker + " @ $" + std::to_string(price) + ")";
                orders.erase(it);
                if (orders.empty()) book.asks.erase(price);
                unregister_order_id(order_id);
                return info;
            }
        }
    }
    return "REJECTED | Order #" + std::to_string(order_id) + " not found in " + ticker + " book.";
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
            if      (req->type == "LIMIT_BUY")    res = process_limit_order("BID", ticker, req->qty, req->price);
            else if (req->type == "LIMIT_SELL")   res = process_limit_order("ASK", ticker, req->qty, req->price);
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
                                        int qty, double price, int order_id = 0) {
    std::string ticker = ticker_in;

    // For cancel: look up which ticker this order belongs to
    if (type == "CANCEL_ORDER") {
        std::lock_guard<std::mutex> lk(order_ticker_map_lock);
        auto it = order_ticker_map.find(order_id);
        if (it == order_ticker_map.end())
            return "REJECTED | Order #" + std::to_string(order_id) + " not found.";
        ticker = it->second;
    }

    if (!shards.count(ticker))
        return "REJECTED | No shard for '" + ticker + "'.";

    auto req = std::make_shared<OrderRequest>();
    req->type = type; req->ticker = ticker;
    req->qty = qty;   req->price = price; req->order_id = order_id;
    std::future<std::string> fut = req->result_promise.get_future();
    {
        std::lock_guard<std::mutex> lg(shards[ticker].queue_lock);
        shards[ticker].queue.push(req);
    }
    shards[ticker].cv.notify_one();
    return fut.get();
}
