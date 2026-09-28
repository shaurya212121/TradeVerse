import React from 'react';
import { useMarketStore } from '../store/marketStore';

export const OrderBook: React.FC = () => {
  const { orderBook } = useMarketStore();

  if (!orderBook) {
    return (
      <div className="h-full flex items-center justify-center bg-surface border border-border text-text-muted text-sm font-mono">
        Waiting for order book...
      </div>
    );
  }

  // Find max qty for depth bars
  const maxAskQty = Math.max(...orderBook.asks.map(a => a.qty), 1);
  const maxBidQty = Math.max(...orderBook.bids.map(b => b.qty), 1);
  const maxQty = Math.max(maxAskQty, maxBidQty);

  return (
    <div className="h-full flex flex-col bg-surface border border-border text-sm">
      <div className="px-3 py-2 border-b border-border font-mono font-medium text-text-primary">
        Order Book depth
      </div>
      
      <div className="grid grid-cols-2 px-3 py-1 border-b border-border text-xs text-text-muted font-mono">
        <div>Price</div>
        <div className="text-right">Qty</div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar font-mono tabular-nums text-xs">
        {/* Asks (Sell Orders) - Red */}
        <div className="flex flex-col justify-end">
          {orderBook.asks.map((ask, i) => (
            <div key={`ask-${i}`} className="relative grid grid-cols-2 px-3 py-0.5 hover:bg-border cursor-pointer">
              <div 
                className="absolute top-0 bottom-0 right-0 bg-bear-red opacity-10" 
                style={{ width: `${(ask.qty / maxQty) * 100}%` }}
              />
              <div className="text-bear-red relative z-10">{ask.price.toFixed(2)}</div>
              <div className="text-right text-text-primary relative z-10">{ask.qty}</div>
            </div>
          ))}
        </div>

        {/* Spread visual separator */}
        <div className="h-px bg-border my-2 mx-3" />

        {/* Bids (Buy Orders) - Green */}
        <div className="flex flex-col">
          {orderBook.bids.map((bid, i) => (
            <div key={`bid-${i}`} className="relative grid grid-cols-2 px-3 py-0.5 hover:bg-border cursor-pointer">
              <div 
                className="absolute top-0 bottom-0 right-0 bg-bull-green opacity-10" 
                style={{ width: `${(bid.qty / maxQty) * 100}%` }}
              />
              <div className="text-bull-green relative z-10">{bid.price.toFixed(2)}</div>
              <div className="text-right text-text-primary relative z-10">{bid.qty}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
