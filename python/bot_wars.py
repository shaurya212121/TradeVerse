import zmq
import time
import multiprocessing
import random
import re

# All bots fight primarily over AAPL; Algo_Z also hits TSLA and GOOGL
BATTLE_TICKER = "AAPL"
TICKERS       = ["AAPL", "TSLA", "GOOGL"]

# ─────────────────────────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def fetch_live_price(socket, ticker):
    socket.send_string(f"FETCH:{ticker}")
    reply = socket.recv_string()
    try:
        price = float(re.search(r"Price: \$([0-9.]+)", reply).group(1))
        bid   = float(re.search(r"Bid: \$([0-9.]+)",   reply).group(1))
        ask   = float(re.search(r"Ask: \$([0-9.]+)",   reply).group(1))
        return price, bid, ask
    except Exception:
        return None, None, None

def is_ok(reply):
    return any(kw in reply for kw in ("SUCCESS", "FILLED", "PARTIAL", "RESTING"))

# ─────────────────────────────────────────────────────────────────────────────
#  BOT PERSONALITIES (NO SLEEPS = MAXIMUM LOAD)
# ─────────────────────────────────────────────────────────────────────────────

def bull_bot(bot_name, num_requests, target_ip):
    ctx    = zmq.Context()
    socket = ctx.socket(zmq.REQ)
    socket.connect(f"tcp://{target_ip}:5556")
    stats  = dict(success=0, rejected=0, limit_buy=0, market_buy=0)

    for _ in range(num_requests):
        price, bid, ask = fetch_live_price(socket, BATTLE_TICKER)
        if price is None: continue

        qty = random.randint(5, 30)
        if random.random() < 0.30:
            cmd = f"BUY:{BATTLE_TICKER}:{qty}"
            stats["market_buy"] += 1
        else:
            lp  = round(ask + random.uniform(0.05, 1.00), 2)
            cmd = f"LIMIT_BUY:{BATTLE_TICKER}:{qty}:{lp:.2f}"
            stats["limit_buy"] += 1

        socket.send_string(cmd)
        if is_ok(socket.recv_string()): stats["success"] += 1
        else: stats["rejected"] += 1

    socket.close()
    return bot_name, stats


def bear_bot(bot_name, num_requests, target_ip):
    ctx    = zmq.Context()
    socket = ctx.socket(zmq.REQ)
    socket.connect(f"tcp://{target_ip}:5556")
    stats  = dict(success=0, rejected=0, limit_sell=0, market_sell=0)

    for _ in range(num_requests):
        price, bid, ask = fetch_live_price(socket, BATTLE_TICKER)
        if price is None: continue

        qty = random.randint(5, 30)
        if random.random() < 0.30:
            cmd = f"SELL:{BATTLE_TICKER}:{qty}"
            stats["market_sell"] += 1
        else:
            lp  = max(round(bid - random.uniform(0.05, 1.00), 2), 1.0)
            cmd = f"LIMIT_SELL:{BATTLE_TICKER}:{qty}:{lp:.2f}"
            stats["limit_sell"] += 1

        socket.send_string(cmd)
        if is_ok(socket.recv_string()): stats["success"] += 1
        else: stats["rejected"] += 1

    socket.close()
    return bot_name, stats


def scalper_bot(bot_name, num_requests, target_ip):
    ctx    = zmq.Context()
    socket = ctx.socket(zmq.REQ)
    socket.connect(f"tcp://{target_ip}:5556")
    stats  = dict(success=0, rejected=0, limit_buy=0, limit_sell=0)

    for _ in range(num_requests):
        price, bid, ask = fetch_live_price(socket, BATTLE_TICKER)
        if price is None: continue

        qty = random.randint(1, 15)
        if random.random() < 0.5:
            lp  = round(bid + 0.01, 2)
            cmd = f"LIMIT_BUY:{BATTLE_TICKER}:{qty}:{lp:.2f}"
            stats["limit_buy"] += 1
        else:
            lp  = max(round(ask - 0.01, 2), 1.0)
            cmd = f"LIMIT_SELL:{BATTLE_TICKER}:{qty}:{lp:.2f}"
            stats["limit_sell"] += 1

        socket.send_string(cmd)
        if is_ok(socket.recv_string()): stats["success"] += 1
        else: stats["rejected"] += 1

    socket.close()
    return bot_name, stats


