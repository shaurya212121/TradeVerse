import zmq

ctx = zmq.Context()
sock = ctx.socket(zmq.REQ)
sock.connect("tcp://127.0.0.1:5556")

print("\n=== TEST: WAL CRASH RECOVERY (STEP 1) ===")
print("Placing unique 'marker' orders into the AAPL order book...\n")

orders = [
    "LIMIT_BUY:AAPL:10:777.77",
    "LIMIT_BUY:AAPL:20:888.88",
    "LIMIT_BUY:AAPL:30:999.99"
]

for cmd in orders:
    sock.send_string(cmd)
    reply = sock.recv_string()
    print(f"Sent: {cmd} -> Reply: {reply.strip()}")

print("\n🚨 STOP! DO NOT CLOSE THIS TERMINAL.")
print("👉 Go to your C++ server terminal and brutally kill it (Press Ctrl+C).")
print("👉 Then, turn the C++ server back on (.\\start.bat).")
print("👉 Finally, type this command in your interactive trade_client.py:")
print("     ORDERBOOK:AAPL")
print("\nIf you see $777.77, $888.88, and $999.99 resting safely in the book, your WAL recovery is FLAWLESS! ✅")
