import React, { useState, useEffect } from 'react';
import { useMarketStore } from '../store/marketStore';
import { submitOrder } from '../api/ws';
import { Send, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';

export const OrderEntryForm: React.FC = () => {
  const { activeTicker, cash, prices, activeLimitPrice, setActiveLimitPrice } = useMarketStore();
  const currentPrice = prices[activeTicker]?.price || 180.00;

  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState<string>('10');
  const [price, setPrice] = useState<string>('');

  const [toast, setToast] = useState<{
    status: 'PENDING' | 'MATCHED' | 'REJECTED';
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sync with click-to-fill from OrderBook
  useEffect(() => {
    if (activeLimitPrice !== null) {
      setOrderType('LIMIT');
      setPrice(activeLimitPrice.toFixed(2));
      setActiveLimitPrice(null); // Reset after filling
    }
  }, [activeLimitPrice, setActiveLimitPrice]);

  // Allocation shortcuts (25%, 50%, 75%, MAX)
  const handlePercentAlloc = (pct: number) => {
    const effectivePrice = orderType === 'LIMIT' && parseFloat(price) > 0 ? parseFloat(price) : currentPrice;
    if (effectivePrice <= 0) return;

    if (side === 'BUY') {
      const budget = cash * pct;
      const calculatedQty = Math.max(1, Math.floor(budget / effectivePrice));
      setQty(calculatedQty.toString());
    } else {
      // For sell, allocate based on holdings or default 100
      const pos = useMarketStore.getState().portfolio.find(p => p.ticker === activeTicker);
      const availableQty = pos?.qty || 50;
      const calculatedQty = Math.max(1, Math.floor(availableQty * pct));
      setQty(calculatedQty.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast({ status: 'PENDING', message: 'Order submitted to ZeroMQ matching pipeline...' });
    setIsLoading(true);

    try {
      const typeStr = orderType === 'MARKET' ? side : `LIMIT_${side}`;
      const command = orderType === 'LIMIT'
        ? `${typeStr}:${activeTicker}:${qty}:${price}`
        : `${typeStr}:${activeTicker}:${qty}`;

      const res = await submitOrder(command);

      if (res.success) {
        setToast({ status: 'MATCHED', message: res.message });
        
        // Audio synthesis beep for institutional feel
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        } catch (e) {
          // Audio optional
        }

        // Add to trade log if market fill
        if (orderType === 'MARKET') {
          useMarketStore.getState().addTradeLog({
            tradeId: Math.floor(10000 + Math.random() * 90000),
            ticker: activeTicker,
            side,
            qty: parseInt(qty, 10),
            price: currentPrice,
            timestamp: Date.now()
          });
        }
      } else {
        setToast({ status: 'REJECTED', message: res.message });
      }
    } catch (err) {
      setToast({ status: 'REJECTED', message: 'Engine communication failure' });
    } finally {
      setIsLoading(false);
      // Auto-clear toast after 4s
      setTimeout(() => setToast(null), 4000);
    }
  };

  const parsedQty = parseInt(qty, 10) || 0;
  const effectivePrice = orderType === 'LIMIT' && parseFloat(price) > 0 ? parseFloat(price) : currentPrice;
  const estimatedTotal = (parsedQty * effectivePrice).toFixed(2);

  return (
    <div className="h-full flex flex-col bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl text-sm font-sans select-none">
      {/* Side Toggle (BUY / SELL) */}
      <div className="grid grid-cols-2 p-2 gap-2 border-b border-white/[0.06] bg-black/40">
        <button
          type="button"
          onClick={() => setSide('BUY')}
          className={`py-3 rounded-xl font-bold font-mono text-sm transition-all duration-200 cursor-pointer ${
            side === 'BUY'
              ? 'bg-bull-green text-obsidian shadow-lg shadow-bull-green/20'
              : 'text-text-muted hover:text-text-primary hover:bg-white/[0.04]'
          }`}
        >
          BUY {activeTicker}
        </button>
        <button
          type="button"
          onClick={() => setSide('SELL')}
          className={`py-3 rounded-xl font-bold font-mono text-sm transition-all duration-200 cursor-pointer ${
            side === 'SELL'
              ? 'bg-bear-red text-white shadow-lg shadow-bear-red/20'
              : 'text-text-muted hover:text-text-primary hover:bg-white/[0.04]'
          }`}
        >
          SELL {activeTicker}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 flex-1 justify-between">
        <div className="space-y-4">
          {/* Order Type Selector */}
          <div>
            <label className="text-text-dim text-xs font-mono block mb-1.5 uppercase">Execution Type</label>
            <div className="flex gap-1.5 bg-black/50 p-1 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                className={`flex-1 py-2 text-center rounded-lg font-mono text-xs font-medium transition-colors cursor-pointer ${
                  orderType === 'MARKET' ? 'bg-cyan/20 text-cyan border border-cyan/30' : 'text-text-muted hover:text-text-primary'
                }`}
                onClick={() => setOrderType('MARKET')}
              >
                Market Order
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-center rounded-lg font-mono text-xs font-medium transition-colors cursor-pointer ${
                  orderType === 'LIMIT' ? 'bg-cyan/20 text-cyan border border-cyan/30' : 'text-text-muted hover:text-text-primary'
                }`}
                onClick={() => setOrderType('LIMIT')}
              >
                Limit Order
              </button>
            </div>
          </div>

          {/* Quantity Input + % Quick Buttons */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-text-dim text-xs font-mono uppercase">Shares to trade</label>
              <span className="text-xs text-text-muted font-mono">Cash: ${cash.toLocaleString()}</span>
            </div>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full bg-black/50 border border-white/[0.1] rounded-xl px-4 py-2.5 focus:outline-none focus:border-cyan text-text-primary font-mono text-sm tabular-nums"
              required
            />

            {/* Allocation % Buttons */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[0.25, 0.5, 0.75, 1.0].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentAlloc(pct)}
                  className="py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-text-muted hover:text-text-primary border border-white/[0.06] transition-colors cursor-pointer"
                >
                  {pct === 1.0 ? 'MAX' : `${pct * 100}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Limit Price Input */}
          {orderType === 'LIMIT' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-text-dim text-xs font-mono uppercase">Limit Price ($)</label>
                <button
                  type="button"
                  onClick={() => setPrice(currentPrice.toFixed(2))}
                  className="text-xs font-mono text-cyan hover:underline cursor-pointer"
                >
                  Current (${currentPrice.toFixed(2)})
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={currentPrice.toFixed(2)}
                className="w-full bg-black/50 border border-white/[0.1] rounded-xl px-4 py-2.5 focus:outline-none focus:border-cyan text-text-primary font-mono text-sm tabular-nums"
                required
              />
            </div>
          )}

          {/* Estimated Value */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex justify-between items-center text-xs font-mono">
            <span className="text-text-muted">Estimated Total:</span>
            <span className="text-text-primary font-bold text-sm tabular-nums">${estimatedTotal}</span>
          </div>

          {/* Order Lifecycle Toast / Feedback */}
          {toast && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-fadeIn ${
                toast.status === 'MATCHED'
                  ? 'bg-bull-green/10 border-bull-green/30 text-bull-green'
                  : toast.status === 'REJECTED'
                  ? 'bg-bear-red/10 border-bear-red/30 text-bear-red'
                  : 'bg-cyan/10 border-cyan/30 text-cyan'
              }`}
            >
              {toast.status === 'MATCHED' && <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />}
              {toast.status === 'REJECTED' && <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
              {toast.status === 'PENDING' && <Clock size={16} className="flex-shrink-0 mt-0.5 animate-spin" />}
              <div>
                <div className="font-bold flex items-center gap-1.5 font-mono">
                  <span>{toast.status}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40">ENGINE IPC</span>
                </div>
                <p className="text-xs opacity-90 leading-normal mt-1">{toast.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Submit Execution Button */}
        <div className="pt-4 border-t border-white/[0.06]">
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3.5 rounded-xl font-bold font-mono text-sm flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
              isLoading ? 'opacity-60 cursor-not-allowed' : ''
            } ${
              side === 'BUY'
                ? 'bg-gradient-to-r from-bull-green to-emerald-500 text-obsidian shadow-lg shadow-bull-green/20 hover:brightness-110'
                : 'bg-gradient-to-r from-bear-red to-rose-600 text-white shadow-lg shadow-bear-red/20 hover:brightness-110'
            }`}
          >
            {isLoading ? (
              <>
                <Zap size={16} className="animate-spin" />
                <span>MATCHING IN C++ ENGINE...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>
                  SUBMIT {orderType} {side}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

