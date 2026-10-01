@echo off
title TradeVerse Benchmark
echo ========================================
echo   TradeVerse — Benchmark Sequence
echo ========================================
echo.

:: Check if server is running
tasklist /FI "IMAGENAME eq server.exe" 2>NUL | find /I /N "server.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [INFO] TradeVerse server is already running. Proceeding to benchmark...
) else (
    echo [INFO] TradeVerse server is NOT running.
    echo Starting server in the background...
    
    cd backend\cpp
    
    echo Compiling server...
    g++ -std=c++17 -O2 -o server.exe server.cpp -lzmq -lws2_32 -lpthread
    if %ERRORLEVEL% NEQ 0 (
        echo [FATAL] Build failed.
        pause
        exit /b 1
    )
    
    cd ..\..
    start "TradeVerse Server (Benchmark)" cmd /c "cd backend && cpp\server.exe"
    
    echo Waiting for server to initialize...
    timeout /t 2 /nobreak >nul
)

echo.
echo Running Python Benchmark...
echo.
python backend\python\benchmark.py

echo.
echo [INFO] Benchmark complete.
echo If the server was started by this script, it is still running in a separate window.
pause
