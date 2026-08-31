#!/bin/bash
echo "========================================"
echo " TradeVerse — One-Click Mac Startup"
echo "========================================"
echo ""

# 1. Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "[FATAL] Homebrew is not installed on this Mac."
    echo "Please run this command first to install it:"
    echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
fi

# 2. Automatically install C++ dependencies if missing
echo "[SETUP] Checking Mac dependencies..."
brew list zeromq &>/dev/null || brew install zeromq
brew list cppzmq &>/dev/null || brew install cppzmq

# 3. Ensure data folder exists
mkdir -p data

# 4. Fetch latest market data
echo "[1/4] Syncing latest market data from Yahoo Finance..."
python3 python/data.py
if [ $? -ne 0 ]; then
    echo "[WARNING] Data fetch failed. Checking for existing CSV..."
    if [ ! -f "data/market_data1.csv" ]; then
        echo "[FATAL] No market data available. Run 'python3 -m pip install --upgrade yfinance pandas' and try again."
        exit 1
    fi
fi
echo ""

# 5. Kill any running server instance
echo "[2/4] Stopping any running server instance..."
pkill -f "cpp/server" >/dev/null 2>&1
sleep 1

# 6. Build the server using dynamic Homebrew paths
echo "[3/4] Compiling C++ server for Mac..."
cd cpp
g++ -std=c++17 -O3 -I$(brew --prefix)/include -L$(brew --prefix)/lib -o server server.cpp -lzmq -lpthread
if [ $? -ne 0 ]; then
    echo "[FATAL] Build failed."
    exit 1
fi
echo "[OK] server built successfully."
cd ..
echo ""

# 7. Launch the server
echo "[4/4] Starting TradeVerse server..."
echo ""
cpp/server
