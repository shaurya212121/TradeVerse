<p align="center">
  <img src="https://img.shields.io/badge/C++-17-00599C?style=for-the-badge&logo=cplusplus&logoColor=white" alt="C++17" />
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/ZeroMQ-DF0000?style=for-the-badge&logo=zeromq&logoColor=white" alt="ZeroMQ" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/Platform-Windows%20|%20Linux-0078D6?style=for-the-badge" alt="Platform" />
</p>

<h1 align="center">TradeVerse</h1>

<p align="center">
  <strong>A multi-threaded financial order matching engine & market simulator</strong><br/>
  <sub>Built with C++17 | ZeroMQ | Write-Ahead Logging | React & FastAPI</sub>
</p>

<p align="center">
  <img src="assets/tradeverse_landing.png" alt="TradeVerse Command Center" width="850" />
</p>


<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#trade-commands">Commands</a> &middot;
  <a href="#performance--testing">Performance</a> &middot;
  <a href="#known-limitations">Limitations</a> &middot;
  <a href="#authors">Authors</a>
</p>

---

## Overview

**TradeVerse** is an educational, research-oriented C++17 order matching engine designed to explore concurrency, thread-safety, crash-recovery, and low-latency network messaging. 

It implements per-ticker order books with price-time priority (FIFO), asynchronous Write-Ahead Logging (WAL) with CRC32 checksums, and a Python FastAPI / React WebSocket web interface communicating with a multithreaded ZeroMQ core.

> **Project Scope:** TradeVerse is a simulated matching core built to study distributed systems concepts (WAL durability, TOCTOU risk checks, idempotency, sharded order books). It is not a production-certified exchange engine.

### Core Approaches

| Challenge | TradeVerse's Approach |
|---|---|
| Concurrent Order Execution | Per-ticker sharded order books with mutex-protected FIFO queues |
| Write Latency on Hot Path | Async WAL queue with dedicated background writer thread (disk I/O off hot path) |
| Data Corruption Prevention | CRC32 checksum validation on WAL log records |
| Race Conditions (TOCTOU) | Atomic balance checks and pre-trade cash/holdings reservations |
| Client Communications | ZeroMQ ROUTER/DEALER for internal core messaging, WebSockets (FastAPI) for web UI |

---

## Quick Start

### Prerequisites

