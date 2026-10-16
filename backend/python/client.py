import zmq

context = zmq.Context()
subscriber = context.socket(zmq.SUB)
subscriber.connect("tcp://127.0.0.1:5555")

subscriber.setsockopt_string(zmq.SUBSCRIBE, "")

print("📡 TradeVerse Market Data Subscriber — listening on port 5555...")
print("-" * 65)

while True:
    raw_packet = subscriber.recv_string()

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