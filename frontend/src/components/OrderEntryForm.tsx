import React, { useState } from 'react';
import { useMarketStore } from '../store/marketStore';
import { submitMockOrder } from '../api/mock';

export const OrderEntryForm: React.FC = () => {
  const { activeTicker } = useMarketStore();
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState<string>('1');
  const [price, setPrice] = useState<string>('');
  
  const [feedback, setFeedback] = useState<{msg: string, isError: boolean} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsLoading(true);

    try {
      const typeStr = orderType === 'MARKET' ? side : `LIMIT_${side}`;
      const res = await submitMockOrder({
        type: typeStr as any,
        ticker: activeTicker,
        qty: parseInt(qty, 10),
        price: orderType === 'LIMIT' ? parseFloat(price) : undefined
      });

      setFeedback({ msg: res.message, isError: !res.success });
      
      if (res.success && orderType === 'MARKET') {
        // Automatically log to our mock history for now
        useMarketStore.getState().addTradeLog({
          tradeId: Math.floor(Math.random() * 100000),
          ticker: activeTicker,
          side,
          qty: parseInt(qty, 10),
          price: useMarketStore.getState().prices[activeTicker]?.price || 0,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      setFeedback({ msg: "Connection error", isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface border border-border">
      <div className="px-3 py-2 border-b border-border flex gap-4 text-sm font-medium">
        <button 
          className={`pb-2 -mb-2 border-b-2 ${side === 'BUY' ? 'border-bull-green text-bull-green' : 'border-transparent text-text-muted hover:text-text-primary'}`}
          onClick={() => setSide('BUY')}
        >BUY</button>
        <button 
          className={`pb-2 -mb-2 border-b-2 ${side === 'SELL' ? 'border-bear-red text-bear-red' : 'border-transparent text-text-muted hover:text-text-primary'}`}
          onClick={() => setSide('SELL')}
        >SELL</button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4 text-sm flex-1">
        <div className="flex gap-2 bg-background p-1 rounded-sm border border-border">
          <button 
            type="button"
            className={`flex-1 py-1 text-center rounded-sm transition-colors ${orderType === 'MARKET' ? 'bg-surface text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            onClick={() => setOrderType('MARKET')}
          >Market</button>
          <button 
            type="button"
            className={`flex-1 py-1 text-center rounded-sm transition-colors ${orderType === 'LIMIT' ? 'bg-surface text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            onClick={() => setOrderType('LIMIT')}
          >Limit</button>
        </div>

        <div>
          <label className="block text-text-muted text-xs mb-1 font-mono">Amount (Qty)</label>
          <input 
            type="number" 
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="w-full bg-background border border-border rounded-sm px-3 py-2 focus:outline-none focus:border-accent font-mono text-text-primary tabular-nums"
            required
          />
        </div>

        {orderType === 'LIMIT' && (
          <div>
            <label className="block text-text-muted text-xs mb-1 font-mono">Limit Price</label>
            <input 
              type="number" 
              step="0.01"
              min="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2 focus:outline-none focus:border-accent font-mono text-text-primary tabular-nums"
              required
            />
          </div>
        )}

        <div className="mt-auto pt-4">
          {feedback && (
            <div className={`mb-3 text-xs font-mono p-2 rounded-sm border ${feedback.isError ? 'bg-bear-red/10 border-bear-red/20 text-bear-red' : 'bg-bull-green/10 border-bull-green/20 text-bull-green'}`}>
              {feedback.msg}
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={isLoading}
            className={`w-full py-2.5 rounded-sm font-bold text-white transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'} ${side === 'BUY' ? 'bg-bull-green hover:bg-bull-green/90' : 'bg-bear-red hover:bg-bear-red/90'}`}
          >
            {isLoading ? 'Processing...' : `${side} ${activeTicker}`}
          </button>
        </div>
      </form>
    </div>
  );
};
