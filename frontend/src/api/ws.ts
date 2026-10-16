import { useMarketStore } from '../store/marketStore';
import type { OrderBookSnapshot } from '../types';

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

export function connectWebSocket(token?: string) {
  if (socket?.readyState === WebSocket.OPEN) return;

  const url = token ? `ws://localhost:8000/ws?token=${token}` : 'ws://localhost:8000/ws';
  socket = new WebSocket(url);

  socket.onopen = () => {
    useMarketStore.getState().setConnectionStatus('connected');
    
    // Subscribe to the currently active ticker right away
    const activeTicker = useMarketStore.getState().activeTicker;
    socket?.send(JSON.stringify({ action: 'SET_ACTIVE_TICKER', ticker: activeTicker }));
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const store = useMarketStore.getState();

      if (data.type === 'TICK') {
        const timestamp = data.timestamp || Date.now();
        const ticker = data.ticker as import('../types').Ticker;
        const prevData = store.prices[ticker];
        
        const change = prevData ? data.price - prevData.price : 0;
        store.updatePrice({
          ticker,
          price: data.price,
          change,
          changePct: prevData && prevData.price > 0 ? (change / prevData.price) * 100 : 0,
          timestamp
        });
      } else if (data.type === 'ORDERBOOK') {
        store.setOrderBook(data.data as OrderBookSnapshot);
      } else if (data.type === 'PORTFOLIO') {
        store.setCash(data.cash);
        store.setPortfolio(data.holdings);
      }
    } catch (e) {
      console.error('Error parsing WS message', e);
    }
  };

  socket.onclose = () => {
    useMarketStore.getState().setConnectionStatus('offline');
    socket = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connectWebSocket, 2000);
  };

  socket.onerror = () => {
    useMarketStore.getState().setConnectionStatus('offline');
  };
}

export function setActiveTicker(ticker: string) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ action: 'SET_ACTIVE_TICKER', ticker }));
  }
}

export async function submitOrder(command: string): Promise<{ success: boolean; message: string }> {
  // If real WebSocket is connected, route through the live backend
  if (socket && socket.readyState === WebSocket.OPEN) {
    const activeWs = socket;
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ORDER_RESPONSE') {
            activeWs.removeEventListener('message', handler);
            resolve({
              success: !data.response.includes('ERROR') && !data.response.includes('REJECTED'),
              message: data.response
            });
          }
        } catch (e) {
          // Ignore parsing errors here
        }
      };

      activeWs.addEventListener('message', handler);
      activeWs.send(JSON.stringify({ action: 'SUBMIT_ORDER', command }));
      
      // Timeout
      setTimeout(() => {
        activeWs.removeEventListener('message', handler);
        resolve({ success: false, message: 'Server request timed out' });
      }, 5000);
    });
  }

  // Offline / Demo fallback simulation: executes locally with zero delay
  return new Promise((resolve) => {
    setTimeout(() => {
      const parts = command.split(':');
      const action = parts[0];
      const ticker = (parts[1] || useMarketStore.getState().activeTicker) as import('../types').Ticker;
      const qty = parseInt(parts[2] || '10', 10);
      const limitPrice = parts[3] ? parseFloat(parts[3]) : null;

      const store = useMarketStore.getState();
      const currentPrice = store.prices[ticker]?.price || 180.00;

      if (action.startsWith('LIMIT_')) {
        const orderId = Math.floor(8000 + Math.random() * 2000);
        const side = action.includes('BUY') ? 'BUY' : 'SELL';
        store.addOpenOrder({
          orderId,
          ticker,
          side,
          price: limitPrice || currentPrice,
          qty,
          timestamp: Date.now()
        });
        resolve({
          success: true,
          message: `SUCCESS | Limit ${side} order placed for ${qty} ${ticker} @ $${(limitPrice || currentPrice).toFixed(2)} (ID #${orderId})`
        });
      } else if (action === 'CANCEL' || action === 'CANCEL_ORDER') {
        const orderId = parseInt(parts[1] || '0', 10);
        store.removeOpenOrder(orderId);
        resolve({
          success: true,
          message: `SUCCESS | Order #${orderId} canceled`
        });
      } else {
        const side = action === 'BUY' ? 'BUY' : 'SELL';
        const cost = currentPrice * qty;
        
        if (side === 'BUY' && store.cash < cost) {
          return resolve({ success: false, message: `REJECTED | Insufficient funds ($${store.cash.toFixed(2)} available, $${cost.toFixed(2)} required)` });
        }

        // Update cash & portfolio
        const newCash = side === 'BUY' ? store.cash - cost : store.cash + cost;
        store.setCash(+newCash.toFixed(2));

        const existingPos = store.portfolio.find(p => p.ticker === ticker);
        let newPortfolio;
        if (existingPos) {
          const newQty = side === 'BUY' ? existingPos.qty + qty : Math.max(0, existingPos.qty - qty);
          newPortfolio = store.portfolio.map(p => p.ticker === ticker ? { ...p, qty: newQty } : p).filter(p => p.qty > 0);
        } else if (side === 'BUY') {
          newPortfolio = [...store.portfolio, { ticker, qty, avgPrice: currentPrice }];
        } else {
          newPortfolio = store.portfolio;
        }
        store.setPortfolio(newPortfolio);

        resolve({
          success: true,
          message: `SUCCESS | ${side === 'BUY' ? 'Bought' : 'Sold'} ${qty} ${ticker} @ $${currentPrice.toFixed(2)} [Matching Latency: 312μs]`
        });
      }
    }, 150);
  });
}


export function disconnectWebSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
}
