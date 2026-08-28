#pragma once
#include <string>
#include <unordered_map>
#include <mutex>
#include <deque>
#include <queue>
#include <atomic>
#include <fstream>
#include <iostream>
#include <thread>
#include <random>
#include <algorithm>
#include <condition_variable>
#include "utils.hpp"

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

inline std::unordered_map<std::string, StockInfo> live_market_prices;
inline std::mutex market_lock;

inline std::deque<TradeRecord> trade_history;
inline std::mutex history_lock;
inline std::atomic<int> next_trade_id{1};
inline std::atomic<bool> dirty_flag{false};

// Base prices loaded at startup — used for mean reversion
inline std::unordered_map<std::string, double> base_prices;

const std::string CSV_FILE       = "data/market_data1.csv";
const std::string WAL_FILE       = "logs/wal.log";
const std::string HISTORY_FILE   = "logs/trade_history.log";

const int FLUSH_INTERVAL_SEC = 5;
const size_t MAX_HISTORY_SIZE = 500;
const int PRICE_TICK_MS = 500;

const std::unordered_map<std::string, double> TICKER_VOLATILITY = {
    {"AAPL",        0.0012},
    {"TSLA",        0.0030},
    {"TCS.NS",      0.0010},
    {"RELIANCE.NS", 0.0015},
    {"HDFCBANK.NS", 0.0008},
    {"GOOGL",       0.0014},
    {"AMZN",        0.0018},
    {"MSFT",        0.0010},
    {"NVDA",        0.0035},
    {"INFY.NS",     0.0009},
};

// ============================================================================
//  ASYNC WAL QUEUE — disk writes happen off the hot path
// ============================================================================

struct WalEntry {
    std::string action;
    std::string ticker;
    int qty;
    double price;
    std::string timestamp;
    TradeRecord trade_record;   // also carries the history entry
    bool has_trade_record;      // false for WAL-only entries
};

inline std::queue<WalEntry>  wal_queue;
inline std::mutex            wal_queue_lock;
inline std::condition_variable wal_queue_cv;

// ---------- non-blocking push (called from trade threads) ----------
inline void wal_log(const std::string& action, const std::string& ticker, int qty, double price) {
    WalEntry entry;
    entry.action   = action;
    entry.ticker   = ticker;
    entry.qty      = qty;
    entry.price    = price;
    entry.timestamp = get_timestamp();
    entry.has_trade_record = false;
    {
        std::lock_guard<std::mutex> lk(wal_queue_lock);
        wal_queue.push(std::move(entry));
    }
    wal_queue_cv.notify_one();
}

// Overload: push WAL + trade-history entry in one shot
inline void wal_log_with_history(const std::string& action, const std::string& ticker,
                                 int qty, double price, const TradeRecord& rec) {
    WalEntry entry;
    entry.action   = action;
    entry.ticker   = ticker;
    entry.qty      = qty;
    entry.price    = price;
    entry.timestamp = get_timestamp();
    entry.trade_record = rec;
    entry.has_trade_record = true;
    {
        std::lock_guard<std::mutex> lk(wal_queue_lock);
        wal_queue.push(std::move(entry));
    }
    wal_queue_cv.notify_one();
}

// ---------- background writer thread ----------
inline void async_wal_writer_thread() {
    std::cout << "[INIT] Async WAL writer thread started." << std::endl;
    while (true) {
        WalEntry entry;
        {
            std::unique_lock<std::mutex> ul(wal_queue_lock);
            wal_queue_cv.wait(ul, []{ return !wal_queue.empty(); });
            entry = std::move(wal_queue.front());
            wal_queue.pop();
        }

        // --- WAL write (skip for history-only entries) ---
        if (!entry.action.empty()) {
            std::ofstream wal(WAL_FILE, std::ios::app);
            if (wal.is_open()) {
                wal << entry.action << "|" << entry.ticker << "|" << entry.qty << "|"
                    << std::fixed << std::setprecision(2) << entry.price << "|"
                    << entry.timestamp << "\n";
                // wal.flush();  // let OS buffer — background thread, no durability guarantee needed
            }
        }

        // --- Trade history write (if attached) ---
        if (entry.has_trade_record) {
            const auto& t = entry.trade_record;
            std::ofstream hist(HISTORY_FILE, std::ios::app);
            if (hist.is_open()) {
                hist << t.trade_id << "|" << t.action << "|" << t.ticker << "|"
                     << t.qty << "|" << std::fixed << std::setprecision(2) << t.price << "|"
                     << t.timestamp << "|" << (t.cancelled ? "CANCELLED" : "EXECUTED") << "\n";
                // hist.flush();
            }
            std::lock_guard<std::mutex> lk(history_lock);
            trade_history.push_back(t);
            if (trade_history.size() > MAX_HISTORY_SIZE) trade_history.pop_front();
        }
    }
}

