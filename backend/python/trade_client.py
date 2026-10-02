import zmq
import sys
import re
import time
import uuid

def main():
    print("=" * 64)
    print("  TRADEVERSE TERMINAL")
    print("=" * 64)
    
    client_id = input("Enter your Client ID (e.g. shaurya): ").strip()
    if not client_id:
        client_id = "default"
    
    # ── ZeroMQ connection ────────────────────────────────────────────────────
    context = zmq.Context()

    print("Connecting to TradeVerse Engine on port 5556...")
    socket = context.socket(zmq.REQ)
    socket.setsockopt(zmq.RCVTIMEO, 8000)          # 8 s timeout — never hang
    socket.connect("tcp://localhost:5556")
    
    # ── Register Account ─────────────────────────────────────────────────────
    socket.send_string(f"REGISTER:{client_id}")
    try:
        resp = socket.recv_string()
        print(f"[Server] {resp}")
    except zmq.Again:
        print("[TIMEOUT] Server offline. Exiting.")
        sys.exit(1)
        
    print("\nConnected! System ready for trading.\n")
    print("=" * 64)
    print("  TRADEVERSE — COMMAND REFERENCE")
    print("=" * 64)
    print("  MARKET ORDERS:")
    print("    BUY:<TICKER>:<QTY>      Buy shares    (e.g., BUY:AAPL:10)")
    print("    SELL:<TICKER>:<QTY>     Sell shares   (e.g., SELL:TSLA:5)")
    print("    CANCEL:<TRADE_ID>       Cancel trade  (e.g., CANCEL:3)")
    print()
    print("  LIMIT ORDERS (Order Book):")
    print("    LIMIT_BUY:<TICKER>:<QTY>:<PRICE>   Limit buy  (e.g., LIMIT_BUY:AAPL:10:220.50)")
    print("    LIMIT_SELL:<TICKER>:<QTY>:<PRICE>  Limit sell (e.g., LIMIT_SELL:AAPL:5:225.00)")
    print("    CANCEL_ORDER:<ORDER_ID>             Cancel resting order (e.g., CANCEL_ORDER:7)")
    print()
    print("  QUERY COMMANDS:")
    print("    FETCH:<TICKER>         Get live price + book info (e.g., FETCH:AAPL)")
    print("    ORDERBOOK:<TICKER>     View order book depth     (e.g., ORDERBOOK:AAPL)")
    print("    MY_ACCOUNT             View your cash and holdings")
    print("    PORTFOLIO              View all market assets")
    print("    HISTORY                Recent trade log")
    print("    STATUS_CHECK           Server health")
    print()
    print("  SYSTEM:")
    print("    exit                   Quit terminal")
    print("=" * 64 + "\n")

    while True:
        try:
            raw_command = input("Trade Terminal > ").strip()

            if not raw_command:
                continue

            if raw_command.lower() == "exit":
                print("Exiting trading terminal...")
                break

            # Process command
            command = raw_command
            parts = command.split(":")
            
            # Map MY_ACCOUNT to ACCOUNT:client_id
            if command.upper() == "MY_ACCOUNT":
                command = f"ACCOUNT:{client_id}"
            
            # Inject Client ID and Request ID into MARKET orders for idempotency
            elif len(parts) >= 3 and parts[0].upper() in ("BUY", "SELL"):
                action = parts[0].upper()
                ticker = parts[1].upper()
                qty = parts[2]
                req_id = str(uuid.uuid4())
                command = f"{action}:{client_id}:{ticker}:{qty}:{req_id}"

            # ── Send command to C++ backend via ZeroMQ ────────────────────────
            start_time = time.perf_counter()
            socket.send_string(command)

            try:
                response = socket.recv_string()
                end_time = time.perf_counter()
                rtt_ms = (end_time - start_time) * 1000
                print(f"\n[Server Response] (Total RTT: {rtt_ms:.2f} ms):\n{response}\n")

            except zmq.Again:
                print("\n[TIMEOUT] Server did not respond in 8 seconds.")
                print("Check that start.bat is running in another terminal.\n")
                # Reconnect socket so next command works cleanly
                socket.close()
                socket = context.socket(zmq.REQ)
                socket.setsockopt(zmq.RCVTIMEO, 8000)
                socket.connect("tcp://localhost:5556")

        except KeyboardInterrupt:
            print("\nTerminated by user.")
            break
        except Exception as e:
            print(f"Communication Error: {e}")
            break

    socket.close()
    context.term()

if __name__ == "__main__":
    main()