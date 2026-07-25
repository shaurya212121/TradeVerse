# TradeVerse — Distributed Market Data & Trading Engine

A low-latency C++ and Python multithreaded order execution engine using ZeroMQ, with WAL-backed trade persistence, per-stock order books, and async CSV flushing.

## Architecture

```
                          ┌──────────────────────────────────────┐
                          │       C++ Server (server.cpp)         │
                          │  ┌─────────┐  ┌───────────┐         │
  Python Clients ◄──5556──┤  │ ROUTER  │──│  DEALER   │──► 10 Worker Threads
  (trade_client)           │  │(frontend│  │ (backend) │     BUY/SELL/FETCH
                          │  └─────────┘  └───────────┘     LIMIT_BUY/SELL
                          │                                  ORDERBOOK/CANCEL
  Python Clients ◄──5555──┤  PUB Broadcaster                    │
  (client.py)              │  (live market stream)               │
                          │                                      │
                          │  ┌──────────────────────────────┐   │
                          │  │ Order Queue Processor         │   │
                          │  │ • Pseudo-queue sync           │   │
                          │  │ • Single-threaded matching    │   │
                          │  │ • Price-time priority         │   │
                          │  └──────────────────────────────┘   │
                          │                                      │
                          │  ┌──────────────────────────────┐   │
                          │  │ Per-Stock Order Books          │   │
                          │  │ • Seeded with synthetic depth  │   │
                          │  │ • Bids (sorted DESC)           │   │
                          │  │ • Asks (sorted ASC)            │   │
                          │  └──────────────────────────────┘   │
                          │                                      │
                          │  ┌──────────────────────────────┐   │
                          │  │ WAL Engine                     │   │
                          │  │ • Append-only log              │   │
                          │  │ • Async CSV flush              │   │
                          │  │ • Crash recovery               │   │
                          │  └──────────────────────────────┘   │
                          └──────────────────────────────────────┘
```

## Tracked Stocks (10 Tickers)

| Ticker | Company | Volatility |
|--------|---------|------------|
| AAPL | Apple Inc. | 0.12% |
| TSLA | Tesla Inc. | 0.30% |
| GOOGL | Alphabet Inc. | 0.14% |
| AMZN | Amazon.com | 0.18% |
| MSFT | Microsoft Corp. | 0.10% |
| NVDA | NVIDIA Corp. | 0.35% |
| TCS.NS | Tata Consultancy | 0.10% |
| RELIANCE.NS | Reliance Industries | 0.15% |
| HDFCBANK.NS | HDFC Bank | 0.08% |
| INFY.NS | Infosys Ltd. | 0.09% |

## Directory Structure

```
TradeVerse/
├── cpp/
│   ├── server.cpp         # C++ server — WAL, order books, trade engine
│   └── Makefile           # Build configuration
├── python/
│   ├── client.py          # Market data subscriber (port 5555)
│   ├── trade_client.py    # Interactive trade terminal (port 5556)
│   ├── send_command.py    # Quick command sender
│   ├── data.py            # Yahoo Finance market data fetcher
│   └── generate_portfolio.py  # Random portfolio generator
├── data/
│   ├── market_data1.csv   # Live market data (loaded by server)
│   └── portfolio.csv      # Generated portfolio positions
├── logs/                  # Created at runtime
│   ├── wal.log            # Write-Ahead Log (trade journal)
│   └── trade_history.log  # Permanent audit trail
├── .gitignore
└── README.md
```

## Quick Start

### Option A: One-Command Launch (fetches fresh data → builds → runs)
```bash
cd TradeVerse
start.bat
```

### Option B: Manual Steps

#### 1. Fetch Market Data
```bash
cd TradeVerse
python python/data.py
```

#### 2. Build & Run Server
```bash
cd cpp
g++ -std=c++17 -O2 -o server.exe server.cpp -lzmq -lws2_32 -lpthread
cd ..
cpp\server.exe
```

### 3. Connect Clients
```bash
# Terminal 2 — Trade Terminal
python python/trade_client.py

# Terminal 3 — Live Market Stream
python python/client.py
```

## Trade Commands

### Market Orders
| Command | Example | Description |
|---------|---------|-------------|
| `BUY:<TICKER>:<QTY>` | `BUY:AAPL:10` | Buy shares (validated against book liquidity) |
| `SELL:<TICKER>:<QTY>` | `SELL:TSLA:5` | Sell shares (validated against bid depth) |
| `CANCEL:<TRADE_ID>` | `CANCEL:3` | Cancel/reverse a market trade |

### Limit Orders (Order Book)
| Command | Example | Description |
|---------|---------|-------------|
| `LIMIT_BUY:<TICKER>:<QTY>:<PRICE>` | `LIMIT_BUY:AAPL:10:220.50` | Place limit buy — matches or rests |
| `LIMIT_SELL:<TICKER>:<QTY>:<PRICE>` | `LIMIT_SELL:NVDA:5:145.00` | Place limit sell — matches or rests |
| `CANCEL_ORDER:<ORDER_ID>` | `CANCEL_ORDER:7` | Cancel a resting limit order |
| `ORDERBOOK:<TICKER>` | `ORDERBOOK:GOOGL` | View bid/ask depth for a stock |

### Query Commands
| Command | Example | Description |
|---------|---------|-------------|
| `FETCH:<TICKER>` | `FETCH:AAPL` | Get live price, bid/ask, buyable/sellable |
| `PORTFOLIO` | `PORTFOLIO` | View all assets with liquidity info |
| `HISTORY` | `HISTORY` | View recent trade log |
| `STATUS_CHECK` | `STATUS_CHECK` | Server health + book stats |

## Order Book Architecture

### Pseudo-Queue Sync
All limit orders are funneled through a **thread-safe FIFO queue**. A dedicated processor thread drains the queue sequentially, ensuring:
- **Price-time priority** ordering
- **Zero race conditions** in the matching engine
- **Deterministic fills** regardless of concurrent worker count

```
Worker Thread 1 ──┐                    ┌── process_limit_order()
Worker Thread 2 ──┤  submit_order()    │   (single-threaded)
Worker Thread 3 ──┼──► FIFO Queue ─────┼── process_cancel_order()
...               │   (mutex + CV)     │   (sequential matching)
Worker Thread 10 ─┘                    └── result via std::promise
```

### Liquidity Validation
Market BUY/SELL commands now check order book depth before executing:
- **BUY** validates against total ask-side liquidity
- **SELL** validates against total bid-side liquidity
- Rejected orders get a clear message showing available vs requested quantity

## WAL (Write-Ahead Log) — Latency Fix

**Problem**: Previously, every BUY/SELL rewrote the entire CSV file synchronously, blocking the trade thread. Under 1000 concurrent requests, this was a bottleneck.

**Solution**: Trades now append a single line to `logs/wal.log` (microseconds), and a background thread flushes to CSV every 5 seconds. On crash, the WAL replays on startup to recover state.

```
BEFORE:  Trade → Lock → Modify RAM → REWRITE ENTIRE CSV → Unlock → Reply
AFTER:   Trade → Lock → Modify RAM → Append 1 WAL line → Unlock → Reply (FAST)
                 Background thread flushes CSV every 5s
```

## Dependencies

- **C++**: ZeroMQ (`libzmq`), C++17 compiler
- **Python**: `pyzmq`, `yfinance`, `pandas`, `numpy`