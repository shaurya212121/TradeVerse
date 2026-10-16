import React from 'react';
import { useMarketStore } from '../store/marketStore';
import { Radio } from 'lucide-react';

export const TradeHistory: React.FC = () => {
  const { tradeHistory } = useMarketStore();

  return (
    <div className="h-full flex flex-col bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl text-xs font-mono select-none">
      <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-bull-green animate-pulse" />
          <span className="font-bold text-text-primary tracking-wide">LIVE TAPE (MATCHED TRADES)</span>
        </div>
        <span className="text-[10px] text-text-muted">
          STREAMING REAL-TIME
        </span>
      </div>

      <div className="grid grid-cols-5 px-3.5 py-1.5 border-b border-white/[0.04] text-[10px] text-text-muted uppercase tracking-wider">
        <div>Time</div>
        <div>Ticker</div>
        <div>Side</div>
        <div className="text-right">Size</div>
        <div className="text-right">Price ($)</div>
      </div>

      <div className="flex-1 overflow-y-auto cyber-scrollbar tabular-nums">
        {tradeHistory.length === 0 ? (
          <div className="p-6 text-center text-text-dim italic">Waiting for trade executions...</div>
        ) : (
          tradeHistory.map((trade, i) => {
            const time = new Date(trade.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const isBuy = trade.side === 'BUY';

            return (
              <div
                key={`${trade.tradeId}-${i}`}
                className="grid grid-cols-5 px-3.5 py-1.5 border-b border-white/[0.02] hover:bg-white/[0.03] transition-colors items-center"
              >
                <div className="text-text-muted text-[11px]">{time}</div>
                <div className="font-bold text-text-primary">{trade.ticker}</div>
                <div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      isBuy ? 'bg-bull-green/10 text-bull-green' : 'bg-bear-red/10 text-bear-red'
                    }`}
                  >
                    {trade.side}
                  </span>
                </div>
                <div className="text-right text-text-primary/90">{trade.qty}</div>
                <div className={`text-right font-bold ${isBuy ? 'text-bull-green' : 'text-bear-red'}`}>
                  ${trade.price.toFixed(2)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
