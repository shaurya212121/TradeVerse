import zmq, time, re

def get_socket():
    sock = zmq.Context().socket(zmq.REQ)
    sock.connect("tcp://127.0.0.1:5556")
    return sock

def send_cmd(sock, cmd):
    sock.send_string(cmd)
    return sock.recv_string()

def get_spread_prices(ob_str):
    asks, bids, mode = [], [], "ASKS"
    for line in ob_str.split("\n"):
        if "SPREAD" in line: mode = "BIDS"; continue
        if "$" in line and "x" in line:
            try:
                price = float(line.split("$")[1].split("x")[0].strip())
                (asks if mode == "ASKS" else bids).append(price)
            except: pass
    lowest_ask = min(asks) if asks else 100.0
    highest_bid = max(bids) if bids else 0.0
    return round(highest_bid + (lowest_ask - highest_bid) * 0.33, 2)

sock = get_socket()
TEST_TICKER = "AAPL"
PRICE = get_spread_prices(send_cmd(sock, f"ORDERBOOK:{TEST_TICKER}"))

print("\n=== TEST: PRICE PRIORITY CHECK ===")
r_worse = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:100:{PRICE - 0.10:.2f}")
r_better = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:100:{PRICE:.2f}")

id_worse = int(re.search(r"\(order #(\d+)\)", r_worse).group(1))
id_better = int(re.search(r"\(order #(\d+)\)", r_better).group(1))

# Seller arrives at the worse price. Engine MUST choose Bot B (better deal).
send_cmd(sock, f"LIMIT_SELL:{TEST_TICKER}:100:{PRICE - 0.10:.2f}")
time.sleep(0.2)

c_worse = send_cmd(sock, f"CANCEL_ORDER:{id_worse}")
c_better = send_cmd(sock, f"CANCEL_ORDER:{id_better}")

if "SUCCESS" in c_worse and "not found" in c_better:
    print("✅ PASS: Better price filled first, despite arriving second.\n")
else:
    print("❌ FAIL: Price priority violated.\n")