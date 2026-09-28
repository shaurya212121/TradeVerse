# TradeVerse Server Build
# Requires: ZeroMQ (libzmq) and cppzmq headers
#
# On Windows (MSYS2/MinGW):
#   pacman -S mingw-w64-x86_64-zeromq
#   make
#
# On Linux:
#   sudo apt install libzmq3-dev   (Ubuntu/Debian)
#   make
#
# On macOS:
#   brew install zeromq
#   make

CXX      = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra

# Platform-specific linker flags
ifeq ($(OS),Windows_NT)
    LDFLAGS = -lzmq -lws2_32 -lpthread
    TARGET  = server.exe
else
    LDFLAGS = -lzmq -lpthread
    TARGET  = server
endif

SRC = server.cpp

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) -o $(TARGET) $(SRC) $(LDFLAGS)
	@echo "[BUILD] $(TARGET) compiled successfully."

run: $(TARGET)
	@cd .. && cpp/$(TARGET)

clean:
ifeq ($(OS),Windows_NT)
	@if exist $(TARGET) del /Q $(TARGET)
else
	@rm -f $(TARGET)
endif
	@echo "[CLEAN] Build artifacts removed."