def whale_bot(bot_name, num_requests, target_ip):
    ctx    = zmq.Context()
    socket = ctx.socket(zmq.REQ)
    socket.connect(f"tcp://{target_ip}:5556")
    stats  = dict(success=0, rejected=0, buys=0, sells=0)

    for _ in range(num_requests):
        price, bid, ask = fetch_live_price(socket, BATTLE_TICKER)
        if price is None: continue

        qty  = random.randint(50, 150)
        if random.random() < 0.5:
            lp  = round(ask + random.uniform(0.50, 2.00), 2)
            cmd = f"LIMIT_BUY:{BATTLE_TICKER}:{qty}:{lp:.2f}"
            stats["buys"] += 1
        else:
            lp  = max(round(bid - random.uniform(0.50, 2.00), 2), 1.0)
            cmd = f"LIMIT_SELL:{BATTLE_TICKER}:{qty}:{lp:.2f}"
            stats["sells"] += 1

        socket.send_string(cmd)
        if is_ok(socket.recv_string()): stats["success"] += 1
        else: stats["rejected"] += 1

    socket.close()
    return bot_name, stats


def algo_bot(bot_name, num_requests, target_ip):
    ctx    = zmq.Context()
    socket = ctx.socket(zmq.REQ)
    socket.connect(f"tcp://{target_ip}:5556")
    stats  = dict(success=0, rejected=0, limit=0, market=0)

    for _ in range(num_requests):
        ticker = random.choice(TICKERS)
        price, bid, ask = fetch_live_price(socket, ticker)
        if price is None: continue

        qty  = random.randint(1, 20)
        side = "BUY" if random.random() < 0.5 else "SELL"

        if random.random() < 0.30:
            cmd = f"{side}:{ticker}:{qty}"
            stats["market"] += 1
        else:
            if side == "BUY":
                lp = max(round(ask + random.uniform(-0.50, 0.80), 2), 0.01)
                cmd = f"LIMIT_BUY:{ticker}:{qty}:{lp:.2f}"
            else:
                lp = max(round(bid + random.uniform(-0.80, 0.50), 2), 0.01)
                cmd = f"LIMIT_SELL:{ticker}:{qty}:{lp:.2f}"
            stats["limit"] += 1

        socket.send_string(cmd)
        if is_ok(socket.recv_string()): stats["success"] += 1
        else: stats["rejected"] += 1

    socket.close()
    return bot_name, stats


# ─────────────────────────────────────────────────────────────────────────────
#  DISPATCHER
# ─────────────────────────────────────────────────────────────────────────────

def run_bot(config, target_ip):
    name, fn, n = config
    return fn(name, n, target_ip)


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN - MASSIVE CONCURRENCY
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    TARGET_IP = "localhost"
    
    # We create 20 bots in parallel (4 of each personality) blasting 1000 orders each
    # Total Orders = 20,000 fetch + 20,000 place = 40,000 network requests
    ITERS = 1000
    BOT_CONFIGS = []
    for i in range(4):
        BOT_CONFIGS.extend([
            (f"Bull_Bot_{i}", bull_bot,    ITERS),
            (f"Bear_Cartel_{i}", bear_bot, ITERS),
            (f"Scalper_{i}",    scalper_bot, ITERS),
            (f"Whale_{i}",      whale_bot,   ITERS),
            (f"Algo_{i}",       algo_bot,    ITERS),
        ])

    SEP = "=" * 65
    print(SEP)
    print(f"  EXTREME BOT WARS  --  {len(BOT_CONFIGS)} concurrent intelligent bots")
    print(f"  Zero sleep delays. Maximum throughput test.")
    print(SEP)

    start_time = time.time()

    # Spawning process pool of size equal to number of bots to ensure true parallelism
    pool_size = min(len(BOT_CONFIGS), multiprocessing.cpu_count() * 2)
    with multiprocessing.Pool(pool_size) as pool:
        args    = [(cfg, TARGET_IP) for cfg in BOT_CONFIGS]
        results = pool.starmap(run_bot, args)

    end_time = time.time()

    total_ok  = 0
    total_rej = 0
    for name, stats in results:
        total_ok  += stats.get("success", 0)
        total_rej += stats.get("rejected", 0)

    grand_total = total_ok + total_rej
    # Each iteration does 1 FETCH and 1 ORDER = 2 network requests
    total_reqs  = grand_total * 2 
    elapsed     = end_time - start_time
    rps         = total_reqs / elapsed if elapsed > 0 else 0

    print(SEP)
    print(f"  Time elapsed       : {elapsed:.2f} seconds")
    print(f"  Total Trades Fired : {grand_total}")
    print(f"  Total Network Reqs : {total_reqs} (Fetch + Trade)")
    print(f"  Actual Throughput  : {rps:.0f} requests / sec (from Python)")
    print(SEP)
    print("  Note: Python multiprocessing adds massive IPC overhead.")
    print("  To hit 100,000+ rps with bot logic, we would write a bot_wars.cpp client!")
    print(SEP)
