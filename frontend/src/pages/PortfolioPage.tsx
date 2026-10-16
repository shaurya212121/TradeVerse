import React, { useState } from 'react';
import { useMarketStore } from '../store/marketStore';
import { submitOrder } from '../api/ws';
import { PieChart as PieChartIcon, TrendingUp, DollarSign, Wallet, ShieldAlert, Download, XCircle, CheckCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export const PortfolioPage: React.FC = () => {
  const { cash, portfolio, prices, tradeHistory, openOrders, removeOpenOrder } = useMarketStore();
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  // Calculate holdings value & weights
  const holdingsValue = portfolio.reduce((total, pos) => {
    const currentPrice = prices[pos.ticker]?.price || pos.avgPrice || 180;
    return total + pos.qty * currentPrice;
  }, 0);

  const totalValue = cash + holdingsValue;
  const initialValue = 90000; // baseline for PnL calculation
  const totalPnL = totalValue - initialValue;
  const totalPnLPct = (totalPnL / initialValue) * 100;

  // Donut chart data
  const pieColors = ['#00F090', '#38BDF8', '#F59E0B', '#A855F7', '#EC4899', '#6366F1'];
  const pieData: { name: string; value: number }[] = portfolio.map((pos) => {
    const currentPrice = prices[pos.ticker]?.price || pos.avgPrice;
    return {
      name: pos.ticker,
      value: +(pos.qty * currentPrice).toFixed(2),
    };
  });
  if (cash > 0) {
    pieData.push({ name: 'USD Cash', value: +cash.toFixed(2) });
  }

  // Historical Equity curve mock data
  const equityData = [
    { day: 'Mon', portfolio: 89500, benchmark: 89000 },
    { day: 'Tue', portfolio: 90200, benchmark: 89300 },
    { day: 'Wed', portfolio: 91100, benchmark: 89800 },
    { day: 'Thu', portfolio: 90800, benchmark: 90100 },
    { day: 'Fri', portfolio: 91950, benchmark: 90400 },
    { day: 'Sat', portfolio: 92400, benchmark: 90700 },
    { day: 'Today', portfolio: Math.round(totalValue), benchmark: 91100 },
  ];

  // Cancel order handler
  const handleCancelOrder = async (orderId: number) => {
    setCancelingId(orderId);
    setCancelFeedback(null);
    try {
      const res = await submitOrder(`CANCEL:${orderId}`);
      if (res.success) {
        removeOpenOrder(orderId);
        setCancelFeedback(`Order #${orderId} successfully canceled.`);
      } else {
        setCancelFeedback(`Cancellation failed: ${res.message}`);
      }
    } catch (e) {
      setCancelFeedback('Error communicating with engine');
    } finally {
      setCancelingId(null);
      setTimeout(() => setCancelFeedback(null), 3000);
    }
  };

  // Export trade log as CSV
  const handleExportCSV = () => {
    const headers = 'TradeID,Timestamp,Ticker,Side,Qty,Price,Total\n';
    const rows = tradeHistory
      .map(
        (t) =>
          `${t.tradeId},${new Date(t.timestamp).toISOString()},${t.ticker},${t.side},${t.qty},${t.price},${(
            t.qty * t.price
          ).toFixed(2)}`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradeverse_trades_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto cyber-scrollbar p-4 space-y-4 font-mono select-none">
      {/* Row 1: Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Value */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-text-dim block">TOTAL PORTFOLIO NET WORTH</span>
            <div className="text-2xl font-extrabold text-cyan tabular-nums mt-0.5">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-text-muted mt-1 block">Live marked-to-market</span>
          </div>
          <div className="p-3 rounded-xl bg-cyan/10 border border-cyan/20 text-cyan">
            <Wallet size={20} />
          </div>
        </div>

        {/* Today's PnL */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-text-dim block">UNREALIZED / REALIZED PNL</span>
            <div className={`text-2xl font-extrabold tabular-nums mt-0.5 ${totalPnL >= 0 ? 'text-bull-green' : 'text-bear-red'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className={`text-[10px] font-bold ${totalPnL >= 0 ? 'text-bull-green' : 'text-bear-red'}`}>
              {totalPnL >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}% Return
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${totalPnL >= 0 ? 'bg-bull-green/10 border-bull-green/20 text-bull-green' : 'bg-bear-red/10 border-bear-red/20 text-bear-red'}`}>
            <TrendingUp size={20} />
          </div>
        </div>

        {/* Available Cash */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-text-dim block">SETTLED CASH BALANCE</span>
            <div className="text-2xl font-extrabold text-text-primary tabular-nums mt-0.5">
              ${cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-text-muted mt-1 block">Available for instant execution</span>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-text-muted">
            <DollarSign size={20} />
          </div>
        </div>

        {/* Buying Power */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-text-dim block">LEVERAGED BUYING POWER</span>
            <div className="text-2xl font-extrabold text-amber tabular-nums mt-0.5">
              ${(cash * 2).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-amber mt-1 block">2.0x Intraday Margin Ratio</span>
          </div>
          <div className="p-3 rounded-xl bg-amber/10 border border-amber/20 text-amber">
            <ShieldAlert size={20} />
          </div>
        </div>
      </div>

      {/* Row 2: Charts Split (Equity Curve vs Asset Allocation Donut) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity Curve Chart (2 Cols) */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-cyan" />
              <span className="text-xs font-bold text-text-primary">EQUITY CURVE VS BENCHMARK</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-bull-green">
                <span className="w-2.5 h-0.5 bg-bull-green rounded" />
                <span>TradeVerse PnL</span>
              </span>
              <span className="flex items-center gap-1.5 text-text-muted">
                <span className="w-2.5 h-0.5 bg-text-muted rounded" />
                <span>S&P 500 Index</span>
              </span>
            </div>
          </div>

          <div className="h-60 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00F090" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00F090" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#475569" fontSize={11} />
                <YAxis domain={['auto', 'auto']} stroke="#475569" fontSize={11} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#07080B', borderColor: 'rgba(255,255,255,0.1)', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="portfolio" stroke="#00F090" strokeWidth={2} fill="url(#portfolioGradient)" />
                <Area type="monotone" dataKey="benchmark" stroke="#64748B" strokeWidth={1.5} strokeDasharray="3 3" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Asset Allocation Donut (1 Col) */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-2">
            <div className="flex items-center gap-2">
              <PieChartIcon size={16} className="text-amber" />
              <span className="text-xs font-bold text-text-primary">ASSET ALLOCATION</span>
            </div>
            <span className="text-[10px] text-text-muted">WEIGHT BY VALUE</span>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#07080B', borderColor: 'rgba(255,255,255,0.1)', fontSize: '11px' }}
                  formatter={(value: any) => [`$${value.toLocaleString()}`, 'Value']}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Institutional Risk Intelligence Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'SHARPE RATIO (ANNUALIZED)', val: '2.41', sub: 'Top 5% Risk-Adjusted', color: 'text-bull-green' },
          { label: 'PORTFOLIO BETA (vs SPX)', val: '0.94', sub: 'Low Systematic Volatility', color: 'text-cyan' },
          { label: 'MAX HISTORICAL DRAWDOWN', val: '-3.20%', sub: 'Conservative Capital Risk', color: 'text-amber' },
          { label: 'VALUE AT RISK (95% 1-DAY VaR)', val: '$1,420', sub: 'Stress Confidence Model', color: 'text-purple-400' },
        ].map((stat) => (
          <div key={stat.label} className="p-3.5 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl">
            <span className="text-[10px] text-text-dim block">{stat.label}</span>
            <div className={`text-xl font-extrabold mt-1 tabular-nums ${stat.color}`}>{stat.val}</div>
            <span className="text-[10px] text-text-muted block mt-0.5">{stat.sub}</span>
          </div>
        ))}
      </div>

      {/* Row 4: Open Orders Table (with Instant Cancel) + Trade History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open Limit Orders Table */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-primary">ACTIVE OPEN ORDERS</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan/10 text-cyan">
                {openOrders.length} PENDING
              </span>
            </div>
            {cancelFeedback && (
              <span className="text-[10px] text-bull-green flex items-center gap-1">
                <CheckCircle size={11} /> {cancelFeedback}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto cyber-scrollbar text-xs">
            {openOrders.length === 0 ? (
              <div className="p-8 text-center text-text-dim italic">No pending limit orders on the book.</div>
            ) : (
              <table className="w-full text-left">
                <thead className="text-[10px] text-text-muted uppercase border-b border-white/[0.04]">
                  <tr>
                    <th className="pb-2">Order ID</th>
                    <th className="pb-2">Ticker</th>
                    <th className="pb-2">Side</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {openOrders.map((order) => (
                    <tr key={order.orderId} className="hover:bg-white/[0.03]">
                      <td className="py-2 text-text-dim text-[11px]">#{order.orderId}</td>
                      <td className="py-2 font-bold text-text-primary">{order.ticker}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          order.side === 'BUY' ? 'bg-bull-green/10 text-bull-green' : 'bg-bear-red/10 text-bear-red'
                        }`}>
                          {order.side}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold tabular-nums">${order.price.toFixed(2)}</td>
                      <td className="py-2 text-right tabular-nums text-text-muted">{order.qty}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleCancelOrder(order.orderId)}
                          disabled={cancelingId === order.orderId}
                          className="px-2 py-1 rounded text-[10px] bg-bear-red/10 hover:bg-bear-red/20 text-bear-red border border-bear-red/20 transition-colors flex items-center gap-1 ml-auto"
                        >
                          <XCircle size={11} />
                          <span>{cancelingId === order.orderId ? 'Canceling...' : 'Cancel'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Trade Execution History + CSV Export */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-2">
            <span className="text-xs font-bold text-text-primary">EXECUTION AUDIT LOG</span>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-text-primary text-[11px] border border-white/[0.08] transition-colors"
            >
              <Download size={12} />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto cyber-scrollbar text-xs">
            <table className="w-full text-left">
              <thead className="text-[10px] text-text-muted uppercase border-b border-white/[0.04]">
                <tr>
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Ticker</th>
                  <th className="pb-2">Side</th>
                  <th className="pb-2 text-right">Size</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {tradeHistory.slice(0, 8).map((trade, i) => (
                  <tr key={`${trade.tradeId}-${i}`} className="hover:bg-white/[0.03]">
                    <td className="py-2 text-text-dim text-[11px]">
                      {new Date(trade.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2 font-bold text-text-primary">{trade.ticker}</td>
                    <td className="py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        trade.side === 'BUY' ? 'bg-bull-green/10 text-bull-green' : 'bg-bear-red/10 text-bear-red'
                      }`}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="py-2 text-right text-text-muted tabular-nums">{trade.qty}</td>
                    <td className="py-2 text-right font-bold tabular-nums">${trade.price.toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums text-text-primary font-semibold">
                      ${(trade.qty * trade.price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
