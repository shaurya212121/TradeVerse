import zmq, threading, time

def get_socket():
    sock = zmq.Context().socket(zmq.REQ)
    sock.connect("tcp://127.0.0.1:5556")
    return sock

def send_cmd(sock, cmd):
    sock.send_string(cmd)
    return sock.recv_string()

def get_resting_qty(ob_str, price):
    for line in ob_str.split("\n"):
        if f"{price:.2f}" in line and "x" in line:
            return int(line.split("x")[1].strip())
    return 0

print("\n=== TEST: CROSS-TICKER ISOLATION (SHARDING) ===")
sock = get_socket()

# Use highly unique prices to guarantee zero overlap with dummy orders
UNIQUE_AAPL = 999.01
UNIQUE_TSLA = 999.02

def dual_ticker_worker():
    lsock = get_socket()
    for _ in range(500):
        # Heavy simultaneous traffic to both shards
        lsock.send_string(f"LIMIT_BUY:AAPL:10:{UNIQUE_AAPL:.2f}")
        lsock.recv_string()
        lsock.send_string(f"LIMIT_BUY:TSLA:10:{UNIQUE_TSLA:.2f}")
        lsock.recv_string()

threads = []
for i in range(10): # 10 threads * 500 requests * 10 qty = 50,000 shares each
    t = threading.Thread(target=dual_ticker_worker)
    threads.append(t)
    t.start()
    
for t in threads:
    t.join()

aapl_qty = get_resting_qty(send_cmd(sock, "ORDERBOOK:AAPL"), UNIQUE_AAPL)
tsla_qty = get_resting_qty(send_cmd(sock, "ORDERBOOK:TSLA"), UNIQUE_TSLA)

if aapl_qty == 50000 and tsla_qty == 50000:
    print(f"✅ PASS: AAPL processed {aapl_qty} shares. TSLA processed {tsla_qty} shares. Perfect parallel isolation.\n")
else:
    print(f"❌ FAIL: Shard contamination! AAPL Qty: {aapl_qty}, TSLA Qty: {tsla_qty}\n")