| Dependency | Purpose | Install |
|---|---|---|
| **g++** (MinGW/MSYS2 or GCC) | C++17 compiler | `pacman -S mingw-w64-x86_64-gcc` |
| **libzmq** | ZeroMQ messaging | `pacman -S mingw-w64-x86_64-zeromq` |
| **Python 3.10+** | Gateway & test scripts | [python.org](https://www.python.org/) |
| **Node.js 18+** | React web frontend | [nodejs.org](https://nodejs.org/) |

### Running the System (3 Terminals)

**Terminal 1: C++ Matching Engine**
```bash
g++ -O3 -std=c++17 backend/cpp/server.cpp -o backend/cpp/server.exe -lzmq -lws2_32 -lmswsock -ladvapi32
./backend/cpp/server.exe
```

**Terminal 2: Python FastAPI Gateway**
```bash
python backend/python/gateway_fastapi.py
```

**Terminal 3: React Web Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## Architecture

```
                          +-------------------------------------------------+
                          |        React Frontend  (Browser UI)             |
                          +-------------------------------------------------+
                                                   |  WebSockets
                                                   v
                          +-------------------------------------------------+
                          |   Python Gateway  (gateway_fastapi.py)          |
                          +-------------------------------------------------+
                                                   |  ZeroMQ (Port 5556 / 5555)
                                                   v
                          +-------------------------------------------------+
                          |         C++ Server Engine (server.cpp)          |
                          |                                                  |
                          |  +----------+    +----------+                    |
                          |  |  ROUTER  |----+  DEALER  |---> Worker         |
                          |  |(frontend)|    |(backend) |     Threads        |
                          |  +----------+    +----------+                    |
                          |                                                  |
                          |  +-------------------------------------------+  |
                          |  |  Per-Ticker Order Shards                  |  |
                          |  |  - Independent book_lock per ticker       |  |
                          |  |  - std::mutex + condition_variable queue  |  |
                          |  |  - Price-time priority matching           |  |
                          |  |  - Result delivery via std::promise       |  |
                          |  +-------------------------------------------+  |
                          |                                                  |
                          |  +-------------------------------------------+  |
                          |  |  WAL Engine                                |  |
                          |  |  - Append-only journal with CRC32          |  |
                          |  |  - Async background writer thread          |  |
                          |  +-------------------------------------------+  |
                          +-------------------------------------------------+
```

### Threading & Lock Structure

The engine uses multiple concurrent threads and explicit mutexes to enforce thread-safety:

| Subsystem | Locks Used | Purpose |
|---|---|---|
| **Order Book Shards** | `shards[ticker].book_lock` (`std::mutex`) | Isolates order book mutations per ticker symbol |
| **Order Queues** | `shard.queue_lock` + `condition_variable` | Thread-safe producer-consumer queue for pending orders |
| **Accounts** | `accounts_lock` (`std::mutex`) | Protects client cash balances and stock holdings |
| **Deduplication** | `dedup_lock` (`std::mutex`) | Protects request idempotency cache |
| **WAL Queue** | `wal_queue_lock` + `condition_variable` | Protects in-memory WAL write queue |

---

## Features

### 1. Order Matching & VWAP Execution
- **Limit Orders (`LIMIT_BUY` / `LIMIT_SELL`):** Matched against resting limit orders or added to the `std::map` price ladder.
- **Market Orders (`BUY` / `SELL`):** Aggressive orders sweeping across price levels, calculating true Volume-Weighted Average Price (VWAP).
- **Structured Results:** Return typed `OrderResult` structs (`filled`, `avg_price`, `success`, `message`) directly to callers.

### 2. Risk & Account Checks (TOCTOU Prevention)
- In-memory account tracking (`Account` struct with cash and holdings).
- Pre-trade validation reserves estimated cash/shares under `accounts_lock` prior to matching, preventing double-spend race conditions.
- Fills settle makers and aggressors; unused reserved funds are refunded automatically on rejection or cancellation.

### 3. Asynchronous Write-Ahead Log (WAL)
- Non-blocking logging: Order execution threads push `WalEntry` records to an in-memory queue.
- Background worker `async_wal_writer_thread` writes records to `logs/wal.log`.
- Log records include CRC32 checksums (`action|ticker|qty|price|timestamp|crc32`) to detect corrupted records on startup.

### 4. Idempotency & Deduplication
- Request IDs (`req_id`) sent by clients are cached in an in-memory `dedup_cache`.
- Retried network requests return cached execution responses without re-running matching or double-charging accounts.

---

## Trade Commands

| Command | Format | Example | Description |
|---|---|---|---|
| **Register** | `REGISTER:<CLIENT_ID>` | `REGISTER:user1` | Create account with default $100,000 balance |
| **Market Buy** | `BUY:<CLIENT_ID>:<TICKER>:<QTY>[:<REQ_ID>]` | `BUY:user1:AAPL:10` | Execute market buy with account risk validation |
| **Market Sell** | `SELL:<CLIENT_ID>:<TICKER>:<QTY>[:<REQ_ID>]` | `SELL:user1:TSLA:5` | Execute market sell with holdings validation |
| **Limit Buy** | `LIMIT_BUY:<CLIENT_ID>:<TICKER>:<QTY>:<PRICE>` | `LIMIT_BUY:user1:AAPL:10:220.50` | Place resting limit buy order |
| **Limit Sell** | `LIMIT_SELL:<CLIENT_ID>:<TICKER>:<QTY>:<PRICE>` | `LIMIT_SELL:user1:NVDA:5:145.00` | Place resting limit sell order |
| **Cancel Order** | `CANCEL_ORDER:<TICKER>:<ORDER_ID>` | `CANCEL_ORDER:AAPL:7` | Cancel resting limit order |
| **View Book** | `ORDERBOOK:<TICKER>` | `ORDERBOOK:GOOGL` | View bid/ask price depth |
| **Account Info** | `ACCOUNT:<CLIENT_ID>` | `ACCOUNT:user1` | View cash balance and holdings |

---

## Performance & Testing

Testing is conducted using Python closed-loop multi-processing scripts (`stress_test.py`, `benchmark.py`).

### Windows Environment (Sample Run)
- **Concurrency:** 10 worker processes, 2,000 orders each (20,000 total requests)
- **Throughput:** ~11,000 to 12,500 orders/sec
- **Round-Trip Latency (p50):** ~0.55 ms – 0.95 ms
- **Round-Trip Latency (p99):** ~1.00 ms – 2.80 ms

*Note: Throughput and latency measurements represent closed-loop round-trip time over ZeroMQ sockets including client serialization and server response handling.*

---

## Known Limitations

| Area | Detail |
|---|---|
| **Account Persistence** | Account balances and holdings live in memory (`account_manager.hpp`). On server restart, accounts reset to initial defaults. |
| **Cancel Ownership** | `CANCEL_ORDER` matches order ID within a ticker shard, but does not currently check if the caller owns the order. |
| **Order Book Recovery** | The WAL records executed trade fills for auditing/volume tracking. Resting limit orders in the book are not saved to disk and reset on restart. |
| **No Authentication** | Client identity (`client_id`) is self-declared by the client string. Authentication & token validation belong in the API Gateway layer before reaching the matching engine. |
| **Shared Account Lock** | All account updates synchronize through a single `accounts_lock` mutex, creating contention across tickers for shared accounts. |

---

## Authors

- **Shaurya** ([@shaurya212121](https://github.com/shaurya212121))
- **Pranshu** ([@pranshup04](https://github.com/pranshup04))
