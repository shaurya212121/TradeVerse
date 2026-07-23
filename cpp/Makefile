# TradeVerse Server Build
# Requires: ZeroMQ (libzmq) and cppzmq headers
#
# On Windows (MSYS2/MinGW):
#   pacman -S mingw-w64-x86_64-zeromq
#   make
#
# On Linux/macOS:
#   sudo apt install libzmq3-dev   (Ubuntu/Debian)
#   brew install zeromq             (macOS)
#   make

CXX      = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra
LDFLAGS  = -lzmq -lws2_32 -lpthread

TARGET   = server.exe
SRC      = server.cpp

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) -o $(TARGET) $(SRC) $(LDFLAGS)
	@echo "[BUILD] $(TARGET) compiled successfully."

run: $(TARGET)
	@cd .. && cpp/$(TARGET)

clean:
	@if exist $(TARGET) del /Q $(TARGET)
	@echo "[CLEAN] Build artifacts removed."
