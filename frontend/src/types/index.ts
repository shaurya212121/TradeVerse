export type Ticker = 
  | "AAPL" | "TSLA" | "GOOGL" | "AMZN" | "MSFT" 
  | "NVDA" | "TCS.NS" | "RELIANCE.NS" | "HDFCBANK.NS" | "INFY.NS";

export interface PriceTick {
  ticker: Ticker;
  price: number;
  change: number;
  changePct: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBookSnapshot {
  ticker: Ticker;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface TradeOrderRequest {
  type: "BUY" | "SELL" | "LIMIT_BUY" | "LIMIT_SELL" | "CANCEL" | "CANCEL_ORDER";
  ticker: Ticker;
  qty: number;
  price?: number;
  orderId?: number;
}

export interface TradeOrderResponse {
  success: boolean;
  message: string;
  tradeId?: number;
  orderId?: number;
}

export interface TradeLogEntry {
  tradeId: number;
  ticker: Ticker;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  timestamp: number;
}

export interface PortfolioPosition {
  ticker: Ticker;
  qty: number;
  avgPrice: number;
}
