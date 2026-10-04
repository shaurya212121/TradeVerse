import zmq
import time
import statistics
import multiprocessing

NUM_REQUESTS_PER_WORKER = 10000
NUM_WORKERS = multiprocessing.cpu_count() or 4

# All tickers loaded in the C++ engine — spread load to prove per-ticker sharding works
TICKERS = ["AAPL", "TSLA", "GOOGL", "AMZN", "MSFT", "NVDA",
           "TCS.NS", "RELIANCE.NS", "HDFCBANK.NS", "INFY.NS"]

def worker(worker_id, num_requests):
    context = zmq.Context()
    socket = context.socket(zmq.REQ)
    socket.setsockopt(zmq.RCVTIMEO, 5000) # 5 second timeout
    socket.connect("tcp://localhost:5556")
    
    # 1. Register the benchmark worker so it has a valid account
    client_id = f"bench_{worker_id}"
    socket.send_string(f"REGISTER:{client_id}")
    socket.recv_string()
    
    # Warmup with real orders
    for _ in range(100):
        socket.send_string(f"BUY:{client_id}:AAPL:1")
        socket.recv_string()
    
    latencies = []
    failures = 0
    
    # 2. Fire real trades
    for i in range(num_requests):
        ticker = TICKERS[i % len(TICKERS)]  # Spread load across all tickers
        side = "BUY" if i % 2 == 0 else "SELL"  # Alternate buy and sell
        req_id = f"w{worker_id}_r{i}"
        
        start = time.perf_counter()
        try:
            socket.send_string(f"{side}:{client_id}:{ticker}:1:{req_id}")
            response = socket.recv_string()
            latencies.append((time.perf_counter() - start) * 1000)
            
            # 4. Track if the engine rejected the trade (e.g. out of liquidity)
            if "REJECTED" in response:
                failures += 1
        except zmq.error.Again:
            failures += 1 # Timed out
    
    socket.close()
    return latencies, failures


def main():
    total_reqs = NUM_REQUESTS_PER_WORKER * NUM_WORKERS
    print(f"Starting REAL TRADE benchmark with {NUM_WORKERS} workers...")
    print(f"Targeting {total_reqs} total orders across {len(TICKERS)} tickers...")
    
    start_time = time.time()
    
    all_latencies = []
    total_failures = 0
    
    # Using multiple processes to bypass the Python GIL and maximize ZMQ throughput
    with multiprocessing.Pool(NUM_WORKERS) as pool:
        results = pool.starmap(worker, [(i, NUM_REQUESTS_PER_WORKER) for i in range(NUM_WORKERS)])
        
    for latencies, failures in results:
        all_latencies.extend(latencies)
        total_failures += failures
        
    total_time = time.time() - start_time
    
    print("\n--- Benchmark Results ---")
    print(f"Total Requests:  {len(all_latencies)}")
    print(f"Total Failures:  {total_failures}")
    print(f"Success Rate:    {(1 - total_failures / max(len(all_latencies), 1)) * 100:.1f}%")
    print(f"Total Time:      {total_time:.3f} seconds")
    print(f"Throughput:      {len(all_latencies) / total_time:.0f} req/sec")
    
    if all_latencies:
        all_latencies.sort()
        print("\n--- Latency Profile ---")
        print(f"Min Latency: {min(all_latencies):.3f} ms")
        print(f"Avg Latency: {statistics.mean(all_latencies):.3f} ms")
        print(f"Max Latency: {max(all_latencies):.3f} ms")
        if len(all_latencies) > 1:
            print(f"p50 Latency: {all_latencies[int(len(all_latencies)*0.5)]:.3f} ms")
            print(f"p90 Latency: {all_latencies[int(len(all_latencies)*0.9)]:.3f} ms")
            print(f"p95 Latency: {all_latencies[int(len(all_latencies)*0.95)]:.3f} ms")
            print(f"p99 Latency: {all_latencies[int(len(all_latencies)*0.99)]:.3f} ms")
            print(f"p99.9 Lat:   {all_latencies[int(len(all_latencies)*0.999)]:.3f} ms")

if __name__ == "__main__":
    main()
