import sqlite3
from datetime import datetime

def setup_db():

  conn= sqlite3.connect("tradeverse.db")
  conn.execute("""
  CREATE TABLE IF NOT EXISTS clients(
   client_id   TEXT PRIMARY KEY,
    cash        REAL DEFAULT 100000.0
  )
"""
  )
  conn.execute("""
        CREATE TABLE IF NOT EXISTS holdings (
            client_id   TEXT,
            ticker      TEXT,
            quantity    INTEGER DEFAULT 0,
            avg_price   REAL DEFAULT 0.0,
            PRIMARY KEY (client_id, ticker)
        )
    """)

  conn.execute("""
        CREATE TABLE IF NOT EXISTS trade_history (
            trade_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id   TEXT,
            action      TEXT,
            ticker      TEXT,
            quantity    INTEGER,
            price       REAL,
            timestamp   TEXT
        )
    """)
  conn.commit()
  conn.close()
  print("Database ready!")


def register_client(client_id):
   conn=sqlite3.connect("tradeverse.db")
   conn.execute("""
    INSERT OR IGNORE INTO CLIENTS(client_id,cash)
    VALUES(?,100000.0)
""",(client_id,))
   conn.commit()
   conn.close()
   print(f"client '{client_id}' registered!")

def record_trade(client_id,action,ticker,quantity,price):
   conn=sqlite3.connect("tradeverse.db")
   # --- Auto-Registration (Option 2) ---
   # Ensure the client exists before processing their trade. 
   # If they don't exist, they are created with the default $100,000 cash balance.
   conn.execute("""
    INSERT OR IGNORE INTO CLIENTS(client_id, cash)
    VALUES(?, 100000.0)
   """, (client_id,))
   timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
   total=quantity*price
   if(action=="BUY"):
      conn.execute("""
      UPDATE CLIENTS SET cash = cash - ?
      WHERE client_id=?

""",(total,client_id))
      conn.execute("""
       INSERT INTO HOLDINGS(client_id,ticker,quantity,avg_price)
       VALUES(?,?,?,?)
       ON CONFLICT(client_id,ticker)
       DO UPDATE SET
         avg_price = (holdings.quantity * holdings.avg_price + excluded.quantity * excluded.avg_price)
                     / (holdings.quantity + excluded.quantity),
         quantity  = holdings.quantity + excluded.quantity
""", (client_id, ticker, quantity, price))
   elif action=="SELL":
      conn.execute("""
        UPDATE CLIENTS SET cash= cash+ ?
        WHERE client_id=?
""",(total, client_id))
      conn.execute("""
    UPDATE holdings SET quantity = quantity - ?
    WHERE client_id = ? AND ticker = ?

""",(quantity,client_id,ticker,))
   
   conn.execute("""
INSERT INTO trade_history (client_id, action, ticker, quantity, price, timestamp)
VALUES (?, ?, ?, ?, ?, ?)
    """, (client_id, action, ticker, quantity, price, timestamp))
   conn.commit()
   conn.close()
   print(f"{action} {quantity} {ticker} @ ${price} recorded.")

def get_portfolio(client_id):
    conn = sqlite3.connect("tradeverse.db")
   
    row = conn.execute("SELECT cash FROM clients WHERE client_id = ?", (client_id,)).fetchone()
    if row is None:
        conn.close()
        return f"No client found with ID '{client_id}'"
    cash = row[0]
   
    holdings = conn.execute("""
        SELECT ticker, quantity, avg_price 
        FROM holdings 
        WHERE client_id = ? AND quantity > 0
    """, (client_id,)).fetchall()
    
    conn.close()
    output = f"\n--- PORTFOLIO: {client_id} ---\n"
    output += f"Cash: ${cash:.2f}\n"
    output += "-" * 30 + "\n"
    
    if len(holdings) > 0:
        for ticker, qty, avg in holdings:
            output += f"{ticker}: {qty} shares @ ${avg:.2f}\n"
    else:
        output += "No stocks currently held.\n"
        
    output += "-" * 30 + "\n"
    return output
def get_cash_balance(client_id):
    conn = sqlite3.connect("tradeverse.db")
    row = conn.execute("SELECT cash FROM clients WHERE client_id = ?", (client_id,)).fetchone()
    conn.close()
    
    if row is None:
        return 0.0
    return row[0]

def get_holding_qty(client_id, ticker):
    """Return the number of shares the client holds for a given ticker (0 if none)."""
    conn = sqlite3.connect("tradeverse.db")
    row = conn.execute(
        "SELECT quantity FROM holdings WHERE client_id = ? AND ticker = ?",
        (client_id, ticker)
    ).fetchone()
    conn.close()
    return row[0] if row else 0
if __name__ == "__main__":
    setup_db()
    register_client("shaurya")
    register_client("shaurya")
    record_trade("shaurya", "BUY", "AAPL", 10, 340.50)
    record_trade("shaurya", "BUY", "TSLA", 5, 309.75)
    record_trade("shaurya", "SELL", "AAPL", 3, 345.00)

    print(get_portfolio("shaurya"))