import React from 'react';
import { NavLink } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { Activity, Cpu, PieChart, FlaskConical, Zap, Wifi } from 'lucide-react';

export const TopBar: React.FC = () => {
  const { activeTicker, prices, connectionStatus, latencyUs } = useMarketStore();
  const currentTick = prices[activeTicker];

  // Calculate 24h high/low approximations based on current price
  const basePrice = currentTick?.price || 180.0;
  const high24h = (basePrice * 1.018).toFixed(2);
  const low24h = (basePrice * 0.985).toFixed(2);
  const vol24h = ((basePrice * 12450) / 1000).toFixed(1) + 'K';

  const navItems = [
    { to: '/markets', label: 'Markets', icon: Activity },
    { to: '/trade', label: 'Trade Desk', icon: Zap },
    { to: '/telemetry', label: 'Engine Telemetry', icon: Cpu },
    { to: '/portfolio', label: 'Portfolio & Risk', icon: PieChart },
    { to: '/simulator', label: 'Market Lab', icon: FlaskConical },
  ];

  return (
    <header className="h-14 border-b border-white/[0.08] bg-[#0E1117]/95 backdrop-blur-xl flex items-center justify-between px-4 select-none z-50 flex-shrink-0">
      {/* Left: Brand + Active Ticker HUD */}
      <div className="flex items-center gap-6">
        <NavLink to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan to-blue-600 flex items-center justify-center shadow-lg shadow-cyan/20">
            <Activity className="text-obsidian" size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-sm tracking-wider text-text-primary">TRADEVERSE</span>
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-cyan/10 text-cyan border border-cyan/20">
                C++17
              </span>
            </div>
            <p className="text-[10px] font-mono text-text-muted leading-tight">ULTRA-LOW LATENCY ENGINE</p>
          </div>
        </NavLink>

        {/* Vertical divider */}
        <div className="h-6 w-px bg-white/[0.08]" />

        {/* Active Ticker HUD */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-sm text-text-primary">{activeTicker}</span>
            <span className={`text-sm font-bold tabular-nums ${
              (currentTick?.change || 0) >= 0 ? 'text-bull-green' : 'text-bear-red'
            }`}>
              ${currentTick?.price.toFixed(2) || '0.00'}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              (currentTick?.change || 0) >= 0 ? 'bg-bull-green/10 text-bull-green' : 'bg-bear-red/10 text-bear-red'
            }`}>
              {(currentTick?.change || 0) >= 0 ? '+' : ''}{currentTick?.changePct.toFixed(2) || '0.00'}%
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-[11px] text-text-muted pl-2 border-l border-white/[0.06]">
            <div>
              <span className="text-text-dim text-[10px] block">24H HIGH</span>
              <span className="text-text-primary tabular-nums">${high24h}</span>
            </div>
            <div>
              <span className="text-text-dim text-[10px] block">24H LOW</span>
              <span className="text-text-primary tabular-nums">${low24h}</span>
            </div>
            <div>
              <span className="text-text-dim text-[10px] block">24H VOL</span>
              <span className="text-text-primary tabular-nums">{vol24h}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Tabbed Navigation */}
      <nav className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/[0.06]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-cyan/15 text-cyan border border-cyan/30 shadow-sm shadow-cyan/10'
                    : 'text-text-muted hover:text-text-primary hover:bg-white/[0.04]'
                }`
              }
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Right: Live Telemetry HUD & Status Badge */}
      <div className="flex items-center gap-3">
        {/* Latency Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-black/40 border border-white/[0.06] font-mono text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-bull-green animate-pulse" />
          <span className="text-text-muted text-[11px]">MATCH:</span>
          <span className="text-bull-green font-bold tabular-nums">{latencyUs} μs</span>
        </div>

        {/* Live System Status Radar Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-black/40 border border-white/[0.08] text-xs font-mono">
          <div className="relative flex items-center justify-center">
            <span className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-bull-green' :
              connectionStatus === 'connecting' ? 'bg-amber animate-ping' : 'bg-bear-red'
            }`} />
            {connectionStatus === 'connected' && (
              <span className="absolute w-3 h-3 rounded-full bg-bull-green/30 animate-ping" />
            )}
          </div>
          <span className="text-[11px] font-medium text-text-primary hidden sm:inline">
            {connectionStatus === 'connected'
              ? 'WS: CONNECTED | ZMQ: READY'
              : connectionStatus === 'connecting'
              ? 'CONNECTING TO ENGINE...'
              : 'DEMO / OFFLINE SIMULATION'}
          </span>
          <Wifi size={12} className={connectionStatus === 'connected' ? 'text-bull-green' : 'text-text-dim'} />
        </div>
      </div>
    </header>
  );
};
