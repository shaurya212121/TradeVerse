#!/bin/bash
echo "========================================"
echo " TradeVerse — Startup Sequence (Mac/Linux)"
echo "========================================"
echo ""

# Step 1: Fetch latest market data
echo "[1/4] Syncing latest market data from Yahoo Finance..."
python3 python/data.py
if [ $? -ne 0 ]; then
    echo "[WARNING] Data fetch failed. Checking for existing CSV..."
    if [ -f "data/market_data1.csv" ]; then
        echo "[OK] Found existing data/market_data1.csv — proceeding with cached data."
    else
        echo "[FATAL] No market data available. Cannot start server."
        exit 1
    fi
fi
echo ""

# Step 2: Kill any running server instance
echo "[2/4] Stopping any running server instance..."
pkill -f "cpp/server" >/dev/null 2>&1
sleep 1

# Step 3: Build the server
echo "[3/4] Compiling server..."
cd cpp
g++ -std=c++17 -O3 -I/opt/homebrew/include -L/opt/homebrew/lib -I/usr/local/include -L/usr/local/lib -o server server.cpp -lzmq -lpthread
if [ $? -ne 0 ]; then
    echo "[FATAL] Build failed. Fix compile errors and retry."
    exit 1
fi
echo "[OK] server built successfully."
cd ..
echo ""

# Step 4: Launch the server
echo "[4/4] Starting TradeVerse server..."
echo ""
cpp/server
