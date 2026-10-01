import asyncio
import json
import logging
import re
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import zmq
import zmq.asyncio
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Gateway")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

context = zmq.asyncio.Context()

# Global state for connected clients
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.active_ticker: str = "AAPL" # Default active ticker to poll

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.disconnect(dead)

manager = ConnectionManager()

# ZMQ REQ Socket (with a lock so concurrent WS requests don't break the REQ-REP pattern)
req_socket = context.socket(zmq.REQ)
req_socket.connect("tcp://localhost:5556")
req_socket.setsockopt(zmq.RCVTIMEO, 2000) # 2 second timeout
req_lock = asyncio.Lock()

async def send_zmq_request(command: str) -> str:
    global req_socket
    async with req_lock:
        await req_socket.send_string(command)
        try:
            response = await req_socket.recv_string()
            return response
        except zmq.error.Again:
            logger.error("ZMQ REQ timed out. C++ server might be down.")
            # Disconnect all clients to show offline in UI
            for conn in list(manager.active_connections):
                await conn.close()
            
            # Recreate socket to clear the state
            req_socket.close()
            req_socket = context.socket(zmq.REQ)
            req_socket.connect("tcp://localhost:5556")
            req_socket.setsockopt(zmq.RCVTIMEO, 2000)
            raise Exception("Server offline")

def parse_orderbook_text(text: str, ticker: str) -> dict:
    """
    Parses the plain text ORDERBOOK from the C++ server into a JSON structure
    that the React frontend expects.
    """
    lines = text.strip().split('\n')
    asks = []
    bids = []
    
    current_section = None
    for line in lines:
        line = line.strip()
        if "ASKS (Sellers)" in line:
            current_section = "asks"
            continue
        if ">>> SPREAD" in line:
            current_section = "bids"
            continue
        if "BIDS (Buyers)" in line:
            continue
        
        # Parse price and qty: "$    150.50     x    100"
        match = re.search(r'\$\s*([0-9.]+)\s*x\s*([0-9]+)', line)
        if match:
            price = float(match.group(1))
            qty = int(match.group(2))
            if current_section == "asks":
                asks.append({"price": price, "qty": qty})
            elif current_section == "bids":
                bids.append({"price": price, "qty": qty})
                
    # Sort just in case (asks ascending, bids descending)
    asks.sort(key=lambda x: x["price"])
    bids.sort(key=lambda x: x["price"], reverse=True)
    
    return {
        "ticker": ticker,
        "bids": bids,
        "asks": asks
    }

async def zmq_sub_worker():
    """Listens for PUB messages and broadcasts them to all WebSockets."""
    sub_socket = context.socket(zmq.SUB)
    sub_socket.connect("tcp://localhost:5555")
    sub_socket.setsockopt_string(zmq.SUBSCRIBE, "")
    
    logger.info("ZMQ SUB worker started.")
    while True:
        try:
            msg = await sub_socket.recv_string()
            # Format is usually TICKER,PRICE
            parts = msg.split(",")
            if len(parts) == 2:
                ticker = parts[0]
                price = float(parts[1].replace('$', ''))
                await manager.broadcast({
                    "type": "TICK",
                    "ticker": ticker,
                    "price": price,
                    "timestamp": asyncio.get_event_loop().time() * 1000 # Approximation
                })
        except Exception as e:
            logger.error(f"Error in SUB worker: {e}")

async def orderbook_poller():
    """Polls the active ticker's order book every 500ms."""
    logger.info("Orderbook poller started.")
    while True:
        if manager.active_connections:
            ticker = manager.active_ticker
            try:
                response = await send_zmq_request(f"ORDERBOOK:{ticker}")
                if "ERROR" not in response:
                    ob_data = parse_orderbook_text(response, ticker)
                    await manager.broadcast({
                        "type": "ORDERBOOK",
                        "data": ob_data
                    })
            except Exception as e:
                logger.error(f"Error polling orderbook: {e}")
        await asyncio.sleep(0.5)

async def account_poller():
    """Polls the gateway account cash and holdings every 1s."""
    logger.info("Account poller started.")
    while True:
        if manager.active_connections:
            try:
                response = await send_zmq_request("ACCOUNT:web_gateway")
                if "ERROR" not in response:
                    # ACCOUNT: web_gateway | Cash: $100000.00 | Holdings: AAPL: 10, TSLA: 5
                    cash_match = re.search(r"Cash:\s*\$([0-9.]+)", response)
                    cash = float(cash_match.group(1)) if cash_match else 0.0
                    
                    holdings = []
                    if "Holdings: " in response and "None" not in response.split("Holdings: ")[1]:
                        holdings_str = response.split("Holdings: ")[1].strip()
                        pairs = holdings_str.split(",")
                        for pair in pairs:
                            if ":" in pair:
                                tkr, qty = pair.split(":")
                                holdings.append({"ticker": tkr.strip(), "qty": int(qty.strip()), "avgPrice": 0})
                                
                    await manager.broadcast({
                        "type": "PORTFOLIO",
                        "cash": cash,
                        "holdings": holdings
                    })
            except Exception as e:
                logger.error(f"Error polling account: {e}")
        
        await asyncio.sleep(1.0)


@app.on_event("startup")
async def startup_event():
    # Register the gateway's account with the C++ engine
    try:
        res = await send_zmq_request("REGISTER:web_gateway")
        logger.info(f"Registered gateway account: {res}")
    except Exception as e:
        logger.error(f"Failed to register gateway account: {e}")
        
    asyncio.create_task(zmq_sub_worker())
    asyncio.create_task(orderbook_poller())
    asyncio.create_task(account_poller())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            # Action: change active ticker
            if payload.get("action") == "SET_ACTIVE_TICKER":
                manager.active_ticker = payload.get("ticker", "AAPL")
                
            # Action: place order
            elif payload.get("action") == "SUBMIT_ORDER":
                cmd = payload.get("command") # e.g., "BUY:AAPL:10"
                if cmd:
                    # Inject client_id and idempotency UUID for MARKET orders
                    parts = cmd.strip().split(":")
                    if len(parts) >= 3 and parts[0].upper() in ("BUY", "SELL"):
                        action = parts[0].upper()
                        ticker = parts[1].upper()
                        qty = parts[2]
                        req_id = str(uuid.uuid4())
                        cmd = f"{action}:web_gateway:{ticker}:{qty}:{req_id}"

                    logger.info(f"Submitting order: {cmd}")
                    res = await send_zmq_request(cmd)
                    await websocket.send_json({
                        "type": "ORDER_RESPONSE",
                        "response": res
                    })
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
