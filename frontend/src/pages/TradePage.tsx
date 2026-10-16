import React from 'react';
import { PriceChart } from '../components/PriceChart';
import { OrderBook } from '../components/OrderBook';
import { OrderEntryForm } from '../components/OrderEntryForm';
import { TradeHistory } from '../components/TradeHistory';
import { useMarketStore } from '../store/marketStore';
import type { Ticker } from '../types';
import { setActiveTicker as wsSetActiveTicker } from '../api/ws';

export const TradePage: React.FC = () => {
  const { activeTicker, setActiveTicker, prices } = useMarketStore();
  const tickers: Ticker[] = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'TCS.NS', 'RELIANCE.NS'];

  const handleTickerSelect = (t: Ticker) => {
    setActiveTicker(t);
    wsSetActiveTicker(t);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto cyber-scrollbar p-4 gap-4 max-w-[1600px] mx-auto w-full">
      {/* Quick Ticker Switcher Strip */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <span className="text-xs font-mono text-text-dim uppercase tracking-wider mr-1 hidden sm:inline">
          Quick Switch:
        </span>
        {tickers.map((t) => {
          const tick = prices[t];
          const isSelected = activeTicker === t;
          const isUp = (tick?.change || 0) >= 0;

          return (
            <button
              key={t}
              onClick={() => handleTickerSelect(t)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-xs transition-all duration-150 cursor-pointer flex-shrink-0 border ${
                isSelected
                  ? 'bg-cyan/15 border-cyan text-cyan shadow-sm shadow-cyan/10 font-bold'
                  : 'bg-[#0E1117]/80 border-white/[0.06] text-text-muted hover:text-text-primary hover:border-white/[0.15]'
              }`}
            >
              <span>{t}</span>
              {tick && (
                <span className={`text-[11px] font-bold tabular-nums ${isUp ? 'text-bull-green' : 'text-bear-red'}`}>
                  ${tick.price.toFixed(2)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Trading Area Split (2 Columns: Left Chart & Depth, Right Execution Desk) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        {/* Left Column (8 of 12 Cols): Giant Chart + Depth & Live Tape */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Big Candlestick Chart */}
          <div className="h-[480px] w-full">
            <PriceChart />
          </div>

          {/* Lower Split: Order Book Depth + Live Tape side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[360px]">
            <div className="h-full">
              <OrderBook />
            </div>
            <div className="h-full">
              <TradeHistory />
            </div>
          </div>
        </div>

        {/* Right Column (4 of 12 Cols): Dedicated Full-Height Order Station */}
        <div className="lg:col-span-4 h-full min-h-[500px]">
          <OrderEntryForm />
        </div>
      </div>
    </div>
  );
};
