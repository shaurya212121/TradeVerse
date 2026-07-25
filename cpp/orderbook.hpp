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
//  ORDER BOOK STRUCTURES
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
    std::map<double, std::deque<Order>> asks;
};

struct OrderRequest {
    std::string type;
    std::string ticker;
    int qty;
    double price;
    int order_id;
    std::promise<std::string> result_promise;
};

inline std::unordered_map<std::string, OrderBook> order_books;
inline std::mutex orderbook_lock;
inline std::atomic<int> next_order_id{1};

inline std::queue<std::shared_ptr<OrderRequest>> order_queue;
inline std::mutex queue_lock;
inline std::condition_variable queue_cv;

const int ORDERBOOK_DISPLAY_DEPTH = 10;

// ============================================================================
//  ORDER BOOK ENGINE
// ============================================================================

inline void seed_orderbook(const std::string& ticker, double base_price) {
    std::lock_guard<std::mutex> lock(orderbook_lock);
    OrderBook& book = order_books[ticker];
    std::mt19937 rng(std::hash<std::string>{}(ticker));
    std::uniform_int_distribution<int> qty_dist(50, 500);
    std::string ts = get_timestamp();

    for (int i = 1; i <= 8; ++i) {
        double ask_price = std::round((base_price * (1.0 + i * 0.002)) * 100.0) / 100.0;
        int oid = next_order_id.fetch_add(1);
        book.asks[ask_price].push_back({oid, "ASK", ticker, qty_dist(rng), ask_price, ts, true});
    }
    for (int i = 1; i <= 8; ++i) {
        double bid_price = std::round((base_price * (1.0 - i * 0.002)) * 100.0) / 100.0;
        int oid = next_order_id.fetch_add(1);
        book.bids[bid_price].push_back({oid, "BID", ticker, qty_dist(rng), bid_price, ts, true});
    }
}

inline int get_buyable_qty(const std::string& ticker) {
    std::lock_guard<std::mutex> lock(orderbook_lock);
    if (!order_books.count(ticker)) return 0;
    int total = 0;
    for (const auto& [price, orders] : order_books[ticker].asks)
        for (const auto& o : orders) total += o.qty;
    return total;
}

inline int get_sellable_qty(const std::string& ticker) {
    std::lock_guard<std::mutex> lock(orderbook_lock);
    if (!order_books.count(ticker)) return 0;
    int total = 0;
    for (const auto& [price, orders] : order_books[ticker].bids)
        for (const auto& o : orders) total += o.qty;
    return total;
}

inline std::pair<double, double> get_best_bid_ask(const std::string& ticker) {
    std::lock_guard<std::mutex> lock(orderbook_lock);
    double best_bid = 0.0, best_ask = 0.0;
    if (order_books.count(ticker)) {
        if (!order_books[ticker].bids.empty()) best_bid = order_books[ticker].bids.begin()->first;
        if (!order_books[ticker].asks.empty()) best_ask = order_books[ticker].asks.begin()->first;
    }
    return {best_bid, best_ask};
}

inline std::string get_orderbook_display(const std::string& ticker, int depth = ORDERBOOK_DISPLAY_DEPTH) {
    std::lock_guard<std::mutex> lock(orderbook_lock);
    if (!order_books.count(ticker)) return "ERROR | No order book found for '" + ticker + "'.";

    const auto& book = order_books[ticker];
    std::ostringstream oss;
    oss << "ORDERBOOK | " << ticker << "\n" << std::string(48, '=') << "\n";
    oss << "         ASKS (Sellers)\n  " << std::string(38, '-') << "\n";

    std::vector<std::pair<double, int>> ask_levels;
    for (const auto& [price, orders] : book.asks) {
        int level_qty = 0;
        for (const auto& o : orders) level_qty += o.qty;
        ask_levels.push_back({price, level_qty});
        if ((int)ask_levels.size() >= depth) break;
    }

    for (int i = (int)ask_levels.size() - 1; i >= 0; --i) {
        oss << "   $" << std::fixed << std::setprecision(2) << std::setw(10) << ask_levels[i].first
            << "     x " << std::setw(6) << ask_levels[i].second << "\n";
    }

    double best_bid = book.bids.empty() ? 0.0 : book.bids.begin()->first;
    double best_ask = book.asks.empty() ? 0.0 : book.asks.begin()->first;
    double spread = (best_ask > 0 && best_bid > 0) ? (best_ask - best_bid) : 0.0;

    oss << "  " << std::string(38, '-') << "\n   >>> SPREAD: $" << spread << " <<<\n  " << std::string(38, '-') << "\n";

    int bid_count = 0;
    for (const auto& [price, orders] : book.bids) {
        int level_qty = 0;
        for (const auto& o : orders) level_qty += o.qty;
        oss << "   $" << std::fixed << std::setprecision(2) << std::setw(10) << price
            << "     x " << std::setw(6) << level_qty << "\n";
        if (++bid_count >= depth) break;
    }
    oss << "  " << std::string(38, '-') << "\n         BIDS (Buyers)\n" << std::string(48, '=') << "\n";
    return oss.str();
}

