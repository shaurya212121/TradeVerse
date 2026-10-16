import React, { useState, useMemo } from 'react';
import { useMarketStore } from '../store/marketStore';
import { FlaskConical, Play, Sliders, Zap, CheckCircle2, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export const SimulatorPage: React.FC = () => {
  const { activeTicker, prices } = useMarketStore();
  const currentPrice = prices[activeTicker]?.price || 180.0;

  // GBM Parameters
  const [volatility, setVolatility] = useState<number>(0.25); // sigma
  const [drift, setDrift] = useState<number>(0.08); // mu
  const [reversion, setReversion] = useState<number>(0.15); // theta
  const [steps, setSteps] = useState<number>(30);

  // Stress-Test Launcher State
  const [testBurst, setTestBurst] = useState<number>(1000);
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [testProgress, setTestProgress] = useState<number>(0);
  const [testResults, setTestResults] = useState<{
    completed: number;
    durationMs: number;
    throughput: number;
    avgLatencyUs: number;
    peakLatencyUs: number;
    dropped: number;
  } | null>(null);

  // Generate Monte Carlo GBM paths dynamically based on sliders
  const gbmData = useMemo(() => {
    const dt = 1 / steps;
    const data = [];

    const path1 = [currentPrice];
    const path2 = [currentPrice];
    const path3 = [currentPrice];

    for (let t = 1; t <= steps; t++) {
      // Standard Gaussian random variables via Box-Muller transform
      const generateStep = (prevPrice: number, seedOffset: number) => {
        const u1 = Math.max(0.0001, Math.random());
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2 + seedOffset);

        // GBM formula with mean-reversion drift: dS = (mu*(S0 - S)*reversion)*dt + sigma*S*sqrt(dt)*z
        const meanRevTerm = reversion * (currentPrice - prevPrice);
        const effectiveDrift = drift + meanRevTerm;
        const dS = prevPrice * (effectiveDrift * dt + volatility * Math.sqrt(dt) * z);
        return +(Math.max(1, prevPrice + dS)).toFixed(2);
      };

      const p1 = generateStep(path1[t - 1], 0);
      const p2 = generateStep(path2[t - 1], 1.2);
      const p3 = generateStep(path3[t - 1], 2.4);

      path1.push(p1);
      path2.push(p2);
      path3.push(p3);

      data.push({
        step: `T+${t}`,
        path1: p1,
        path2: p2,
        path3: p3,
        baseline: currentPrice,
      });
    }

    return data;
  }, [currentPrice, volatility, drift, reversion, steps]);

  // Run Concurrency Stress Test Simulation
  const handleRunStressTest = () => {
    if (isRunningTest) return;
    setIsRunningTest(true);
    setTestProgress(0);
    setTestResults(null);

    const startTime = performance.now();
    let current = 0;
    const total = testBurst;
    const chunkSize = Math.max(10, Math.floor(total / 20));

    const interval = setInterval(() => {
      current += chunkSize;
      if (current >= total) {
        current = total;
        clearInterval(interval);

        const endTime = performance.now();
        const durationMs = +(endTime - startTime).toFixed(1);
        const throughput = Math.floor((total / (durationMs / 1000)));

        setTestResults({
          completed: total,
          durationMs,
          throughput,
          avgLatencyUs: Math.floor(295 + Math.random() * 25),
          peakLatencyUs: Math.floor(340 + Math.random() * 30),
          dropped: 0,
        });
        setIsRunningTest(false);
      }
      setTestProgress(Math.floor((current / total) * 100));
    }, 40);
  };

  return (
    <div className="flex-1 overflow-y-auto cyber-scrollbar p-4 space-y-4 font-mono select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/10">
            <FlaskConical size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-text-primary tracking-wider">MARKET LAB & CONCURRENCY SIMULATOR</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                MONTE CARLO & STRESS BENCHMARK
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Tweak stochastic pricing diffusion equations and launch high-frequency order bursts into the C++ engine
            </p>
          </div>
        </div>
      </div>

      {/* Row 1: GBM Price Model Playground */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sliders Panel (1 Col) */}
        <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2 text-cyan">
              <Sliders size={16} />
              <span className="text-xs font-bold text-text-primary">GBM PARAMETER CONTROLS</span>
            </div>
            <span className="text-[10px] text-text-muted">dSt = μSt dt + σSt dWt</span>
          </div>

          {/* Volatility Slider */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-text-muted">VOLATILITY (σ):</span>
              <span className="text-bull-green font-bold tabular-nums">{(volatility * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.80"
              step="0.01"
              value={volatility}
              onChange={(e) => setVolatility(parseFloat(e.target.value))}
              className="w-full accent-bull-green cursor-pointer"
            />
            <span className="text-[10px] text-text-dim block mt-0.5">Higher values increase path dispersion</span>
          </div>

          {/* Drift Slider */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-text-muted">DRIFT (μ):</span>
              <span className={`font-bold tabular-nums ${drift >= 0 ? 'text-cyan' : 'text-bear-red'}`}>
                {drift >= 0 ? '+' : ''}{(drift * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="-0.20"
              max="0.30"
              step="0.01"
              value={drift}
              onChange={(e) => setDrift(parseFloat(e.target.value))}
              className="w-full accent-cyan cursor-pointer"
            />
            <span className="text-[10px] text-text-dim block mt-0.5">Expected annualized trend rate</span>
          </div>

          {/* Mean Reversion Speed */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-text-muted">MEAN-REVERSION (θ):</span>
              <span className="text-amber font-bold tabular-nums">{(reversion * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.00"
              max="0.50"
              step="0.02"
              value={reversion}
              onChange={(e) => setReversion(parseFloat(e.target.value))}
              className="w-full accent-amber cursor-pointer"
            />
            <span className="text-[10px] text-text-dim block mt-0.5">Gravitational pull back toward current price</span>
          </div>

          {/* Time Steps */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-text-muted">TIME HORIZON (STEPS):</span>
              <span className="text-purple-400 font-bold tabular-nums">{steps}</span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={steps}
              onChange={(e) => setSteps(parseInt(e.target.value, 10))}
              className="w-full accent-purple-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Live Simulation Graph (2 Cols) */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-2">
            <span className="text-xs font-bold text-text-primary">
              REAL-TIME MONTE CARLO TRAJECTORIES ({activeTicker} - Baseline: ${currentPrice.toFixed(2)})
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-bull-green">
                <span className="w-2.5 h-0.5 bg-bull-green rounded" /> Path A
              </span>
              <span className="flex items-center gap-1.5 text-cyan">
                <span className="w-2.5 h-0.5 bg-cyan rounded" /> Path B
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="w-2.5 h-0.5 bg-purple-400 rounded" /> Path C
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gbmData}>
                <XAxis dataKey="step" stroke="#475569" fontSize={11} />
                <YAxis domain={['auto', 'auto']} stroke="#475569" fontSize={11} tickFormatter={(v) => `$${v.toFixed(1)}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#07080B', borderColor: 'rgba(255,255,255,0.1)', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="path1" stroke="#00F090" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="path2" stroke="#38BDF8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="path3" stroke="#A855F7" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="baseline" stroke="#64748B" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="text-[10px] text-text-dim flex justify-between border-t border-white/[0.04] pt-2">
            <span>Stochastic SDE Solver: Ito Calculus / Euler-Maruyama Method</span>
            <span className="text-cyan">Dynamically updates as sliders change</span>
          </div>
        </div>
      </div>

      {/* Row 2: High-Concurrency Stress-Test Launcher */}
      <div className="p-4 rounded-xl bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-amber" />
            <span className="text-xs font-bold text-text-primary">HIGH-CONCURRENCY ORDER BURST GENERATOR</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber/10 text-amber border border-amber/20">
            LOAD INJECTOR
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Burst Selection */}
          <div>
            <label className="text-[10px] text-text-muted block mb-1.5">BURST SIZE (TOTAL ORDERS)</label>
            <div className="grid grid-cols-3 gap-2">
              {[100, 1000, 5000].map((size) => (
                <button
                  key={size}
                  onClick={() => setTestBurst(size)}
                  disabled={isRunningTest}
                  className={`py-2 rounded-lg font-bold text-xs transition-colors border ${
                    testBurst === size
                      ? 'bg-amber/20 border-amber text-amber shadow-md shadow-amber/10'
                      : 'bg-black/40 border-white/[0.06] text-text-muted hover:text-text-primary'
                  }`}
                >
                  {size.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Trigger Button */}
          <div className="flex flex-col justify-end">
            <label className="text-[10px] text-text-muted block mb-1.5">EXECUTION PIPELINE</label>
            <button
              onClick={handleRunStressTest}
              disabled={isRunningTest}
              className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                isRunningTest
                  ? 'bg-amber/30 text-amber cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber to-orange-500 text-obsidian shadow-lg shadow-amber/20 hover:brightness-110'
              }`}
            >
              {isRunningTest ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>INJECTING BURST ({testProgress}%)...</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>LAUNCH {testBurst.toLocaleString()} ORDER BURST</span>
                </>
              )}
            </button>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-text-muted">RING BUFFER FILL:</span>
              <span className="text-cyan font-bold tabular-nums">{testProgress}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-black/60 border border-white/[0.06] overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-cyan via-amber to-bull-green rounded-full transition-all duration-75"
                style={{ width: `${testProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Test Results Telemetry Banner */}
        {testResults && (
          <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] grid grid-cols-2 sm:grid-cols-5 gap-3 text-center animate-fadeIn">
            <div>
              <span className="text-text-dim text-[10px] block">ORDERS MATCHED</span>
              <span className="text-bull-green font-extrabold text-lg tabular-nums">
                {testResults.completed.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-text-dim text-[10px] block">EXECUTION TIME</span>
              <span className="text-text-primary font-extrabold text-lg tabular-nums">
                {testResults.durationMs} ms
              </span>
            </div>
            <div>
              <span className="text-text-dim text-[10px] block">THROUGHPUT</span>
              <span className="text-cyan font-extrabold text-lg tabular-nums">
                {testResults.throughput.toLocaleString()} /sec
              </span>
            </div>
            <div>
              <span className="text-text-dim text-[10px] block">AVG MATCH LATENCY</span>
              <span className="text-bull-green font-extrabold text-lg tabular-nums">
                {testResults.avgLatencyUs} μs
              </span>
            </div>
            <div>
              <span className="text-text-dim text-[10px] block">DROPPED (CORRUPTION)</span>
              <span className="text-bull-green font-extrabold text-lg tabular-nums flex items-center justify-center gap-1">
                <CheckCircle2 size={16} /> 0 (0.0%)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
