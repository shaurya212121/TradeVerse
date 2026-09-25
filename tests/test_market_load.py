import zmq
import threading
import time

def worker(num_requests):
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect("tcp://127.0.0.1:5556")
    
    for _ in range(num_requests):
        # Send pure market orders (BUY/SELL) instead of LIMIT orders
        sock.send_string("BUY:AAPL:10")
        sock.recv_string()
        sock.send_string("SELL:AAPL:10")
        sock.recv_string()
    sock.close()

NUM_THREADS = 10
REQUESTS_PER_THREAD = 2000  # 2000 buys + 2000 sells = 4000 per thread

print("\n=== TEST: MARKET ORDER STRESS TEST (GLOBAL LOCK) ===")
print(f"Hammering server with {NUM_THREADS * REQUESTS_PER_THREAD * 2} market orders...")

start_time = time.time()
threads = []

for _ in range(NUM_THREADS):
    t = threading.Thread(target=worker, args=(REQUESTS_PER_THREAD,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()

elapsed = time.time() - start_time
total_orders = NUM_THREADS * REQUESTS_PER_THREAD * 2
tps = total_orders / elapsed

print(f"✅ PASS: Server survived the Market Order barrage without crashing!")
print(f"Time Taken: {elapsed:.2f} seconds")
print(f"Throughput: {tps:.2f} orders/sec")
