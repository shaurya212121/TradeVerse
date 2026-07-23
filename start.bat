@echo off
title TradeVerse Launcher
echo.
echo  ========================================
echo   TradeVerse — Startup Sequence
echo  ========================================
echo.

:: Step 1: Fetch latest market data from Yahoo Finance
echo [1/3] Syncing latest market data from Yahoo Finance...
echo.
python python\data.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Data fetch failed. Checking for existing CSV...
    if exist data\market_data1.csv (
        echo [OK] Found existing data\market_data1.csv — proceeding with cached data.
    ) else (
        echo [FATAL] No market data available. Cannot start server.
        pause
        exit /b 1
    )
)
echo.

:: Step 2: Build the server
echo [2/3] Compiling server...
cd cpp
g++ -std=c++17 -O2 -o server.exe server.cpp -lzmq -lws2_32 -lpthread
if %ERRORLEVEL% NEQ 0 (
    echo [FATAL] Build failed. Fix compile errors and retry.
    cd ..
    pause
    exit /b 1
)
echo [OK] server.exe built successfully.
cd ..
echo.

:: Step 3: Launch the server
echo [3/3] Starting TradeVerse server...
echo.
cpp\server.exe
