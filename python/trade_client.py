import zmq
import sys
import re

# ── Portfolio integration ────────────────────────────────────────────────────
from portfolio import setup_db, register_client, record_trade, get_portfolio

# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_price_from_response(response: str) -> float | None:
    """
    Extract the execution price from a server SUCCESS response.
    Expected format: 'SUCCESS | Bought 10 AAPL @ $150.23'
                  or 'SUCCESS | Sold 5 TSLA @ $220.00'
    Returns the price as a float, or None if it cannot be parsed.
    """
    match = re.search(r"\$([0-9]+\.[0-9]+)", response)
    if match:
        return float(match.group(1))
    return None


def handle_trade_response(client_id: str, command: str, response: str) -> None:
    """
    If the server confirms a BUY or SELL, mirror it into the local SQLite portfolio.
    command  — raw user input, e.g. 'BUY:AAPL:10'
    response — server reply,   e.g. 'SUCCESS | Bought 10 AAPL @ $150.23'
    """
    if not response.startswith("SUCCESS"):
        return                          # rejected or error — nothing to record

    parts = command.strip().split(":")
    if len(parts) < 3:
        return                          # malformed command, skip

    action  = parts[0].upper()         # BUY or SELL
    ticker  = parts[1].upper()
    try:
        quantity = int(parts[2])
    except ValueError:
        return

    price = parse_price_from_response(response)
    if price is None:
        print("[Portfolio] Warning: could not parse execution price from server response.")
        return

    record_trade(client_id, action, ticker, quantity, price)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    # ── Bootstrap local DB ───────────────────────────────────────────────────
    setup_db()

    client_id = input("Enter your Client ID (e.g. shaurya): ").strip()
    if not client_id:
        client_id = "default"
    register_client(client_id)
    print(f"Logged in as: {client_id}\n")

    # ── ZeroMQ connection ────────────────────────────────────────────────────
    context = zmq.Context()

    print("Connecting to TradeVerse Engine on port 5556...")
    socket = context.socket(zmq.REQ)
    socket.setsockopt(zmq.RCVTIMEO, 8000)          # 8 s timeout — never hang
    socket.connect("tcp://localhost:5556")
    print("Connected! System ready for trading.\n")

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
    print("    PORTFOLIO              View all assets + liquidity (server view)")
    print("    MY_PORTFOLIO           View YOUR personal holdings (local SQLite)")
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

            # ── Local portfolio shortcut (no server round-trip needed) ────────
            if command.upper() == "MY_PORTFOLIO":
                print(get_portfolio(client_id))
                continue

            # ── Send command to C++ backend via ZeroMQ ────────────────────────
            socket.send_string(command)

            try:
                response = socket.recv_string()
                print(f"\n[Server Response]:\n{response}\n")

                # Mirror confirmed BUY / SELL into local SQLite portfolio
                action = command.split(":")[0].upper()
                if action in ("BUY", "SELL"):
                    handle_trade_response(client_id, command, response)

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