import zmq
import time
import multiprocessing
import random

# List of tickers supported by the server
TICKERS = ["AAPL", "TSLA", "TCS.NS", "RELIANCE.NS", "HDFCBANK.NS", "GOOGL", "AMZN", "MSFT", "NVDA", "INFY.NS"]

def bot_worker(bot_id, num_requests, target_ip):
    """
    This function runs in a completely separate CPU process.
    It acts like a hyperactive trader, sending hundreds of orders as fast as possible.
    """
    context = zmq.Context()
    socket = context.socket(zmq.REQ) # REQ perfectly matches the server's ROUTER
    socket.connect(f"tcp://{target_ip}:5556")
    
    latencies = []
    
    for _ in range(num_requests):
        ticker = random.choice(TICKERS)
        action = random.choice(["BUY", "SELL"])
        qty = random.randint(1, 10)
        
        command = f"{action}:{ticker}:{qty}"
        
        start_time = time.perf_counter()
        
        try:
            socket.send_string(command)
            # Wait for the C++ server to reply SUCCESS or REJECTED
            socket.recv_string() 
            end_time = time.perf_counter()
            latencies.append((end_time - start_time) * 1000) # convert to milliseconds
        except Exception as e:
            pass # If a request fails or drops, we just ignore it and keep hammering
            
    return latencies

def calculate_percentile(data, percentile):
    """Helper to calculate p50, p95, p99 without needing external libraries like numpy."""
    size = len(data)
    if size == 0: return 0
    index = int(size * percentile)
    return data[index]

if __name__ == "__main__":
    # --- CONFIGURE YOUR TEST HERE ---
    NUM_BOTS = 20           # Number of simultaneous traders
    REQUESTS_PER_BOT = 500  # How many trades each bot makes
    TARGET_IP = "localhost" # Change this to your friend's Tailscale IP when testing over the internet!
    # --------------------------------
    
    total_expected = NUM_BOTS * REQUESTS_PER_BOT
    print(f"🔥 Starting Stress Test: {NUM_BOTS} bots firing {REQUESTS_PER_BOT} trades each.")
    print(f"🎯 Target Server: {TARGET_IP}")
    print(f"🚀 Total expected orders: {total_expected}")
    
    start_total = time.time()
    
    # Use multiprocessing to bypass Python's GIL and use all CPU cores
    with multiprocessing.Pool(NUM_BOTS) as pool:
        args = [(i, REQUESTS_PER_BOT, TARGET_IP) for i in range(NUM_BOTS)]
        results = pool.starmap(bot_worker, args)
        
    end_total = time.time()
    
    # Flatten the results from all bots into one giant list
    all_latencies = [lat for sublist in results for lat in sublist]
    
    if not all_latencies:
        print("❌ No successful requests recorded. Is the C++ server running?")
    else:
        all_latencies.sort()
        total_time_seconds = end_total - start_total
        actual_requests = len(all_latencies)
        throughput = actual_requests / total_time_seconds
        
        p50 = calculate_percentile(all_latencies, 0.50)
        p95 = calculate_percentile(all_latencies, 0.95)
        p99 = calculate_percentile(all_latencies, 0.99)
        avg = sum(all_latencies) / actual_requests
        
        print("\n" + "="*40)
        print("📊 STRESS TEST RESULTS")
        print("="*40)
        print(f"Total Orders Executed : {actual_requests} / {total_expected}")
        print(f"Time Taken          : {total_time_seconds:.2f} seconds")
        print(f"Throughput          : {throughput:.2f} orders / second")
        
        print("\n⏱️  LATENCY (Round-Trip Time)")
        print(f"Average             : {avg:.2f} ms")
        print(f"p50 (Median)        : {p50:.2f} ms  (50% of trades finished faster than this)")
        print(f"p95                 : {p95:.2f} ms  (95% of trades finished faster than this)")
        print(f"p99                 : {p99:.2f} ms  (99% of trades finished faster than this)")
        print("="*40)
