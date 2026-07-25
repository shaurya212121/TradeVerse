import zmq
import sys

def main():
    context = zmq.Context()

    print("🔌 Connecting to TradeVerse Engine on port 5556...")
    socket = context.socket(zmq.REQ)
    socket.connect("tcp://localhost:5556")
    print("✅ Connected! System ready for trading.\n")

    print("=" * 64)
    print("  TRADEVERSE — COMMAND REFERENCE")
    print("=" * 64)
    print("  MARKET ORDERS:")
    print("    BUY:<TICKER>:<QTY>      Buy shares    (e.g., BUY:AAPL:10)")
    print("    SELL:<TICKER>:<QTY>     Sell shares   (e.g., SELL:TSLA:5)")
    print("    CANCEL:<TRADE_ID>      Cancel trade  (e.g., CANCEL:3)")
    print()
    print("  LIMIT ORDERS (Order Book):")
    print("    LIMIT_BUY:<TICKER>:<QTY>:<PRICE>   Limit buy  (e.g., LIMIT_BUY:AAPL:10:220.50)")
    print("    LIMIT_SELL:<TICKER>:<QTY>:<PRICE>   Limit sell (e.g., LIMIT_SELL:AAPL:5:225.00)")
    print("    CANCEL_ORDER:<ORDER_ID>             Cancel resting order (e.g., CANCEL_ORDER:7)")
    print()
    print("  QUERY COMMANDS:")
    print("    FETCH:<TICKER>         Get live price + book info (e.g., FETCH:AAPL)")
    print("    ORDERBOOK:<TICKER>     View order book depth     (e.g., ORDERBOOK:AAPL)")
    print("    PORTFOLIO              View all assets + liquidity")
    print("    HISTORY                Recent trade log")
    print("    STATUS_CHECK           Server health")
    print()
    print("  SYSTEM:")
    print("    exit                   Quit terminal")
    print("=" * 64 + "\n")

    while True:
        try:
            command = input("Trade Terminal > ").strip()

            if not command:
                continue

            if command.lower() == "exit":
                print("Exiting trading terminal...")
                break

            # Send command to C++ backend via ZeroMQ
            socket.send_string(command)

            # Receive response from worker thread
            response = socket.recv_string()
            print(f"\n📩 [Server Response]:\n{response}\n")

        except KeyboardInterrupt:
            print("\nTerminated by user.")
            break
        except Exception as e:
            print(f"❌ Communication Error: {e}")
            break

    socket.close()
    context.term()

if __name__ == "__main__":
    main()