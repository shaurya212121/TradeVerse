import React from 'react';
import { useMarketStore } from '../store/marketStore';
import { Layers, ArrowUpDown } from 'lucide-react';

export const OrderBook: React.FC = () => {
  const { orderBook, prices, activeTicker, setActiveLimitPrice } = useMarketStore();
  const currentPrice = prices[activeTicker]?.price || 180.00;

  // Generate fallback depth if orderBook is null yet
  const bids = orderBook?.bids?.length ? orderBook.bids : [
    { price: +(currentPrice - 0.05).toFixed(2), qty: 45 },
    { price: +(currentPrice - 0.10).toFixed(2), qty: 120 },
    { price: +(currentPrice - 0.15).toFixed(2), qty: 85 },
    { price: +(currentPrice - 0.20).toFixed(2), qty: 210 },
    { price: +(currentPrice - 0.25).toFixed(2), qty: 140 },
    { price: +(currentPrice - 0.30).toFixed(2), qty: 320 },
  ];

  const asks = orderBook?.asks?.length ? orderBook.asks : [
    { price: +(currentPrice + 0.30).toFixed(2), qty: 310 },
    { price: +(currentPrice + 0.25).toFixed(2), qty: 165 },
    { price: +(currentPrice + 0.20).toFixed(2), qty: 190 },
    { price: +(currentPrice + 0.15).toFixed(2), qty: 95 },
    { price: +(currentPrice + 0.10).toFixed(2), qty: 130 },
    { price: +(currentPrice + 0.05).toFixed(2), qty: 50 },
  ];

  // Calculate cumulative depth
  let cumAsk = 0;
  const asksWithTotal = [...asks].reverse().map(a => {
    cumAsk += a.qty;
    return { ...a, total: cumAsk };
  }).reverse();

  let cumBid = 0;
  const bidsWithTotal = bids.map(b => {
    cumBid += b.qty;
    return { ...b, total: cumBid };
  });

  const maxTotal = Math.max(cumAsk, cumBid, 1);

  // Spread calculation
  const bestBid = bids[0]?.price || currentPrice;
  const bestAsk = asks[asks.length - 1]?.price || currentPrice;
  const spread = Math.abs(bestAsk - bestBid);
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  const handlePriceClick = (price: number) => {
    setActiveLimitPrice(price);
  };

  return (
    <div className="h-full flex flex-col bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl text-xs font-mono select-none">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-cyan" />
          <span className="font-bold text-text-primary tracking-wide">ORDER BOOK DEPTH</span>
        </div>
        <span className="text-[10px] text-cyan bg-cyan/10 px-1.5 py-0.5 rounded border border-cyan/20">
          CLICK-TO-FILL
        </span>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-3 px-3.5 py-1.5 border-b border-white/[0.04] text-[10px] text-text-muted uppercase tracking-wider">
        <div>Price ($)</div>
        <div className="text-right">Size</div>
        <div className="text-right">Total</div>
      </div>

      {/* Asks (Sell Orders) */}
      <div className="flex-1 flex flex-col justify-end overflow-hidden px-1">
        {asksWithTotal.slice(-6).map((ask, i) => {
          const depthPct = Math.min(100, (ask.total / maxTotal) * 100);
          return (
            <div
              key={`ask-${i}`}
              onClick={() => handlePriceClick(ask.price)}
              title="Click to set Limit Price"
              className="group relative grid grid-cols-3 px-2.5 py-1 hover:bg-white/[0.04] cursor-pointer rounded transition-colors"
            >
              {/* Depth bar (right-aligned red bar) */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-bear-red/15 rounded-r transition-all duration-300"
                style={{ width: `${depthPct}%` }}
              />
              <span className="text-bear-red font-bold relative z-10 tabular-nums group-hover:underline">
                {ask.price.toFixed(2)}
              </span>
              <span className="text-right text-text-primary/90 relative z-10 tabular-nums">
                {ask.qty}
              </span>
              <span className="text-right text-text-muted relative z-10 tabular-nums text-[11px]">
                {ask.total}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mid-Market Spread Indicator */}
      <div className="px-3 py-2 my-1 bg-black/40 border-y border-white/[0.06] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown size={12} className="text-cyan" />
          <span className="text-text-muted">SPREAD:</span>
          <span className="text-text-primary font-bold tabular-nums">${spread.toFixed(2)}</span>
          <span className="text-text-dim text-[10px]">({spreadPct.toFixed(3)}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">MID:</span>
          <span className="text-cyan font-bold tabular-nums">
            ${((bestBid + bestAsk) / 2).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Bids (Buy Orders) */}
      <div className="flex-1 flex flex-col overflow-hidden px-1">
        {bidsWithTotal.slice(0, 6).map((bid, i) => {
          const depthPct = Math.min(100, (bid.total / maxTotal) * 100);
          return (
            <div
              key={`bid-${i}`}
              onClick={() => handlePriceClick(bid.price)}
              title="Click to set Limit Price"
              className="group relative grid grid-cols-3 px-2.5 py-1 hover:bg-white/[0.04] cursor-pointer rounded transition-colors"
            >
              {/* Depth bar (right-aligned green bar) */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-bull-green/15 rounded-r transition-all duration-300"
                style={{ width: `${depthPct}%` }}
              />
              <span className="text-bull-green font-bold relative z-10 tabular-nums group-hover:underline">
                {bid.price.toFixed(2)}
              </span>
              <span className="text-right text-text-primary/90 relative z-10 tabular-nums">
                {bid.qty}
              </span>
              <span className="text-right text-text-muted relative z-10 tabular-nums text-[11px]">
                {bid.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
