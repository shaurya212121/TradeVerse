import { create } from 'zustand';
import type { Ticker, PriceTick, OrderBookSnapshot, TradeLogEntry, PortfolioPosition, OpenOrder, WalLogEntry } from '../types';

interface MarketState {
  activeTicker: Ticker;
  connectionStatus: 'connected' | 'connecting' | 'offline';
  prices: Record<Ticker, PriceTick | null>;
  orderBook: OrderBookSnapshot | null;
  tradeHistory: TradeLogEntry[];
  portfolio: PortfolioPosition[];
  cash: number;
  
  // Interactive Limit Price from Orderbook click-to-fill
  activeLimitPrice: number | null;
  setActiveLimitPrice: (price: number | null) => void;

  // Active Open Limit Orders
  openOrders: OpenOrder[];
  addOpenOrder: (order: OpenOrder) => void;
  removeOpenOrder: (orderId: number) => void;

  // System & Engine Telemetry
  latencyUs: number;
  updateLatency: (val: number) => void;
  walLogs: WalLogEntry[];
  addWalLog: (log: WalLogEntry) => void;

  // Actions
  setActiveTicker: (ticker: Ticker) => void;
  setConnectionStatus: (status: 'connected' | 'connecting' | 'offline') => void;
  updatePrice: (tick: PriceTick) => void;
  setOrderBook: (ob: OrderBookSnapshot) => void;
  addTradeLog: (log: TradeLogEntry) => void;
  setPortfolio: (port: PortfolioPosition[]) => void;
  setCash: (cash: number) => void;
}

const INITIAL_PRICES: Record<Ticker, PriceTick> = {
  AAPL: { ticker: 'AAPL', price: 182.45, change: 2.15, changePct: 1.19, timestamp: Date.now() },
  TSLA: { ticker: 'TSLA', price: 238.90, change: -4.30, changePct: -1.77, timestamp: Date.now() },
  NVDA: { ticker: 'NVDA', price: 875.20, change: 18.40, changePct: 2.15, timestamp: Date.now() },
  MSFT: { ticker: 'MSFT', price: 420.15, change: 3.50, changePct: 0.84, timestamp: Date.now() },
  GOOGL: { ticker: 'GOOGL', price: 172.60, change: -0.80, changePct: -0.46, timestamp: Date.now() },
  AMZN: { ticker: 'AMZN', price: 180.25, change: 1.10, changePct: 0.61, timestamp: Date.now() },
  'TCS.NS': { ticker: 'TCS.NS', price: 3910.00, change: 42.00, changePct: 1.08, timestamp: Date.now() },
  'RELIANCE.NS': { ticker: 'RELIANCE.NS', price: 2940.50, change: -12.30, changePct: -0.42, timestamp: Date.now() },
  'HDFCBANK.NS': { ticker: 'HDFCBANK.NS', price: 1515.20, change: 8.70, changePct: 0.58, timestamp: Date.now() },
  'INFY.NS': { ticker: 'INFY.NS', price: 1485.40, change: -5.60, changePct: -0.38, timestamp: Date.now() }
};

const INITIAL_OPEN_ORDERS: OpenOrder[] = [
  { orderId: 8104, ticker: 'AAPL', side: 'BUY', price: 181.50, qty: 25, timestamp: Date.now() - 45000 },
  { orderId: 8109, ticker: 'NVDA', side: 'SELL', price: 890.00, qty: 10, timestamp: Date.now() - 120000 },
  { orderId: 8114, ticker: 'MSFT', side: 'BUY', price: 415.00, qty: 15, timestamp: Date.now() - 250000 },
];

const INITIAL_PORTFOLIO: PortfolioPosition[] = [
  { ticker: 'AAPL', qty: 120, avgPrice: 178.50 },
  { ticker: 'NVDA', qty: 35, avgPrice: 810.00 },
  { ticker: 'MSFT', qty: 60, avgPrice: 412.30 },
  { ticker: 'TSLA', qty: 45, avgPrice: 242.10 }
];

const INITIAL_WAL_LOGS: WalLogEntry[] = [
  { seq: 984210, opcode: 'MATCH_EXEC', ticker: 'AAPL', price: 182.45, qty: 20, len: 64, checksum: '0x9E4B210F', status: 'COMMITTED', timestamp: Date.now() - 2500 },
  { seq: 984211, opcode: 'ORDER_NEW', ticker: 'TSLA', price: 238.90, qty: 50, len: 48, checksum: '0x3A7C812E', status: 'VALID', timestamp: Date.now() - 1800 },
  { seq: 984212, opcode: 'MATCH_EXEC', ticker: 'NVDA', price: 875.20, qty: 10, len: 64, checksum: '0xB41F68A2', status: 'COMMITTED', timestamp: Date.now() - 1100 },
  { seq: 984213, opcode: 'ORDER_CANCEL', ticker: 'MSFT', price: 415.00, qty: 15, len: 32, checksum: '0x18C3FA70', status: 'VALID', timestamp: Date.now() - 450 },
];

export const useMarketStore = create<MarketState>((set) => ({
  activeTicker: 'AAPL',
  connectionStatus: 'connecting',
  prices: INITIAL_PRICES,
  orderBook: null,
  tradeHistory: [
    { tradeId: 90214, ticker: 'AAPL', side: 'BUY', qty: 25, price: 182.45, timestamp: Date.now() - 3200 },
    { tradeId: 90215, ticker: 'NVDA', side: 'SELL', qty: 10, price: 875.20, timestamp: Date.now() - 7400 },
    { tradeId: 90216, ticker: 'AAPL', side: 'SELL', qty: 50, price: 182.40, timestamp: Date.now() - 12000 },
    { tradeId: 90217, ticker: 'TSLA', side: 'BUY', qty: 15, price: 238.90, timestamp: Date.now() - 18500 },
  ],
  portfolio: INITIAL_PORTFOLIO,
  cash: 84520.50,
  
  activeLimitPrice: null,
  setActiveLimitPrice: (price) => set({ activeLimitPrice: price }),

  openOrders: INITIAL_OPEN_ORDERS,
  addOpenOrder: (order) => set((state) => ({ openOrders: [order, ...state.openOrders] })),
  removeOpenOrder: (orderId) => set((state) => ({ openOrders: state.openOrders.filter(o => o.orderId !== orderId) })),

  latencyUs: 312,
  updateLatency: (val) => set({ latencyUs: val }),

  walLogs: INITIAL_WAL_LOGS,
  addWalLog: (log) => set((state) => ({ walLogs: [log, ...state.walLogs].slice(0, 30) })),

  setActiveTicker: (ticker) => set({ activeTicker: ticker }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  updatePrice: (tick) => set((state) => ({
    prices: { ...state.prices, [tick.ticker]: tick }
  })),
  setOrderBook: (ob) => set({ orderBook: ob }),
  addTradeLog: (log) => set((state) => ({
    tradeHistory: [log, ...state.tradeHistory].slice(0, 100)
  })),
  setPortfolio: (port) => set({ portfolio: port }),
  setCash: (cash) => set({ cash }),
}));

