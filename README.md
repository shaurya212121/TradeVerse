# TradeVerse — Distributed Market Data & Trading Engine

A low-latency C++ and Python multithreaded order execution engine using ZeroMQ, with WAL-backed trade persistence and async CSV flushing.

## Architecture

```
                          ┌─────────────────────────────┐
                          │     C++ Server (server.cpp)  │
                          │  ┌─────────┐  ┌───────────┐ │
  Python Clients ◄──5556──┤  │ ROUTER  │──│  DEALER   │ │──► 10 Worker Threads
  (trade_client)           │  │(frontend│  │ (backend) │ │     BUY/SELL/FETCH
                          │  └─────────┘  └───────────┘ │     PORTFOLIO/HISTORY
                          │                             │     CANCEL
  Python Clients ◄──5555──┤  PUB Broadcaster            │
  (client.py)              │  (live market stream)       │
                          │                             │
                          │  ┌──────────────────────┐   │
                          │  │ WAL Engine            │   │
                          │  │ • Append-only log     │   │
                          │  │ • Async CSV flush     │   │
                          │  │ • Crash recovery      │   │
                          │  └──────────────────────┘   │
                          └─────────────────────────────┘
```

## Directory Structure

```
TradeVerse/
├── cpp/
│   ├── server.cpp         # C++ server — WAL, async flush, trade engine
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

| Command | Example | Description |
|---------|---------|-------------|
| `BUY:<TICKER>:<QTY>` | `BUY:AAPL:10` | Buy shares |
| `SELL:<TICKER>:<QTY>` | `SELL:TSLA:5` | Sell shares |
| `CANCEL:<TRADE_ID>` | `CANCEL:3` | Cancel/reverse a trade |
| `FETCH:<TICKER>` | `FETCH:AAPL` | Get live price & volume |
| `PORTFOLIO` | `PORTFOLIO` | View all tracked assets |
| `HISTORY` | `HISTORY` | View recent trade log |
| `STATUS_CHECK` | `STATUS_CHECK` | Server health check |

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