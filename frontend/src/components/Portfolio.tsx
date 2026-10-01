import React from 'react';
import { useMarketStore } from '../store/marketStore';

export const Portfolio: React.FC = () => {
  const { cash, portfolio, prices } = useMarketStore();
  
  // Calculate total account value
  const holdingsValue = portfolio.reduce((total, pos) => {
    const currentPrice = prices[pos.ticker]?.price || 0;
    return total + (pos.qty * currentPrice);
  }, 0);
  
  const totalValue = cash + holdingsValue;

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border border-t">
      <div className="p-3 border-b border-border bg-border/30">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">My Account</h3>
        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted font-mono">TOTAL VALUE</span>
            <span className="text-lg font-mono font-bold text-accent">${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-text-muted font-mono">CASH</span>
            <span className="text-sm font-mono text-text-primary">${cash.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {portfolio.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-muted font-mono italic">
            No holdings yet
          </div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="text-text-muted sticky top-0 bg-surface border-b border-border">
              <tr>
                <th className="text-left font-normal py-2 px-3">ASSET</th>
                <th className="text-right font-normal py-2 px-3">QTY</th>
                <th className="text-right font-normal py-2 px-3">VALUE</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map(pos => {
                const currentPrice = prices[pos.ticker]?.price || 0;
                const value = pos.qty * currentPrice;
                return (
                  <tr key={pos.ticker} className="border-b border-border/50 hover:bg-border/20 transition-colors">
                    <td className="py-2 px-3 font-medium text-text-primary">{pos.ticker}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-text-muted">{pos.qty}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-text-primary">
                      ${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
