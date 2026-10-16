import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import type { Ticker } from '../types';
import { Search, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { setActiveTicker as wsSetActiveTicker } from '../api/ws';

interface TickerMeta {
  name: string;
  sector: string;
  exchange: 'NASDAQ' | 'NSE';
  marketCap: string;
}

const TICKER_INFO: Record<Ticker, TickerMeta> = {
  AAPL: { name: 'Apple Inc.', sector: 'Consumer Electronics & Software', exchange: 'NASDAQ', marketCap: '$2.82T' },
  TSLA: { name: 'Tesla Inc.', sector: 'Automotive & Clean Energy', exchange: 'NASDAQ', marketCap: '$750B' },
  NVDA: { name: 'NVIDIA Corporation', sector: 'AI & GPU Semiconductors', exchange: 'NASDAQ', marketCap: '$2.15T' },
  MSFT: { name: 'Microsoft Corporation', sector: 'Cloud & Enterprise Computing', exchange: 'NASDAQ', marketCap: '$3.12T' },
  GOOGL: { name: 'Alphabet Inc.', sector: 'Search & Cloud Platforms', exchange: 'NASDAQ', marketCap: '$2.18T' },
  AMZN: { name: 'Amazon.com Inc.', sector: 'E-Commerce & AWS Cloud', exchange: 'NASDAQ', marketCap: '$1.88T' },
  'TCS.NS': { name: 'Tata Consultancy Services', sector: 'IT Services & Consulting', exchange: 'NSE', marketCap: '₹14.2T' },
  'RELIANCE.NS': { name: 'Reliance Industries', sector: 'Energy, Telecom & Retail', exchange: 'NSE', marketCap: '₹19.8T' },
  'HDFCBANK.NS': { name: 'HDFC Bank Limited', sector: 'Banking & Financial Services', exchange: 'NSE', marketCap: '₹11.5T' },
  'INFY.NS': { name: 'Infosys Limited', sector: 'Global Technology Consulting', exchange: 'NSE', marketCap: '₹6.2T' },
};

export const MarketsPage: React.FC = () => {
  const navigate = useNavigate();
  const { prices, setActiveTicker } = useMarketStore();
  const [search, setSearch] = useState('');
  const [filterExchange, setFilterExchange] = useState<'ALL' | 'NASDAQ' | 'NSE'>('ALL');

  const tickers = Object.keys(prices) as Ticker[];

  const filtered = tickers.filter((t) => {
    const meta = TICKER_INFO[t];
    const matchesSearch =
      t.toLowerCase().includes(search.toLowerCase()) ||
      meta?.name.toLowerCase().includes(search.toLowerCase()) ||
      meta?.sector.toLowerCase().includes(search.toLowerCase());

    const matchesExchange = filterExchange === 'ALL' || meta?.exchange === filterExchange;
    return matchesSearch && matchesExchange;
  });

  const handleSelectTrade = (ticker: Ticker) => {
    setActiveTicker(ticker);
    wsSetActiveTicker(ticker);
    navigate('/trade');
  };

  return (
    <div className="flex-1 overflow-y-auto cyber-scrollbar p-6 space-y-6 font-sans select-none max-w-7xl mx-auto w-full">
      {/* Welcome Banner / Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Market Overview</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-bull-green/15 text-bull-green border border-bull-green/30">
              LIVE STREAMING
            </span>
          </div>
          <p className="text-sm text-text-muted">
            Select any asset to enter the focused C++ Order Execution Desk.
          </p>
        </div>

        {/* Quick Market Stats */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
            <span className="text-text-dim block text-[11px]">ACTIVE ASSETS</span>
            <span className="text-cyan font-bold text-base">10 Sharded Books</span>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
            <span className="text-text-dim block text-[11px]">MATCH SPEED</span>
            <span className="text-bull-green font-bold text-base">312 μs Roundtrip</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-3 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company or ticker (e.g. Apple, TSLA)..."
            className="w-full bg-[#0E1117]/90 border border-white/[0.08] rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-cyan transition-colors"
          />
        </div>

        {/* Exchange Filter Pills */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/[0.06] text-xs font-mono">
          {(['ALL', 'NASDAQ', 'NSE'] as const).map((ex) => (
            <button
              key={ex}
              onClick={() => setFilterExchange(ex)}
              className={`px-4 py-1.5 rounded-lg font-medium transition-all ${
                filterExchange === ex
                  ? 'bg-cyan/20 text-cyan border border-cyan/30 shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/[0.04]'
              }`}
            >
              {ex === 'ALL' ? 'All Exchanges' : ex}
            </button>
          ))}
        </div>
      </div>

      {/* Markets Table */}
      <div className="rounded-2xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-text-muted font-mono border-b border-white/[0.06] bg-black/30">
              <tr>
                <th className="py-3.5 px-6">Asset & Company</th>
                <th className="py-3.5 px-6 text-right">Price</th>
                <th className="py-3.5 px-6 text-right">24h Change</th>
                <th className="py-3.5 px-6 text-right hidden md:table-cell">24h Range</th>
                <th className="py-3.5 px-6 text-right hidden lg:table-cell">Market Cap</th>
                <th className="py-3.5 px-6 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] font-sans">
              {filtered.map((ticker) => {
                const tick = prices[ticker];
                const meta = TICKER_INFO[ticker];
                const currentPrice = tick?.price || 180.0;
                const change = tick?.change || 0;
                const changePct = tick?.changePct || 0;
                const isUp = change >= 0;

                const dayLow = +(currentPrice * 0.985).toFixed(2);
                const dayHigh = +(currentPrice * 1.018).toFixed(2);
                const rangePercent = Math.min(
                  100,
                  Math.max(0, ((currentPrice - dayLow) / (dayHigh - dayLow)) * 100)
                );

                return (
                  <tr
                    key={ticker}
                    onClick={() => handleSelectTrade(ticker)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                  >
                    {/* Asset Name + Sector */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.08] flex items-center justify-center font-mono font-bold text-cyan text-sm">
                          {ticker.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-text-primary text-base group-hover:text-cyan transition-colors">
                              {ticker}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-text-muted">
                              {meta?.exchange}
                            </span>
                          </div>
                          <p className="text-xs text-text-muted">{meta?.name}</p>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-4 px-6 text-right font-mono tabular-nums text-base font-bold text-text-primary">
                      ${currentPrice.toFixed(2)}
                    </td>

                    {/* 24h Change */}
                    <td className="py-4 px-6 text-right font-mono tabular-nums">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                          isUp
                            ? 'bg-bull-green/10 text-bull-green border border-bull-green/20'
                            : 'bg-bear-red/10 text-bear-red border border-bear-red/20'
                        }`}
                      >
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        <span>{isUp ? '+' : ''}{changePct.toFixed(2)}%</span>
                      </span>
                    </td>

                    {/* 24h High/Low Visualizer */}
                    <td className="py-4 px-6 text-right hidden md:table-cell font-mono text-xs">
                      <div className="w-40 ml-auto space-y-1">
                        <div className="flex justify-between text-[11px] text-text-dim">
                          <span>${dayLow.toFixed(2)}</span>
                          <span>${dayHigh.toFixed(2)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/[0.06]">
                          <div
                            className="h-full bg-cyan rounded-full transition-all duration-300"
                            style={{ width: `${rangePercent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Market Cap */}
                    <td className="py-4 px-6 text-right hidden lg:table-cell font-mono text-xs text-text-muted">
                      {meta?.marketCap || '$1.2T'}
                    </td>

                    {/* Action Button */}
                    <td className="py-4 px-6 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTrade(ticker);
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-white/[0.06] hover:bg-cyan hover:text-obsidian text-text-primary border border-white/[0.1] hover:border-cyan shadow-sm transition-all duration-200 flex items-center gap-1.5 mx-auto cursor-pointer"
                      >
                        <span>Trade</span>
                        <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
