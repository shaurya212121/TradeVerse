import zmq
import time
import re
import threading
import random

SERVER_URL = "tcp://127.0.0.1:5556"

def get_socket():
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(SERVER_URL)
    return sock

def send_cmd(sock, cmd):
    sock.send_string(cmd)
    return sock.recv_string()

def extract_order_id(reply):
    match = re.search(r"\(order #(\d+)\)", reply)
    return int(match.group(1)) if match else -1

def get_resting_qty(ob_str, price):
    for line in ob_str.split("\n"):
        if f"{price:.2f}" in line and "x" in line:
            return int(line.split("x")[1].strip())
    return 0

def get_spread_prices(ob_str):
    asks = []
    bids = []
    mode = "ASKS"
    for line in ob_str.split("\n"):
        if "SPREAD" in line:
            mode = "BIDS"
            continue
        if "$" in line and "x" in line:
            try:
                price = float(line.split("$")[1].split("x")[0].strip())
                if mode == "ASKS":
                    asks.append(price)
                else:
                    bids.append(price)
            except:
                pass
    lowest_ask = min(asks) if asks else 100.0
    highest_bid = max(bids) if bids else 0.0

    if lowest_ask <= highest_bid:
        return round(highest_bid + 1.0, 2), round(highest_bid + 2.0, 2)

    p1 = round(highest_bid + (lowest_ask - highest_bid) * 0.33, 2)
    p2 = round(highest_bid + (lowest_ask - highest_bid) * 0.66, 2)
    return p1, p2

print("\n" + "="*50)
print(" PRIORITY 1: ORDER-BOOK CORRECTNESS TESTS ")
print("="*50 + "\n")

sock = get_socket()
TEST_TICKER = "AAPL"

initial_ob = send_cmd(sock, f"ORDERBOOK:{TEST_TICKER}")
PRICE_1, PRICE_2 = get_spread_prices(initial_ob)
print(f"Dynamically calculated empty spread prices: {PRICE_1}, {PRICE_2}")

print("\n--- TEST 1: CONSERVATION CHECK ---")
print("Goal: Total BUY qty matched must equal total SELL qty consumed.")

send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:1000:{PRICE_1}")
send_cmd(sock, f"LIMIT_SELL:{TEST_TICKER}:500:{PRICE_1}")
time.sleep(0.2)

ob = send_cmd(sock, f"ORDERBOOK:{TEST_TICKER}")
qty = get_resting_qty(ob, PRICE_1)

if qty == 500:
    print("✅ PASS: Exactly 500 shares remain in the book.")
else:
    print(f"❌ FAIL: Expected 500 shares, but found {qty}.")


print("\n--- TEST 2: TIME PRIORITY CHECK ---")
print("Goal: Two identical LIMIT_BUYs. First one submitted must fill first.")

r1 = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:100:{PRICE_2}")
r2 = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:100:{PRICE_2}")
id1 = extract_order_id(r1)
id2 = extract_order_id(r2)

if id1 == -1 or id2 == -1:
    print(f"❌ FAIL: Could not extract order IDs (r1={r1.strip()!r}, r2={r2.strip()!r})")
else:
    send_cmd(sock, f"LIMIT_SELL:{TEST_TICKER}:100:{PRICE_2}")
    time.sleep(0.2)

    c1 = send_cmd(sock, f"CANCEL_ORDER:{id1}")
    c2 = send_cmd(sock, f"CANCEL_ORDER:{id2}")

    print(f"Cancel Bot A (should fail because it filled): {c1.strip()}")
    print(f"Cancel Bot B (should succeed because it rested): {c2.strip()}")

    if "not found" in c1 and "SUCCESS" in c2:
        print("✅ PASS: Time priority is strictly enforced.")
    else:
        print("❌ FAIL: Priority violated.")


print("\n--- TEST 3: CONCENTRATED-LOAD STRESS TEST ---")
print("Goal: Hammer ONE ticker with 20 bots (20,000 orders) to surface race conditions.")

NUM_BOTS = 20
REQUESTS_PER_BOT = 1000
successful_trades = 0
rejected_trades = 0
latencies = []
lock = threading.Lock()

def bot_worker(bot_id):
    global successful_trades, rejected_trades, latencies
    bsock = get_socket()
    local_success = 0
    local_rejects = 0
    local_lats = []

    for _ in range(REQUESTS_PER_BOT):
        price = PRICE_1 + random.randint(-2, 2)
        action = "LIMIT_BUY" if random.random() > 0.5 else "LIMIT_SELL"
        cmd = f"{action}:{TEST_TICKER}:10:{price:.2f}"

        t0 = time.perf_counter()
        reply = send_cmd(bsock, cmd)
        t1 = time.perf_counter()

        local_lats.append((t1 - t0) * 1000)
        if "RESTING" in reply or "SUCCESS" in reply or "FILLED" in reply or "PARTIAL" in reply:
            local_success += 1
        else:
            local_rejects += 1

    with lock:
        successful_trades += local_success
        rejected_trades += local_rejects
        latencies.extend(local_lats)

threads = []
start_time = time.time()
for i in range(NUM_BOTS):
    t = threading.Thread(target=bot_worker, args=(i,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()

total_time = time.time() - start_time
tps = (NUM_BOTS * REQUESTS_PER_BOT) / total_time

print(f"\nTotal Requests: {NUM_BOTS * REQUESTS_PER_BOT}")
print(f"SUCCESS/RESTING: {successful_trades}")
print(f"REJECTED/ERRORS: {rejected_trades}")
print(f"Time: {total_time:.2f}s")
print(f"Throughput: {tps:.2f} limit orders/sec")
latencies.sort()
print(f"p99 Latency: {latencies[int(len(latencies)*0.99)]:.2f} ms")

print("\n✅ Priority 1 complete.")
