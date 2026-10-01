import zmq
import time
import statistics
import multiprocessing

NUM_REQUESTS_PER_WORKER = 10000
NUM_WORKERS = multiprocessing.cpu_count() or 4

def worker(worker_id, num_requests):
    context = zmq.Context()
    socket = context.socket(zmq.REQ)
    socket.setsockopt(zmq.RCVTIMEO, 2000) # 2s timeout
    socket.connect("tcp://localhost:5556")
    
    latencies = []
    
    # Warmup to establish connections and fill JIT caches
    try:
        for _ in range(100):
            socket.send_string("FETCH:AAPL")
            socket.recv_string()
            
        for _ in range(num_requests):
            start = time.perf_counter()
            socket.send_string("FETCH:AAPL")
            socket.recv_string()
            latencies.append((time.perf_counter() - start) * 1000)
    except zmq.error.Again:
        pass # Server crashed or timed out

        
    socket.close()
    return latencies

def main():
    total_reqs = NUM_REQUESTS_PER_WORKER * NUM_WORKERS
    print(f"Starting closed-loop benchmark with {NUM_WORKERS} workers...")
    print(f"Targeting {total_reqs} total requests...")
    
    start_time = time.time()
    
    all_latencies = []
    
    # Using multiple processes to bypass the Python GIL and maximize ZMQ throughput
    with multiprocessing.Pool(NUM_WORKERS) as pool:
        results = pool.starmap(worker, [(i, NUM_REQUESTS_PER_WORKER) for i in range(NUM_WORKERS)])
        
    for r in results:
        all_latencies.extend(r)
        
    total_time = time.time() - start_time
    
    print("\n--- Benchmark Results ---")
    print(f"Total Requests: {len(all_latencies)}")
    print(f"Total Time:     {total_time:.3f} seconds")
    print(f"Throughput:     {len(all_latencies) / total_time:.0f} req/sec")
    
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
