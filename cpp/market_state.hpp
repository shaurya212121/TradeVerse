#pragma once
#include <string>
#include <unordered_map>
#include <mutex>
#include <deque>
#include <atomic>
#include <fstream>
#include <iostream>
#include <thread>
#include <random>
#include <algorithm>
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
//  LOGGING & FLUSHING
// ============================================================================

inline void wal_log(const std::string& action, const std::string& ticker, int qty, double price) {
    std::ofstream wal(WAL_FILE, std::ios::app);
    if (!wal.is_open()) return;
    wal << action << "|" << ticker << "|" << qty << "|"
        << std::fixed << std::setprecision(2) << price << "|"
        << get_timestamp() << "\n";
    wal.flush();
}

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

inline void log_trade_history(const TradeRecord& trade) {
    std::ofstream hist(HISTORY_FILE, std::ios::app);
    if (hist.is_open()) {
        hist << trade.trade_id << "|" << trade.action << "|" << trade.ticker << "|"
             << trade.qty << "|" << std::fixed << std::setprecision(2) << trade.price << "|"
             << trade.timestamp << "|" << (trade.cancelled ? "CANCELLED" : "EXECUTED") << "\n";
        hist.flush();
    }
    std::lock_guard<std::mutex> lock(history_lock);
    trade_history.push_back(trade);
    if (trade_history.size() > MAX_HISTORY_SIZE) trade_history.pop_front();
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
