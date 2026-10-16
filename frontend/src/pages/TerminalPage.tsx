import React from 'react';
import { Watchlist } from '../components/Watchlist';
import { PriceChart } from '../components/PriceChart';
import { OrderBook } from '../components/OrderBook';
import { OrderEntryForm } from '../components/OrderEntryForm';
import { TradeHistory } from '../components/TradeHistory';

export const TerminalPage: React.FC = () => {
  return (
    <div className="flex-1 flex overflow-hidden p-3 gap-3">
      {/* Left Sidebar: Collapsible / Full Watchlist */}
      <div className="w-64 flex-shrink-0 flex flex-col h-full">
        <Watchlist />
      </div>

      {/* Main Trading Area */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Top Split: Chart + OrderBook */}
        <div className="flex-1 flex gap-3 min-h-0">
          <div className="flex-1 min-w-0">
            <PriceChart />
          </div>
          <div className="w-[320px] flex-shrink-0">
            <OrderBook />
          </div>
        </div>

        {/* Bottom Split: Execution Station + Live Tape */}
        <div className="h-[280px] flex gap-3 flex-shrink-0">
          <div className="w-[360px] flex-shrink-0">
            <OrderEntryForm />
          </div>
          <div className="flex-1 min-w-0">
            <TradeHistory />
          </div>
        </div>
      </div>
    </div>
  );
};
