import { useMarketStore } from '../store/marketStore';
import type { OrderBookSnapshot } from '../types';

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

export function connectWebSocket() {
  if (socket?.readyState === WebSocket.OPEN) return;

  socket = new WebSocket('ws://localhost:8000/ws');

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
        const prevData = store.prices[data.ticker];
        
        const change = prevData ? data.price - prevData.price : 0;
        store.updatePrice({
          ticker: data.ticker,
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
  return new Promise((resolve) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return resolve({ success: false, message: 'Not connected to server' });
    }

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ORDER_RESPONSE') {
          socket?.removeEventListener('message', handler);
          resolve({
            success: !data.response.includes('ERROR') && !data.response.includes('REJECTED'),
            message: data.response
          });
        }
      } catch (e) {
        // Ignore parsing errors here
      }
    };

    socket.addEventListener('message', handler);
    socket.send(JSON.stringify({ action: 'SUBMIT_ORDER', command }));
    
    // Timeout
    setTimeout(() => {
      socket?.removeEventListener('message', handler);
      resolve({ success: false, message: 'Server request timed out' });
    }, 5000);
  });
}

export function disconnectWebSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
}
