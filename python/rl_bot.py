"""
TradeVerse RL Bot — Single-Ticker Reinforcement Learning Agent
==============================================================
Architecture:
  • Subscribes to port 5555 (PUB stream) for live price ticks
  • Sends orders to  port 5556 (REQ/REP) for execution
  • Uses a tabular Q-learning (epsilon-greedy) policy

Actions:
  0 — HOLD        (do nothing)
  1 — MARKET BUY  (BUY:TICKER:QTY)
  2 — MARKET SELL (SELL:TICKER:QTY)
  3 — LIMIT BUY   (LIMIT_BUY:TICKER:QTY:PRICE)

State = (position_bucket, price_trend, spread_bucket)
  position_bucket : 0 = flat, 1 = long
  price_trend     : 0 = falling, 1 = flat, 2 = rising
  spread_bucket   : 0 = tight, 1 = wide

Reward shaping:
  +realised_pnl on a successful sell
  -0.05       per step as holding cost (encourages action)
  -1.0        on a rejected order
"""

import zmq
import time
import random
import re
import threading
import numpy as np
from collections import deque

# ─────────────────────────────────────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────────────────────────────────────
TICKER       = "AAPL"          # which stock the bot trades
ORDER_QTY    = 5               # shares per order
LIMIT_OFFSET = 0.50            # limit price = current_price - LIMIT_OFFSET for buys

# Q-Learning hyper-parameters
ALPHA        = 0.10            # learning rate
GAMMA        = 0.95            # discount factor
EPSILON      = 1.0             # starting exploration rate
EPSILON_MIN  = 0.05
EPSILON_DECAY= 0.995
MAX_STEPS    = 500             # episodes (price ticks the bot reacts to)

# ZeroMQ endpoints
SUB_ADDR     = "tcp://127.0.0.1:5555"
REQ_ADDR     = "tcp://127.0.0.1:5556"

# ─────────────────────────────────────────────────────────────────────────────
#  GLOBAL PRICE FEED   (filled by the SUB listener thread)
# ─────────────────────────────────────────────────────────────────────────────
price_feed = deque(maxlen=10)   # rolling window of last 10 prices
price_lock  = threading.Lock()
latest_price = None

def sub_listener(context):
    """Background thread: subscribes to PUB stream, keeps price_feed updated."""
    sub = context.socket(zmq.SUB)
    sub.connect(SUB_ADDR)
    sub.setsockopt_string(zmq.SUBSCRIBE, TICKER)   # only our ticker
    print(f"[BOT] Price feed subscribed for {TICKER} on {SUB_ADDR}")

    global latest_price
    while True:
        try:
            raw = sub.recv_string(zmq.NOBLOCK)
            # server publishes:  "TICKER,$PRICE"
            parts = raw.split(",")
            if len(parts) >= 2:
                price_str = parts[1].strip().lstrip("$")
                price = float(price_str)
                with price_lock:
                    price_feed.append(price)
                    latest_price = price
        except zmq.Again:
            time.sleep(0.05)   # no data yet — yield CPU
        except Exception:
            time.sleep(0.1)

# ─────────────────────────────────────────────────────────────────────────────
#  STATE ENCODING
# ─────────────────────────────────────────────────────────────────────────────

def get_trend(prices):
    """0=falling, 1=flat, 2=rising based on last 3 ticks."""
    if len(prices) < 3:
        return 1
    delta = prices[-1] - prices[-3]
    if delta > 0.05:
        return 2
    elif delta < -0.05:
        return 0
    return 1

def get_spread_bucket(bid, ask):
    """0=tight (<0.20), 1=wide."""
    return 0 if (ask - bid) < 0.20 else 1

def encode_state(position_bucket, trend, spread_bucket):
    return (position_bucket, trend, spread_bucket)

# ─────────────────────────────────────────────────────────────────────────────
#  ZMQ HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def send_command(socket, cmd):
    """Send a command string and return the server reply."""
    try:
        socket.send_string(cmd)
        reply = socket.recv_string()
        return reply
    except zmq.Again:
        return "TIMEOUT"
    except Exception as e:
        return f"ERROR|{e}"

