import React from 'react';
import { useMarketStore } from '../store/marketStore';

export const TradeHistory: React.FC = () => {
  const { tradeHistory } = useMarketStore();

  return (
    <div className="h-full flex flex-col bg-surface border border-border">
      <div className="px-3 py-2 border-b border-border text-sm font-medium">
        Trade Log
      </div>
      <div className="grid grid-cols-5 px-3 py-1 border-b border-border text-xs text-text-muted font-mono uppercase">
        <div>Time</div>
        <div>Ticker</div>
        <div>Side</div>
        <div className="text-right">Qty</div>
        <div className="text-right">Price</div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar font-mono text-xs tabular-nums">
        {tradeHistory.length === 0 ? (
          <div className="p-4 text-center text-text-muted">No trades yet</div>
        ) : (
          tradeHistory.map((trade, i) => {
            const time = new Date(trade.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div key={i} className="grid grid-cols-5 px-3 py-1.5 border-b border-border/50 hover:bg-border transition-colors">
                <div className="text-text-muted">{time}</div>
                <div className="font-bold">{trade.ticker}</div>
                <div className={trade.side === 'BUY' ? 'text-bull-green' : 'text-bear-red'}>{trade.side}</div>
                <div className="text-right">{trade.qty}</div>
                <div className="text-right">{trade.price.toFixed(2)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
