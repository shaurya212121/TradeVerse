@echo off
title TradeVerse Launcher
echo.
echo  ========================================
echo   TradeVerse — Startup Sequence
echo  ========================================
echo.

:: Step 1: Fetch latest market data from Yahoo Finance
echo [1/4] Syncing latest market data from Yahoo Finance...
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

:: Step 2: Kill any running server instance (Windows locks .exe while it runs)
echo [2/4] Stopping any running server instance...
taskkill /F /IM server.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Step 3: Build the server
echo [3/4] Compiling server...
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
echo [4/4] Starting TradeVerse server...
echo.
cpp\server.exe
