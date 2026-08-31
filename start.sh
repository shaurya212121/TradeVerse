#!/bin/bash
echo "========================================"
echo " TradeVerse — Ultimate Mac Auto-Setup"
echo "========================================"
echo ""

# 1. Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "[FATAL] Homebrew is not installed! Paste this in your terminal first:"
    echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
fi

# 2. Check and Install Mac C++ Dependencies automatically
echo "[SETUP] Checking system dependencies..."
for pkg in zeromq cppzmq pkg-config; do
    if ! brew list $pkg &>/dev/null; then
        echo "[SETUP] Installing missing package: $pkg..."
        brew install $pkg
    fi
done

# 3. Check and Install Python Dependencies automatically
echo "[SETUP] Checking Python dependencies..."
if ! python3 -c "import yfinance, pandas, zmq" &> /dev/null; then
    echo "[SETUP] Missing Python packages. Installing them now..."
    python3 -m pip install yfinance pandas pyzmq plotly streamlit --break-system-packages 2>/dev/null || python3 -m pip install yfinance pandas pyzmq plotly streamlit
fi

# 4. Create data directory
mkdir -p data

# 5. Fetch market data
echo "[1/4] Syncing latest market data from Yahoo Finance..."
python3 python/data.py
if [ $? -ne 0 ]; then
    echo "[FATAL] Data fetch failed. Please check your network or Yahoo Finance."
    exit 1
fi
echo ""

# 6. Kill running server
echo "[2/4] Stopping any running server instance..."
pkill -f "cpp/server" >/dev/null 2>&1
sleep 1

# 7. Compile C++ server
echo "[3/4] Compiling C++ server for Mac..."
cd cpp

# Get exact paths using pkg-config AND brew prefix to guarantee it finds zmq.hpp
BREW_INC="$(brew --prefix)/include"
BREW_LIB="$(brew --prefix)/lib"
PKG_FLAGS=$(pkg-config --cflags --libs libzmq 2>/dev/null)

# Compile with all possible paths to make it bulletproof
g++ -std=c++17 -O3 -I"$BREW_INC" -L"$BREW_LIB" $PKG_FLAGS -o server server.cpp -lzmq -lpthread

if [ $? -ne 0 ]; then
    echo "[FATAL] Build failed."
    exit 1
fi
echo "[OK] server built successfully."
cd ..
echo ""

# 8. Launch
echo "[4/4] Starting TradeVerse server..."
echo ""
cpp/server
