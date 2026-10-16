import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Cpu, Zap, Shield, Activity } from 'lucide-react';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 3D Perspective Canvas Simulation (Stars + Perspective Wave Grid) - Untouched
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle nodes in 3D perspective space
    const numParticles = 160;
    const particles: { x: number; y: number; z: number; ox: number; oy: number }[] = [];
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: (Math.random() - 0.5) * width * 2,
        y: (Math.random() - 0.5) * height * 2,
        z: Math.random() * 1000 + 100,
        ox: 0,
        oy: 0,
      });
    }

    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX - width / 2) * 0.05;
      mouseY = (e.clientY - height / 2) * 0.05;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let angle = 0;

    const render = () => {
      ctx.fillStyle = '#07080B';
      ctx.fillRect(0, 0, width, height);

      // Draw subtle horizon grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      const horizonY = height * 0.65;

      for (let x = -width; x <= width * 2; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x + mouseX, height);
        ctx.lineTo(width / 2 + mouseX * 0.2, horizonY);
        ctx.stroke();
      }

      for (let y = horizonY; y <= height; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Render 3D Perspective Particles
      angle += 0.003;
      const focalLength = 320;

      for (let i = 0; i < numParticles; i++) {
        const p = particles[i];
        p.z -= 1.8; // Move forward in 3D space
        if (p.z <= 10) {
          p.z = 1000;
          p.x = (Math.random() - 0.5) * width * 2;
          p.y = (Math.random() - 0.5) * height * 2;
        }

        const scale = focalLength / p.z;
        const px = width / 2 + (p.x + mouseX * 2) * scale;
        const py = height / 2 + (p.y + mouseY * 2) * scale;

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          const size = Math.max(0.8, scale * 3.5);
          const alpha = Math.min(1, (1000 - p.z) / 700);

          ctx.fillStyle = i % 3 === 0 ? `rgba(0, 240, 144, ${alpha * 0.8})` : `rgba(56, 189, 248, ${alpha * 0.9})`;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();

          // Connect nearby points with glowing lines
          for (let j = i + 1; j < Math.min(i + 8, numParticles); j++) {
            const p2 = particles[j];
            const scale2 = focalLength / p2.z;
            const px2 = width / 2 + (p2.x + mouseX * 2) * scale2;
            const py2 = height / 2 + (p2.y + mouseY * 2) * scale2;
            const dist = Math.hypot(px - px2, py - py2);

            if (dist < 85) {
              ctx.strokeStyle = `rgba(56, 189, 248, ${0.15 * (1 - dist / 85) * alpha})`;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px2, py2);
              ctx.stroke();
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Listen for Enter key to launch into Markets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        navigate('/markets');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#07080B] flex flex-col items-center justify-center select-none">
      {/* 1. 3D WebGL/Canvas Background (Preserved 100%) */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* 2. Stock Market Bull Aesthetic Layer (Green glowing upward arrow & candlestick silhouettes) */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden opacity-60">
        {/* Ambient Emerald Green Glow Bloom */}
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[350px] bg-emerald-500/15 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[250px] bg-bull-green/10 blur-[100px] rounded-full" />

        <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
          <defs>
            {/* Gradient for upward trend line */}
            <linearGradient id="trendGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00F090" stopOpacity="0.2" />
              <stop offset="60%" stopColor="#00F090" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>

            {/* Gradient for candlestick bars */}
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00F090" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00F090" stopOpacity="0.05" />
            </linearGradient>

            {/* Arrow marker */}
            <marker id="arrowUp" markerWidth="12" markerHeight="12" refX="8" refY="6" orient="auto">
              <path d="M 0 1 L 10 6 L 0 11 Z" fill="#FFFFFF" />
            </marker>

            {/* Glow Filter */}
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Financial Grid Lines */}
          <g opacity="0.15" stroke="#00F090" strokeWidth="0.8" strokeDasharray="3 3">
            <line x1="0" y1="200" x2="1440" y2="200" />
            <line x1="0" y1="400" x2="1440" y2="400" />
            <line x1="0" y1="600" x2="1440" y2="600" />
            <line x1="0" y1="750" x2="1440" y2="750" />
            <line x1="280" y1="0" x2="280" y2="900" />
            <line x1="560" y1="0" x2="560" y2="900" />
            <line x1="840" y1="0" x2="840" y2="900" />
            <line x1="1120" y1="0" x2="1120" y2="900" />
          </g>

          {/* Ascending Candlestick Bar Silhouettes */}
          <g>
            {/* Candle 1 */}
            <line x1="220" y1="620" x2="220" y2="740" stroke="#00F090" strokeWidth="1.5" opacity="0.3" />
            <rect x="210" y="650" width="20" height="70" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.4" />

            {/* Candle 2 */}
            <line x1="320" y1="580" x2="320" y2="720" stroke="#00F090" strokeWidth="1.5" opacity="0.3" />
            <rect x="310" y="610" width="20" height="90" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.4" />

            {/* Candle 3 */}
            <line x1="420" y1="540" x2="420" y2="690" stroke="#00F090" strokeWidth="1.5" opacity="0.3" />
            <rect x="410" y="560" width="20" height="110" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.45" />

            {/* Candle 4 (Dip then rally) */}
            <line x1="520" y1="580" x2="520" y2="710" stroke="#00F090" strokeWidth="1.5" opacity="0.3" />
            <rect x="510" y="600" width="20" height="85" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.4" />

            {/* Candle 5 */}
            <line x1="620" y1="510" x2="620" y2="670" stroke="#00F090" strokeWidth="1.5" opacity="0.35" />
            <rect x="610" y="530" width="20" height="120" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.5" />

            {/* Candle 6 */}
            <line x1="720" y1="460" x2="720" y2="630" stroke="#00F090" strokeWidth="1.5" opacity="0.35" />
            <rect x="710" y="480" width="20" height="130" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.5" />

            {/* Candle 7 (Breakout) */}
            <line x1="820" y1="390" x2="820" y2="580" stroke="#00F090" strokeWidth="1.5" opacity="0.4" />
            <rect x="810" y="410" width="20" height="150" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.6" />

            {/* Candle 8 */}
            <line x1="920" y1="340" x2="920" y2="520" stroke="#00F090" strokeWidth="1.5" opacity="0.4" />
            <rect x="910" y="360" width="20" height="140" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.6" />

            {/* Candle 9 */}
            <line x1="1020" y1="280" x2="1020" y2="470" stroke="#00F090" strokeWidth="1.5" opacity="0.45" />
            <rect x="1010" y="300" width="20" height="155" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.7" />

            {/* Candle 10 (Peak) */}
            <line x1="1120" y1="210" x2="1120" y2="410" stroke="#00F090" strokeWidth="1.5" opacity="0.45" />
            <rect x="1110" y="230" width="20" height="165" rx="2" fill="url(#barGradient)" stroke="#00F090" strokeWidth="0.8" opacity="0.75" />
          </g>

          {/* Sweeping Ascending Trend Line with Glowing Arrowhead */}
          <path
            d="M 120 730 Q 380 670 540 640 T 780 480 T 1020 330 L 1180 210"
            stroke="url(#trendGradient)"
            strokeWidth="3.5"
            strokeLinecap="round"
            filter="url(#neonGlow)"
            markerEnd="url(#arrowUp)"
          />

          {/* Floating Subtle Stock Metrics */}
          <text x="1195" y="195" fill="#00F090" fontSize="13" fontFamily="monospace" fontWeight="bold" opacity="0.85">
            +500.21% ▲
          </text>
          <text x="790" y="450" fill="#38BDF8" fontSize="11" fontFamily="monospace" opacity="0.6">
            BREAKOUT VOL: 85.2K
          </text>
        </svg>
      </div>

      {/* 3. Main Foreground Content Card */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl px-6 space-y-8 backdrop-blur-[2px]">
        {/* Core Architecture Badge */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0E1117]/90 border border-white/[0.12] shadow-2xl backdrop-blur-xl animate-pulse-subtle">
          <Activity size={14} className="text-bull-green animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider text-text-primary">
            C++17 MULTITHREADED MATCHING ENGINE
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bull-green/15 text-bull-green border border-bull-green/30">
            320 μs Median
          </span>
        </div>

        {/* 3D Holographic Title */}
        <div className="space-y-3">
          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-[0_10px_35px_rgba(0,240,144,0.25)]">
            TRADEVERSE
          </h1>
          <p className="text-sm md:text-base text-text-muted font-mono max-w-xl mx-auto leading-relaxed">
            Institutional-grade order execution engine with sharded in-memory orderbooks, ZeroMQ socket messaging, and asynchronous Write-Ahead Logging.
          </p>
        </div>

        {/* Action Button + Keyboard Instruction */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            onClick={() => navigate('/markets')}
            className="group relative px-8 py-4 rounded-xl font-mono font-bold text-sm text-obsidian bg-gradient-to-r from-bull-green via-emerald-400 to-cyan shadow-[0_0_30px_rgba(0,240,144,0.35)] hover:shadow-[0_0_45px_rgba(0,240,144,0.55)] transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-3 cursor-pointer"
          >
            <span>ENTER COMMAND CENTER</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="flex items-center gap-2 text-xs font-mono text-text-dim">
            <span>or press</span>
            <kbd className="px-2 py-1 rounded bg-white/[0.08] border border-white/[0.15] text-text-primary text-[11px] font-semibold shadow-inner">
              ENTER ↵
            </kbd>
            <span>to initialize</span>
          </div>
        </div>

        {/* 3 Vital Specs Highlights - 100% Honest, Realistic Benchmarks */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full pt-6">
          {/* Latency */}
          <div className="p-3.5 rounded-xl bg-[#0E1117]/80 backdrop-blur-md border border-white/[0.08] flex items-center gap-3 text-left">
            <div className="p-2.5 rounded-lg bg-bull-green/10 border border-bull-green/20 text-bull-green">
              <Zap size={18} />
            </div>
            <div>
              <span className="text-[10px] font-mono text-text-dim block">EXECUTION LATENCY</span>
              <span className="text-sm font-mono font-bold text-bull-green">320 μs Median</span>
              <span className="text-[10px] font-mono text-text-muted block">P99 &lt; 2 ms</span>
            </div>
          </div>

          {/* Throughput */}
          <div className="p-3.5 rounded-xl bg-[#0E1117]/80 backdrop-blur-md border border-white/[0.08] flex items-center gap-3 text-left">
            <div className="p-2.5 rounded-lg bg-cyan/10 border border-cyan/20 text-cyan">
              <Cpu size={18} />
            </div>
            <div>
              <span className="text-[10px] font-mono text-text-dim block">PEAK THROUGHPUT</span>
              <span className="text-sm font-mono font-bold text-cyan">~100K/s Linux</span>
              <span className="text-[10px] font-mono text-text-muted block">~15K/s Windows</span>
            </div>
          </div>

          {/* Durability */}
          <div className="p-3.5 rounded-xl bg-[#0E1117]/80 backdrop-blur-md border border-white/[0.08] flex items-center gap-3 text-left">
            <div className="p-2.5 rounded-lg bg-amber/10 border border-amber/20 text-amber">
              <Shield size={18} />
            </div>
            <div>
              <span className="text-[10px] font-mono text-text-dim block">DURABILITY (WAL)</span>
              <span className="text-sm font-mono font-bold text-amber">CRC32 Checksum</span>
              <span className="text-[10px] font-mono text-text-muted block">Async Disk Journal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
