#include <zmq.hpp>
#include <iostream>
#include <filesystem>
#include <vector>
#include "utils.hpp"
#include "market_state.hpp"
#include "orderbook.hpp"

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
            return "SUCCESS | Bought " + std::to_string(qty) + " " + ticker;
        }
    } else if (action == "SELL") {
        int sellable = get_sellable_qty(ticker);
        if (sellable < qty) return "REJECTED | Insufficient bid-side liquidity!";

        stock.volume += qty;
        wal_log("SELL", ticker, qty, stock.price);
        dirty_flag.store(true);
        log_trade_history({tid, "SELL", ticker, qty, stock.price, ts, false});
        return "SUCCESS | Sold " + std::to_string(qty) + " " + ticker;
    }
    return "REJECTED | Invalid action.";
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

        if (client_msg.rfind("LIMIT_BUY:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string cmd, ticker, qty_str, price_str;
            std::getline(ss, cmd, ':'); std::getline(ss, ticker, ':');
            std::getline(ss, qty_str, ':'); std::getline(ss, price_str, ':');
            try {
                reply_msg = submit_order_request("LIMIT_BUY", ticker, std::stoi(qty_str), std::stod(price_str));
            } catch (...) { reply_msg = "REJECTED | Invalid params."; }
        }
        else if (client_msg.rfind("LIMIT_SELL:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string cmd, ticker, qty_str, price_str;
            std::getline(ss, cmd, ':'); std::getline(ss, ticker, ':');
            std::getline(ss, qty_str, ':'); std::getline(ss, price_str, ':');
            try {
                reply_msg = submit_order_request("LIMIT_SELL", ticker, std::stoi(qty_str), std::stod(price_str));
            } catch (...) { reply_msg = "REJECTED | Invalid params."; }
        }
        else if (client_msg.rfind("ORDERBOOK:", 0) == 0) {
            reply_msg = get_orderbook_display(trim(client_msg.substr(10)));
        }
        else if (client_msg.rfind("CANCEL_ORDER:", 0) == 0) {
            try {
                reply_msg = submit_order_request("CANCEL_ORDER", "", 0, 0, std::stoi(trim(client_msg.substr(13))));
            } catch (...) { reply_msg = "REJECTED | Invalid ID."; }
        }
        else if (client_msg.rfind("BUY:", 0) == 0 || client_msg.rfind("SELL:", 0) == 0) {
            std::stringstream ss(client_msg);
            std::string action, ticker, qty_str;
            std::getline(ss, action, ':'); std::getline(ss, ticker, ':'); std::getline(ss, qty_str, ':');
            try {
                reply_msg = execute_trade(action, ticker, std::stoi(qty_str));
            } catch (...) { reply_msg = "REJECTED | Invalid qty."; }
        }
        else if (client_msg.rfind("FETCH:", 0) == 0) {
            std::string target = trim(client_msg.substr(6));
            std::lock_guard<std::mutex> lock(market_lock);
            if (live_market_prices.count(target)) {
                auto& info = live_market_prices[target];
                auto [bid, ask] = get_best_bid_ask(target);
                reply_msg = "SUCCESS | " + target + " | Price: $" + std::to_string(info.price) + 
                            " | Bid: $" + std::to_string(bid) + " / Ask: $" + std::to_string(ask);
            } else reply_msg = "ERROR | Asset not found.";
        }
        else {
            reply_msg = "ACK: Command received.";
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

    std::cout << "[INIT] Multithreaded Control Plane active." << std::endl;
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
    if (!file.is_open()) return 1;

    std::string line;
    std::getline(file, line); // Skip header

    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string ts, tkr, prc, vol;
        std::getline(ss, ts, ','); std::getline(ss, tkr, ',');
        std::getline(ss, prc, ','); std::getline(ss, vol, ',');
        
        try {
            live_market_prices[trim(tkr)] = {trim(ts), std::stod(trim(prc)), std::stoi(trim(vol))};
        } catch (...) {}
    }
    file.close();

    for (const auto& [ticker, info] : live_market_prices) {
        base_prices[ticker] = info.price;
        seed_orderbook(ticker, info.price);
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

    while (true) {
        {
            std::lock_guard<std::mutex> lock(market_lock);
            for (const auto& [ticker, info] : live_market_prices) {
                std::string msg = ticker + ",$" + std::to_string(info.price);
                zmq::message_t zmq_msg(msg.size());
                memcpy(zmq_msg.data(), msg.data(), msg.size());
                publisher.send(zmq_msg, zmq::send_flags::none);
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    }
    return 0;
}