def parse_price_from_response(response):
    match = re.search(r"\$([0-9]+\.[0-9]+)", response)
    return float(match.group(1)) if match else None

def fetch_bid_ask(socket, ticker):
    """Return (best_bid, best_ask) or (0, 0) on failure."""
    reply = send_command(socket, f"FETCH:{ticker}")
    bid = ask = 0.0
    m_bid = re.search(r"Bid: \$([0-9.]+)", reply)
    m_ask = re.search(r"Ask: \$([0-9.]+)", reply)
    if m_bid:
        bid = float(m_bid.group(1))
    if m_ask:
        ask = float(m_ask.group(1))
    return bid, ask

# ─────────────────────────────────────────────────────────────────────────────
#  REWARD CALCULATION
# ─────────────────────────────────────────────────────────────────────────────

def compute_reward(action, response, buy_price, current_price):
    """
    action        — 0..3
    response      — raw server reply string
    buy_price     — avg cost basis (None if flat)
    current_price — latest market price
    """
    if "TIMEOUT" in response or ("ERROR" in response and "Server" not in response):
        return -0.5

    if response.startswith("REJECTED"):
        return -1.0

    if action == 0:                         # HOLD — small cost
        return -0.05

    if action == 1 or action == 3:          # BUY / LIMIT_BUY
        if response.startswith("SUCCESS") or response.startswith("RESTING"):
            return 0.10                     # positive for getting into a position
        return -0.5

    if action == 2:                         # SELL
        if response.startswith("SUCCESS") and buy_price is not None:
            exec_price = parse_price_from_response(response)
            if exec_price:
                pnl = (exec_price - buy_price) * ORDER_QTY
                return pnl                  # raw PnL as reward
        return -0.5

    return 0.0

# ─────────────────────────────────────────────────────────────────────────────
#  ACTION DISPATCHER
# ─────────────────────────────────────────────────────────────────────────────

def execute_action(socket, action, ticker, qty, current_price):
    if action == 0:
        return "HOLD"
    elif action == 1:
        cmd = f"BUY:{ticker}:{qty}"
    elif action == 2:
        cmd = f"SELL:{ticker}:{qty}"
    elif action == 3:
        limit_price = round(current_price - LIMIT_OFFSET, 2)
        cmd = f"LIMIT_BUY:{ticker}:{qty}:{limit_price}"
    else:
        return "UNKNOWN"

    response = send_command(socket, cmd)
    return response

# ─────────────────────────────────────────────────────────────────────────────
#  Q-TABLE
# ─────────────────────────────────────────────────────────────────────────────
Q = {}

def get_q(state):
    if state not in Q:
        Q[state] = np.zeros(4, dtype=float)
    return Q[state]

def choose_action(state, epsilon):
    if random.random() < epsilon:
        return random.randint(0, 3)
    return int(np.argmax(get_q(state)))

def update_q(state, action, reward, next_state):
    q_vals      = get_q(state)
    next_max    = float(np.max(get_q(next_state)))
    q_vals[action] += ALPHA * (reward + GAMMA * next_max - q_vals[action])


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN RL LOOP
# ─────────────────────────────────────────────────────────────────────────────

