#pragma once
#include <string>
#include <unordered_map>
#include <mutex>
#include <sstream>
#include <iomanip>

// ============================================================================
//  ACCOUNT MANAGER — Server-side client ownership & risk checks
//
//  Every client has:
//    - A cash balance (default $100,000)
//    - Per-ticker share holdings
//
//  Pre-trade checks:
//    - BUY:  client must have enough cash (qty * estimated_price)
//    - SELL: client must own enough shares of that ticker
//
//  The engine enforces these; the Python client is now a dumb terminal.
// ============================================================================

struct Account {
    double cash = 100000.0;
    std::unordered_map<std::string, int> holdings;   // ticker → quantity owned
};

// Global account registry — protected by accounts_lock
inline std::unordered_map<std::string, Account> accounts;
inline std::mutex accounts_lock;

// ── Registration ──────────────────────────────────────────────────────────────

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

// ── Pre-Trade Validation ──────────────────────────────────────────────────────

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
    // FIX: Atomically reserve the cash to prevent TOCTOU double-spend bugs!
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
    // FIX: Atomically reserve the shares
    it->second.holdings[ticker] -= qty;
    return "";  // empty = OK
}

// ── Post-Trade Settlement ─────────────────────────────────────────────────────
// Called AFTER the engine confirms a trade executed successfully.

inline void settle_buy(const std::string& client_id, const std::string& ticker,
                       int qty, double exec_price, double estimated_price_reserved) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end()) return;

    double actual_cost = qty * exec_price;
    double original_reserved = qty * estimated_price_reserved;
    
    // Refund any unused cash from the reservation (e.g. if we got a better VWAP price)
    it->second.cash += (original_reserved - actual_cost);
    it->second.holdings[ticker] += qty;
}

inline void settle_sell(const std::string& client_id, const std::string& ticker,
                        int qty, double exec_price, int qty_reserved) {
    std::lock_guard<std::mutex> lk(accounts_lock);
    auto it = accounts.find(client_id);
    if (it == accounts.end()) return;

    // Shares were already reserved/deducted during validation.
    // If the order was only partially filled, refund the un-sold shares.
    int unfilled = qty_reserved - qty;
    if (unfilled > 0) {
        it->second.holdings[ticker] += unfilled;
    }

    it->second.cash += qty * exec_price;
    if (it->second.holdings[ticker] <= 0)
        it->second.holdings.erase(ticker);
}

// ── Refund on Total Rejection ─────────────────────────────────────────────────
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

// ── Query ─────────────────────────────────────────────────────────────────────

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