// ---------- replay (runs once at startup, before threads) ----------
inline void replay_wal() {
    std::ifstream wal(WAL_FILE);
    if (!wal.is_open()) return; 

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
                if (action == "BUY") live_market_prices[ticker].volume -= qty;
                else if (action == "SELL") live_market_prices[ticker].volume += qty;
                replayed++;
            }
        } catch (...) {}
    }
    wal.close();
    if (replayed > 0) std::cout << "[WAL REPLAY] Recovered " << replayed << " pending trades." << std::endl;
}

// ---------- legacy sync helper (still used by cancel path) ----------
inline void log_trade_history(const TradeRecord& trade) {
    // Push to async queue so it gets written in the background
    WalEntry entry;
    entry.action = trade.action;
    entry.ticker = trade.ticker;
    entry.qty = trade.qty;
    entry.price = trade.price;
    entry.timestamp = trade.timestamp;
    entry.trade_record = trade;
    entry.has_trade_record = true;
    entry.action = "";  // no WAL line needed for history-only entries
    {
        std::lock_guard<std::mutex> lk(wal_queue_lock);
        wal_queue.push(std::move(entry));
    }
    wal_queue_cv.notify_one();
}

inline void sync_to_csv() {
    std::lock_guard<std::mutex> lock(market_lock);
    std::ofstream file(CSV_FILE, std::ios::trunc);
    if (!file.is_open()) return;

    file << "Date,Ticker,Price,Volume\n";
    for (const auto& [ticker, info] : live_market_prices) {
        file << info.timestamp << "," << ticker << "," << std::fixed << std::setprecision(2)
             << info.price << "," << info.volume << "\n";
    }
    file.close();

    std::ofstream wal_clear(WAL_FILE, std::ios::trunc);
    wal_clear.close();
}

inline void async_flush_thread() {
    std::cout << "[INIT] Async flush thread started." << std::endl;
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(FLUSH_INTERVAL_SEC));
        if (dirty_flag.exchange(false)) sync_to_csv();
    }
}

// ============================================================================
//  QUERY HELPERS — HISTORY
// ============================================================================

inline std::string get_history_display(int limit = 20) {
    std::lock_guard<std::mutex> lock(history_lock);
    if (trade_history.empty()) return "HISTORY | No trades recorded yet.";

    std::ostringstream oss;
    oss << "TRADE HISTORY (last " << std::min(limit, (int)trade_history.size()) << " trades)\n"
        << std::string(72, '=') << "\n";
    oss << std::left
        << std::setw(6)  << "ID"
        << std::setw(8)  << "ACTION"
        << std::setw(14) << "TICKER"
        << std::setw(8)  << "QTY"
        << std::setw(12) << "PRICE ($)"
        << std::setw(22) << "TIMESTAMP"
        << "STATUS\n" << std::string(72, '-') << "\n";

    int start = std::max(0, (int)trade_history.size() - limit);
    for (int i = (int)trade_history.size() - 1; i >= start; --i) {
        const auto& t = trade_history[i];
        oss << std::fixed << std::setprecision(2)
            << std::left << std::setw(6)  << t.trade_id
            << std::left << std::setw(8)  << t.action
            << std::left << std::setw(14) << t.ticker
            << std::left << std::setw(8)  << t.qty
            << std::left << std::setw(12) << t.price
            << std::left << std::setw(22) << t.timestamp
            << (t.cancelled ? "CANCELLED" : "EXECUTED") << "\n";
    }
    oss << std::string(72, '=');
    return oss.str();
}

// ============================================================================
//  PRICE SIMULATOR
// ============================================================================

inline void price_simulator_thread() {
    std::mt19937 rng(std::random_device{}());
    std::normal_distribution<double> norm(0.0, 1.0);
    std::cout << "[INIT] Price simulation engine started." << std::endl;

    while (true) {
        std::this_thread::sleep_for(std::chrono::milliseconds(PRICE_TICK_MS));
        std::lock_guard<std::mutex> lock(market_lock);
        std::string ts = get_timestamp();

        for (auto& [ticker, info] : live_market_prices) {
            double sigma = 0.0012;
            if (TICKER_VOLATILITY.count(ticker)) sigma = TICKER_VOLATILITY.at(ticker);

            double shock = sigma * norm(rng);
            double base = base_prices.count(ticker) ? base_prices[ticker] : info.price;
            double reversion = 0.02 * (base - info.price) / base;

            double new_price = info.price * (1.0 + shock + reversion);
            new_price = std::max(new_price, base * 0.01);
            new_price = std::round(new_price * 100.0) / 100.0;

            info.price = new_price;
            info.timestamp = ts;
        }
    }
}