def main():
    global EPSILON

    print("=" * 60)
    print("  TRADEVERSE RL BOT")
    print(f"  Ticker: {TICKER}  |  Qty per order: {ORDER_QTY}")
    print(f"  Alpha: {ALPHA}  Gamma: {GAMMA}  epsilon-start: {EPSILON}")
    print("=" * 60)

    context = zmq.Context()

    # ── Start background price-feed listener ──────────────────────────────────
    feed_thread = threading.Thread(target=sub_listener, args=(context,), daemon=True)
    feed_thread.start()

    # ── REQ socket for trade execution ────────────────────────────────────────
    req_sock = context.socket(zmq.REQ)
    req_sock.setsockopt(zmq.RCVTIMEO, 5000)   # 5s timeout
    req_sock.connect(REQ_ADDR)
    print(f"[BOT] Trade socket connected to {REQ_ADDR}\n")

    # Wait until we have at least 3 price ticks before acting
    print("[BOT] Waiting for price feed warm-up (3 ticks)...")
    while True:
        with price_lock:
            n = len(price_feed)
        if n >= 3:
            break
        time.sleep(0.5)
    print("[BOT] Price feed warm — starting RL loop.\n")

    # ── Bot state ─────────────────────────────────────────────────────────────
    position     = 0        # 0 = flat, shares held otherwise
    buy_price    = None     # avg cost basis
    total_reward = 0.0
    step         = 0

    ACTION_NAMES = ["HOLD", "MARKET BUY", "MARKET SELL", "LIMIT BUY"]

    while step < MAX_STEPS:
        step += 1

        # ── Observe current state ─────────────────────────────────────────────
        with price_lock:
            prices  = list(price_feed)
        current_price = prices[-1]
        trend         = get_trend(prices)
        bid, ask      = fetch_bid_ask(req_sock, TICKER)
        spread_bucket = get_spread_bucket(bid, ask)
        pos_bucket    = 1 if position > 0 else 0
        state         = encode_state(pos_bucket, trend, spread_bucket)

        # ── Choose action (epsilon-greedy with illegal action masking) ─────────
        q_vals  = get_q(state).copy()
        if position == 0:
            q_vals[2] = -999   # mask SELL when flat
        if position > 0:
            q_vals[1] = -999   # mask MARKET BUY when already long
            q_vals[3] = -999   # mask LIMIT BUY  when already long

        if random.random() < EPSILON:
            # Random but still legal
            legal = [0]
            if position == 0: legal += [1, 3]
            if position > 0:  legal += [2]
            action = random.choice(legal)
        else:
            action = int(np.argmax(q_vals))

        # ── Execute ───────────────────────────────────────────────────────────
        response = execute_action(req_sock, action, TICKER, ORDER_QTY, current_price)

        # ── Compute reward ────────────────────────────────────────────────────
        reward = compute_reward(action, response, buy_price, current_price)
        total_reward += reward

        # ── Update portfolio state ────────────────────────────────────────────
        if response.startswith("SUCCESS") or response.startswith("RESTING"):
            if action in (1, 3) and position == 0:
                position  = ORDER_QTY
                buy_price = current_price
            elif action == 2 and position > 0:
                position  = 0
                buy_price = None

        # ── Observe next state ────────────────────────────────────────────────
        time.sleep(1.0)   # wait for next price tick (simulator fires every 500ms)
        with price_lock:
            next_prices = list(price_feed)
        next_price     = next_prices[-1]
        next_trend     = get_trend(next_prices)
        next_bid, next_ask = fetch_bid_ask(req_sock, TICKER)
        next_spread    = get_spread_bucket(next_bid, next_ask)
        next_pos       = 1 if position > 0 else 0
        next_state     = encode_state(next_pos, next_trend, next_spread)

        # ── Update Q-table ────────────────────────────────────────────────────
        update_q(state, action, reward, next_state)

        # ── Decay epsilon ─────────────────────────────────────────────────────
        EPSILON = max(EPSILON_MIN, EPSILON * EPSILON_DECAY)

        # ── Logging ───────────────────────────────────────────────────────────
        trend_label  = ["DOWN", "FLAT", "UP  "][trend]
        spread_label = ["TIGHT", "WIDE"][spread_bucket]
        pos_label    = f"LONG {position}sh" if position > 0 else "FLAT     "

        print(
            f"[Step {step:>4}] "
            f"Price: ${current_price:>8.2f}  "
            f"Trend: {trend_label}  "
            f"Spread: {spread_label}  "
            f"Pos: {pos_label}  "
            f"Action: {ACTION_NAMES[action]:<12}  "
            f"Reward: {reward:>+7.3f}  "
            f"Total: {total_reward:>+9.3f}  "
            f"e: {EPSILON:.3f}"
        )
        if response not in ("HOLD", "UNKNOWN"):
            server_line = response.split("\n")[0]
            print(f"          Server: {server_line}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  RL BOT SESSION COMPLETE")
    print(f"  Steps run   : {step}")
    print(f"  Total reward: {total_reward:+.3f}")
    print(f"  Final e     : {EPSILON:.4f}")
    print(f"  Q-table size: {len(Q)} states visited")
    print("=" * 60)

    req_sock.close()
    context.term()


if __name__ == "__main__":
    main()