inline std::string process_limit_order(const std::string& side, const std::string& ticker, int qty, double price) {
    std::lock_guard<std::mutex> olock(orderbook_lock);
    if (!order_books.count(ticker)) return "REJECTED | No order book for '" + ticker + "'.";

    OrderBook& book = order_books[ticker];
    std::string ts = get_timestamp();
    int original_qty = qty;
    int filled_qty = 0;
    double total_fill_value = 0.0;

    if (side == "BID") {
        while (qty > 0 && !book.asks.empty()) {
            auto it = book.asks.begin();
            if (it->first > price) break;
            auto& queue = it->second;
            while (qty > 0 && !queue.empty()) {
                Order& resting = queue.front();
                int fill = std::min(qty, resting.qty);
                qty -= fill; resting.qty -= fill; filled_qty += fill;
                total_fill_value += fill * resting.price;
                if (resting.qty == 0) queue.pop_front();
            }
            if (queue.empty()) book.asks.erase(it);
        }
        if (qty > 0) book.bids[price].push_back({next_order_id.fetch_add(1), "BID", ticker, qty, price, ts, false});
    } else {
        while (qty > 0 && !book.bids.empty()) {
            auto it = book.bids.begin();
            if (it->first < price) break;
            auto& queue = it->second;
            while (qty > 0 && !queue.empty()) {
                Order& resting = queue.front();
                int fill = std::min(qty, resting.qty);
                qty -= fill; resting.qty -= fill; filled_qty += fill;
                total_fill_value += fill * resting.price;
                if (resting.qty == 0) queue.pop_front();
            }
            if (queue.empty()) book.bids.erase(it);
        }
        if (qty > 0) book.asks[price].push_back({next_order_id.fetch_add(1), "ASK", ticker, qty, price, ts, false});
    }

    std::ostringstream oss;
    if (filled_qty == original_qty) {
        oss << "FILLED | " << side << " " << filled_qty << " " << ticker << " fully filled @ avg $" << (total_fill_value / filled_qty);
    } else if (filled_qty > 0) {
        oss << "PARTIAL | " << side << " " << filled_qty << "/" << original_qty << " " << ticker << " filled | " << qty << " resting";
    } else {
        oss << "RESTING | " << side << " " << original_qty << " " << ticker << " placed in book @ $" << price;
    }

    if (filled_qty > 0) {
        std::string act = (side == "BID") ? "BUY" : "SELL";
        wal_log(act, ticker, filled_qty, total_fill_value / filled_qty);
        dirty_flag.store(true);
        log_trade_history({next_trade_id.fetch_add(1), act, ticker, filled_qty, total_fill_value / filled_qty, ts, false});
    }
    return oss.str();
}

inline std::string process_cancel_order(int order_id) {
    std::lock_guard<std::mutex> lock(orderbook_lock);
    for (auto& [ticker, book] : order_books) {
        for (auto& [price, orders] : book.bids) {
            for (auto it = orders.begin(); it != orders.end(); ++it) {
                if (it->order_id == order_id) {
                    std::string info = "SUCCESS | Cancelled " + it->side + " order #" + std::to_string(order_id);
                    orders.erase(it); if (orders.empty()) book.bids.erase(price);
                    return info;
                }
            }
        }
        for (auto& [price, orders] : book.asks) {
            for (auto it = orders.begin(); it != orders.end(); ++it) {
                if (it->order_id == order_id) {
                    std::string info = "SUCCESS | Cancelled " + it->side + " order #" + std::to_string(order_id);
                    orders.erase(it); if (orders.empty()) book.asks.erase(price);
                    return info;
                }
            }
        }
    }
    return "REJECTED | Order #" + std::to_string(order_id) + " not found.";
}

inline void order_queue_processor_thread() {
    std::cout << "[INIT] Order queue processor started." << std::endl;
    while (true) {
        std::shared_ptr<OrderRequest> req;
        {
            std::unique_lock<std::mutex> ulock(queue_lock);
            queue_cv.wait(ulock, [] { return !order_queue.empty(); });
            req = order_queue.front();
            order_queue.pop();
        }
        std::string res;
        if (req->type == "LIMIT_BUY") res = process_limit_order("BID", req->ticker, req->qty, req->price);
        else if (req->type == "LIMIT_SELL") res = process_limit_order("ASK", req->ticker, req->qty, req->price);
        else if (req->type == "CANCEL_ORDER") res = process_cancel_order(req->order_id);
        req->result_promise.set_value(res);
    }
}

inline std::string submit_order_request(const std::string& type, const std::string& ticker, int qty, double price, int order_id = 0) {
    auto req = std::make_shared<OrderRequest>();
    req->type = type; req->ticker = ticker; req->qty = qty; req->price = price; req->order_id = order_id;
    std::future<std::string> fut = req->result_promise.get_future();
    {
        std::lock_guard<std::mutex> lg(queue_lock);
        order_queue.push(req);
    }
    queue_cv.notify_one();
    return fut.get();
}
