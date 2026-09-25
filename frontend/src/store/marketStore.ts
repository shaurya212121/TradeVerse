import { create } from 'zustand';
import type { Ticker, PriceTick, OrderBookSnapshot, TradeLogEntry, PortfolioPosition } from '../types';

interface MarketState {
  activeTicker: Ticker;
  connectionStatus: 'connected' | 'connecting' | 'offline';
  prices: Record<Ticker, PriceTick | null>;
  orderBook: OrderBookSnapshot | null;
  tradeHistory: TradeLogEntry[];
  portfolio: PortfolioPosition[];
  
  setActiveTicker: (ticker: Ticker) => void;
  setConnectionStatus: (status: 'connected' | 'connecting' | 'offline') => void;
  updatePrice: (tick: PriceTick) => void;
  setOrderBook: (ob: OrderBookSnapshot) => void;
  addTradeLog: (log: TradeLogEntry) => void;
  setPortfolio: (port: PortfolioPosition[]) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  activeTicker: 'AAPL',
  connectionStatus: 'connecting',
  prices: {
    AAPL: null, TSLA: null, GOOGL: null, AMZN: null, MSFT: null,
    NVDA: null, 'TCS.NS': null, 'RELIANCE.NS': null, 'HDFCBANK.NS': null, 'INFY.NS': null
  } as Record<Ticker, PriceTick | null>,
  orderBook: null,
  tradeHistory: [],
  portfolio: [],

  setActiveTicker: (ticker) => set({ activeTicker: ticker }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  updatePrice: (tick) => set((state) => ({
    prices: { ...state.prices, [tick.ticker]: tick }
  })),
  setOrderBook: (ob) => set({ orderBook: ob }),
  addTradeLog: (log) => set((state) => ({
    tradeHistory: [log, ...state.tradeHistory].slice(0, 50) // keep last 50
  })),
  setPortfolio: (port) => set({ portfolio: port }),
}));
