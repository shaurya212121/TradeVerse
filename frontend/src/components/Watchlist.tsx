import React from 'react';
import { useMarketStore } from '../store/marketStore';
import type { Ticker } from '../types';
import { usePriceFlash } from '../hooks/usePriceFlash';
import { Search } from 'lucide-react';

const WatchlistRow = ({ ticker, isActive }: { ticker: Ticker, isActive: boolean }) => {
  const { prices, setActiveTicker } = useMarketStore();
  const data = prices[ticker];
  const flash = usePriceFlash(data?.price);

  return (
    <div 
      onClick={() => setActiveTicker(ticker)}
      className={`flex justify-between items-center px-3 py-2 cursor-pointer border-b border-border text-sm transition-colors ${
        isActive ? 'bg-border border-l-2 border-l-accent' : 'hover:bg-surface border-l-2 border-l-transparent'
      } ${flash}`}
    >
      <span className="font-mono font-medium">{ticker}</span>
      {data ? (
        <div className="text-right font-mono tabular-nums">
          <div className="text-text-primary">{data.price.toFixed(2)}</div>
          <div className={`text-xs ${data.change >= 0 ? 'text-bull-green' : 'text-bear-red'}`}>
            {data.change > 0 ? '+' : ''}{data.change.toFixed(2)}
          </div>
        </div>
      ) : (
        <span className="text-text-muted text-xs">--</span>
      )}
    </div>
  );
};

export const Watchlist: React.FC = () => {
  const { activeTicker, prices } = useMarketStore();
  const tickers = Object.keys(prices) as Ticker[];

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2 text-text-muted" />
          <input 
            type="text" 
            placeholder="Search tickers..." 
            className="w-full bg-background border border-border rounded-sm py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:border-accent text-text-primary placeholder:text-text-muted font-mono"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {tickers.map(t => (
          <WatchlistRow key={t} ticker={t} isActive={activeTicker === t} />
        ))}
      </div>
    </div>
  );
};
