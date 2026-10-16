import { useMarketStore } from '../store/marketStore';
import type { OrderBookSnapshot, Ticker, WalLogEntry } from '../types';

let mockInterval: number | null = null;
let walInterval: number | null = null;

export function generateMockOrderBook(ticker: Ticker, midPrice: number): OrderBookSnapshot {
  const bids = [];
  const asks = [];

  const spread = midPrice > 1000 ? 1.0 : 0.1;

  for (let i = 1; i <= 8; i++) {
    const bidPrice = +(midPrice - i * spread).toFixed(2);
    const bidQty = Math.floor(Math.random() * 80) + 10;
    bids.push({ price: bidPrice, qty: bidQty });

    const askPrice = +(midPrice + i * spread).toFixed(2);
    const askQty = Math.floor(Math.random() * 80) + 10;
    asks.push({ price: askPrice, qty: askQty });
  }

  return { ticker, bids, asks };
}

export function startMockMarketSimulation() {
  if (mockInterval) return;

  mockInterval = window.setInterval(() => {
    const store = useMarketStore.getState();
    if (store.connectionStatus === 'connected') return; // Do not mock if real WS is alive

    // Jitter active ticker price
    const ticker = store.activeTicker;
    const current = store.prices[ticker];
    if (current) {
      const delta = (Math.random() - 0.49) * (current.price * 0.001);
      const newPrice = +(current.price + delta).toFixed(2);
      const change = +(newPrice - (current.price - current.change)).toFixed(2);
      const changePct = +((change / (newPrice - change)) * 100).toFixed(2);

      store.updatePrice({
        ticker,
        price: newPrice,
        change,
        changePct,
        timestamp: Date.now()
      });

      // Update Orderbook depth around new price
      store.setOrderBook(generateMockOrderBook(ticker, newPrice));
    }

    // Jitter microsecond latency (290 - 340 us)
    const jitterLatency = Math.floor(310 + (Math.random() * 30 - 15));
    store.updateLatency(jitterLatency);
  }, 1000);

  // WAL log generator for live telemetry inspector
  walInterval = window.setInterval(() => {
    const store = useMarketStore.getState();
    const opcodes: WalLogEntry['opcode'][] = ['MATCH_EXEC', 'ORDER_NEW', 'ORDER_NEW', 'ORDER_CANCEL'];
    const op = opcodes[Math.floor(Math.random() * opcodes.length)];
    const ticker = store.activeTicker;
    const price = store.prices[ticker]?.price || 182.45;
    const qty = [10, 25, 50, 100, 200][Math.floor(Math.random() * 5)];
    const seq = store.walLogs.length > 0 ? store.walLogs[0].seq + 1 : 984220;
    const hex = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0');

    store.addWalLog({
      seq,
      opcode: op,
      ticker,
      price,
      qty,
      len: op === 'MATCH_EXEC' ? 64 : 48,
      checksum: `0x${hex}`,
      status: op === 'MATCH_EXEC' ? 'COMMITTED' : 'VALID',
      timestamp: Date.now()
    });
  }, 2200);
}

export function stopMockMarketSimulation() {
  if (mockInterval) {
    clearInterval(mockInterval);
    mockInterval = null;
  }
  if (walInterval) {
    clearInterval(walInterval);
    walInterval = null;
  }
}
