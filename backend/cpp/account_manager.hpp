#pragma once
#include <string>
#include <unordered_map>
#include <mutex>
#include <sstream>
#include <iomanip>


struct Account {
    double cash = 100000.0;
    std::unordered_map<std::string, int> holdings;   // ticker → quantity owned
};

inline std::unordered_map<std::string, Account> accounts;
inline std::mutex accounts_lock;


inline void register_account(const std::string& client_id) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    if (accounts.find(client_id) == accounts.end()) {
        accounts[client_id] = Account{};
    }
}

inline bool account_exists(const std::string& client_id) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    return accounts.count(client_id) > 0;
}


inline std::string validate_buy(const std::string& client_id, const std::string& ticker,
                                 int qty, double estimated_price) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end())
        return "REJECTED | Unknown client '" + client_id + "'. Send REGISTER first.";

    double cost = qty * estimated_price;
    if (it->second.cash < cost) {
        std::ostringstream oss;
        oss << std::fixed << std::setprecision(2);
        oss << "REJECTED | Insufficient cash. Need $" << cost
            << " but have $" << it->second.cash << ".";
        return oss.str();
    }
    it->second.cash -= cost;
    return "";  // empty = OK
}

inline std::string validate_sell(const std::string& client_id, const std::string& ticker, int qty) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end())
        return "REJECTED | Unknown client '" + client_id + "'. Send REGISTER first.";

    int owned = 0;
    if (it->second.holdings.count(ticker))
        owned = it->second.holdings[ticker];

    if (owned < qty) {
        return "REJECTED | You own " + std::to_string(owned) + " shares of " + ticker +
               " but tried to sell " + std::to_string(qty) + ". Short selling not allowed.";
    }
    it->second.holdings[ticker] -= qty;
    return "";  // empty = OK
}


inline void settle_buy(const std::string& client_id, const std::string& ticker,
                       int qty, double exec_price, double estimated_price_reserved) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end()) return;

    double actual_cost = qty * exec_price;
    double original_reserved = qty * estimated_price_reserved;
    
    it->second.cash += (original_reserved - actual_cost);
    it->second.holdings[ticker] += qty;
}

inline void settle_sell(const std::string& client_id, const std::string& ticker,
                        int qty, double exec_price, int qty_reserved) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end()) return;

    int unfilled = qty_reserved - qty;
    if (unfilled > 0) {
        it->second.holdings[ticker] += unfilled;
    }

    it->second.cash += qty * exec_price;
    if (it->second.holdings[ticker] <= 0)
        it->second.holdings.erase(ticker);
}

inline void refund_buy(const std::string& client_id, int qty, double estimated_price) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end()) return;
    it->second.cash += (qty * estimated_price);
}

inline void refund_sell(const std::string& client_id, const std::string& ticker, int qty) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end()) return;
    it->second.holdings[ticker] += qty;
}


inline std::string get_account_display(const std::string& client_id) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end())
        return "ERROR | No account found for '" + client_id + "'.";

    const Account& acc = it->second;
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2);
    oss << "ACCOUNT | " << client_id << "\n" << std::string(50, '=') << "\n";
    oss << "  Cash Balance: $" << acc.cash << "\n";
    oss << std::string(50, '-') << "\n";

    if (acc.holdings.empty()) {
        oss << "  No holdings.\n";
    } else {
        oss << "  " << std::left << std::setw(14) << "TICKER"
            << std::setw(12) << "SHARES" << "\n";
        oss << "  " << std::string(26, '-') << "\n";
        for (const auto& [ticker, qty] : acc.holdings) {
            oss << "  " << std::left << std::setw(14) << ticker
                << std::setw(12) << qty << "\n";
        }
    }
    oss << std::string(50, '=');
    return oss.str();
}
