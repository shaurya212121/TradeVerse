import zmq

# Connect to the ZeroMQ PUB broadcast on Port 5555
context = zmq.Context()
subscriber = context.socket(zmq.SUB)
subscriber.connect("tcp://127.0.0.1:5555")

# Subscribe to all topics
subscriber.setsockopt_string(zmq.SUBSCRIBE, "")

print("📡 TradeVerse Market Data Subscriber — listening on port 5555...")
print("-" * 65)

while True:
    raw_packet = subscriber.recv_string()

    # Server sends 2-field format: "TICKER,$PRICE"  (e.g. "AAPL,$341.50")
    parts = raw_packet.split(",$")
    if len(parts) == 2:
        ticker = parts[0].strip()
        price_str = parts[1].strip()

        try:
            spot_price = float(price_str)
            print(f"📊 {ticker:<14} | Price: ${spot_price:.2f}")
        except ValueError:
            print(f"⚠️  Parse error: {raw_packet}")
    else:
        print(f"⚠️  Dropped malformed packet ({len(parts)} fields): {raw_packet}")