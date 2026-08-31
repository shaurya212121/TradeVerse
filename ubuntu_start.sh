#!/bin/bash
echo "========================================"
echo " TradeVerse — Ubuntu Auto-Setup"
echo "========================================"
echo ""

echo "[SETUP] Installing Ubuntu dependencies (you may be asked for your password)..."
sudo apt-get update
sudo apt-get install -y build-essential libzmq3-dev python3-pip

echo "[SETUP] Installing Python dependencies..."
python3 -m pip install yfinance pandas pyzmq plotly streamlit --break-system-packages 2>/dev/null || python3 -m pip install yfinance pandas pyzmq plotly streamlit

mkdir -p data

echo "[1/4] Syncing latest market data from Yahoo Finance..."
python3 python/data.py
if [ $? -ne 0 ]; then
    echo "[FATAL] Data fetch failed. Please check your network."
    exit 1
fi
echo ""

echo "[2/4] Stopping any running server instance..."
pkill -f "cpp/server" >/dev/null 2>&1
sleep 1

echo "[3/4] Compiling C++ server for Ubuntu..."
cd cpp
g++ -std=c++17 -O3 -o server server.cpp -lzmq -lpthread
if [ $? -ne 0 ]; then
    echo "[FATAL] Build failed."
    exit 1
fi
echo "[OK] server built successfully."
cd ..
echo ""

echo "[4/4] Starting TradeVerse server..."
echo ""
cpp/server
