import React from 'react';
import { useMarketStore } from '../store/marketStore';
import { Activity } from 'lucide-react';

export const TopBar: React.FC = () => {
  const { connectionStatus } = useMarketStore();
  
  return (
    <div className="flex items-center justify-between h-12 px-4 border-b border-border bg-surface text-sm">
      <div className="flex items-center gap-2 font-mono font-bold text-accent">
        <Activity size={16} />
        <span>TRADEVERSE</span>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-text-muted">Connection:</span>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-bull-green' : 
            connectionStatus === 'connecting' ? 'bg-accent animate-pulse' : 'bg-bear-red'
          }`} />
          <span className="capitalize">{connectionStatus}</span>
        </div>
      </div>
    </div>
  );
};
