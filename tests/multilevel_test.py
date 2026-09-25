import zmq, time

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
    return round(highest_bid + (lowest_ask - highest_bid) * 0.66, 2)

sock = get_socket()
TEST_TICKER = "AAPL"
PRICE = get_spread_prices(send_cmd(sock, f"ORDERBOOK:{TEST_TICKER}"))

print("\n=== TEST: MULTI-LEVEL FILL (WALKING THE BOOK) ===")
# Two small sellers at different prices
send_cmd(sock, f"LIMIT_SELL:{TEST_TICKER}:50:{PRICE:.2f}")
send_cmd(sock, f"LIMIT_SELL:{TEST_TICKER}:50:{PRICE + 0.50:.2f}")
time.sleep(0.1)

# One big buyer sweeps both levels
reply = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:100:{PRICE + 0.50:.2f}")

if "FILLED" in reply and "100" in reply:
    print("✅ PASS: Order correctly walked the book and consumed two price levels.\n")
else:
    print(f"❌ FAIL: Expected FILLED, got {reply.strip()}\n")