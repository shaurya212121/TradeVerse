import type { Ticker, PriceTick, TradeOrderRequest, TradeOrderResponse } from '../types';
import { useMarketStore } from '../store/marketStore';

const TICKERS: Ticker[] = ["AAPL", "TSLA", "GOOGL", "AMZN", "MSFT", "NVDA", "TCS.NS", "RELIANCE.NS", "HDFCBANK.NS", "INFY.NS"];

const mockPrices: Record<Ticker, number> = {
  AAPL: 150.0, TSLA: 220.0, GOOGL: 130.0, AMZN: 140.0, MSFT: 330.0,
  NVDA: 450.0, "TCS.NS": 3500.0, "RELIANCE.NS": 2400.0, "HDFCBANK.NS": 1600.0, "INFY.NS": 1400.0
};

let mockInterval: number;

export function startMockDataStream() {
  useMarketStore.getState().setConnectionStatus('connected');
  
  mockInterval = setInterval(() => {
    // Generate random ticks for a few tickers
    TICKERS.forEach(ticker => {
      if (Math.random() > 0.3) {
        const oldPrice = mockPrices[ticker];
        const volatility = oldPrice * 0.001;
        const change = (Math.random() * volatility * 2) - volatility;
        const newPrice = oldPrice + change;
        mockPrices[ticker] = newPrice;
        
        const tick: PriceTick = {
          ticker,
          price: newPrice,
          change: change,
          changePct: (change / oldPrice) * 100,
          timestamp: Date.now()
        };
        useMarketStore.getState().updatePrice(tick);
      }
    });

    // Update orderbook for active ticker
    const activeTicker = useMarketStore.getState().activeTicker;
    const basePrice = mockPrices[activeTicker];
    
    const asks = Array.from({length: 10}).map((_, i) => ({
      price: basePrice + (basePrice * 0.0005 * (i + 1)),
      qty: Math.floor(Math.random() * 500) + 10
    }));
    
    const bids = Array.from({length: 10}).map((_, i) => ({
      price: basePrice - (basePrice * 0.0005 * (i + 1)),
      qty: Math.floor(Math.random() * 500) + 10
    }));

    useMarketStore.getState().setOrderBook({
      ticker: activeTicker,
      asks: asks.reverse(), // highest ask at top
      bids
    });

  }, 1000) as unknown as number;
}

export function stopMockDataStream() {
  clearInterval(mockInterval);
  useMarketStore.getState().setConnectionStatus('offline');
}

export async function submitMockOrder(req: TradeOrderRequest): Promise<TradeOrderResponse> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        success: true,
        message: `SUCCESS | ${req.type} ${req.qty} ${req.ticker} placed.`
      });
    }, 300);
  });
}
