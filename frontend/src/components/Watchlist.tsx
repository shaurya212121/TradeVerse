import React, { useState } from 'react';
import { useMarketStore } from '../store/marketStore';
import type { Ticker } from '../types';
import { usePriceFlash } from '../hooks/usePriceFlash';
import { Search, TrendingUp, TrendingDown } from 'lucide-react';
import { setActiveTicker as wsSetActiveTicker } from '../api/ws';

// Mini SVG sparkline generator
const MiniSparkline = ({ isUp }: { isUp: boolean }) => {
  const points = isUp ? '0,14 8,11 16,13 24,8 32,10 40,3' : '0,4 8,7 16,5 24,11 32,9 40,15';
  return (
    <svg className="w-10 h-4 overflow-visible" viewBox="0 0 40 18">
      <polyline
        fill="none"
        stroke={isUp ? '#00F090' : '#FF3B56'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const WatchlistRow = ({ ticker, isActive }: { ticker: Ticker; isActive: boolean }) => {
  const { prices, setActiveTicker } = useMarketStore();
  const data = prices[ticker];
  const flash = usePriceFlash(data?.price);

  const handleSelect = () => {
    setActiveTicker(ticker);
    wsSetActiveTicker(ticker);
  };

  const isUp = (data?.change || 0) >= 0;

  return (
    <div
      onClick={handleSelect}
      className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-white/[0.04] transition-all duration-150 select-none ${
        isActive
          ? 'bg-cyan/10 border-l-2 border-l-cyan'
          : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
      } ${flash}`}
    >
      <div className="flex flex-col">
        <span className={`font-mono text-xs font-bold ${isActive ? 'text-cyan' : 'text-text-primary'}`}>
          {ticker}
        </span>
        <span className="text-[10px] text-text-muted font-mono">
          {ticker.includes('.NS') ? 'NSE' : 'NASDAQ'}
        </span>
      </div>

      <div className="hidden sm:block">
        <MiniSparkline isUp={isUp} />
      </div>

      {data ? (
        <div className="text-right font-mono tabular-nums">
          <div className="text-text-primary text-xs font-semibold">${data.price.toFixed(2)}</div>
          <div className={`text-[10px] flex items-center justify-end gap-0.5 ${isUp ? 'text-bull-green' : 'text-bear-red'}`}>
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            <span>{isUp ? '+' : ''}{data.changePct.toFixed(2)}%</span>
          </div>
        </div>
      ) : (
        <span className="text-text-muted text-xs font-mono">--</span>
      )}
    </div>
  );
};

export const Watchlist: React.FC = () => {
  const { activeTicker, prices } = useMarketStore();
  const [filter, setFilter] = useState('');
  const tickers = Object.keys(prices) as Ticker[];

  const filteredTickers = tickers.filter((t) =>
    t.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
      <div className="p-2.5 border-b border-white/[0.06]">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 text-text-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search tickers (AAPL, NVDA...)"
            className="w-full bg-black/40 border border-white/[0.06] rounded-lg py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:border-cyan text-text-primary placeholder:text-text-dim font-mono"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto cyber-scrollbar">
        {filteredTickers.map((t) => (
          <WatchlistRow key={t} ticker={t} isActive={activeTicker === t} />
        ))}
      </div>
    </div>
  );
};
