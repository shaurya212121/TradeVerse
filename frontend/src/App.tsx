import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TopBar } from './components/TopBar';
import { LandingPage } from './pages/LandingPage';
import { MarketsPage } from './pages/MarketsPage';
import { TradePage } from './pages/TradePage';
import { TelemetryPage } from './pages/TelemetryPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { connectWebSocket, disconnectWebSocket } from './api/ws';
import { startMockMarketSimulation, stopMockMarketSimulation } from './utils/mockMarketFeed';

function AppContent() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <div className="flex flex-col h-screen w-full bg-[#07080B] text-text-primary overflow-hidden select-none">
      {/* TopBar shown on all dashboard pages */}
      {!isLanding && <TopBar />}

      {/* Main Multi-Page Routes */}
      <main className="flex-1 flex overflow-hidden min-h-0 relative">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/trade" element={<TradePage />} />
          <Route path="/telemetry" element={<TelemetryPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  useEffect(() => {
    // Connect to WebSocket and initialize resilient offline simulation
    connectWebSocket();
    startMockMarketSimulation();

    return () => {
      disconnectWebSocket();
      stopMockMarketSimulation();
    };
  }, []);

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
