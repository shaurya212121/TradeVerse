import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { Watchlist } from './components/Watchlist';
import { PriceChart } from './components/PriceChart';
import { OrderBook } from './components/OrderBook';
import { OrderEntryForm } from './components/OrderEntryForm';
import { Portfolio } from './components/Portfolio';
import { TradeHistory } from './components/TradeHistory';
import { connectWebSocket, disconnectWebSocket } from './api/ws';

function App() {
  useEffect(() => {
    connectWebSocket();
    return () => disconnectWebSocket();
  }, []);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-text-primary overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex-shrink-0 flex flex-col h-full border-r border-border">
          <div className="flex-1 overflow-hidden">
            <Watchlist />
          </div>
          <div className="flex-[0.8] overflow-hidden">
            <Portfolio />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col p-2 gap-2">
          <div className="flex-1 flex gap-2 min-h-0">
            {/* Chart Panel */}
            <div className="flex-1">
              <PriceChart />
            </div>
            
            {/* Order Book Panel */}
            <div className="w-[300px] flex-shrink-0">
              <OrderBook />
            </div>
          </div>
          
          <div className="h-[300px] flex gap-2 flex-shrink-0">
            <div className="w-[340px] flex-shrink-0">
              <OrderEntryForm />
            </div>
            <div className="flex-1">
              <TradeHistory />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
