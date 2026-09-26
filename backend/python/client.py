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
    data_list = raw_packet.split(',')

    # New 4-field format: TICKER, TIMESTAMP, $PRICE, Vol:VOLUME
    if len(data_list) == 4:
        ticker    = data_list[0].strip()
        timestamp = data_list[1].strip()
        price_str = data_list[2].strip().lstrip('$')
        vol_str   = data_list[3].strip().replace("Vol:", "")

        try:
            spot_price = float(price_str)
            volume     = int(vol_str)
            print(f"📊 {ticker:<14} | Time: {timestamp} | Price: ${spot_price:.2f} | Vol: {volume}")
        except ValueError:
            print(f"⚠️  Parse error: {raw_packet}")
    else:
        print(f"⚠️  Dropped malformed packet ({len(data_list)} fields): {raw_packet}")