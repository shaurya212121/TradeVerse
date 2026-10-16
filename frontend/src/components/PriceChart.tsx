import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, LineData } from 'lightweight-charts';
import { useMarketStore } from '../store/marketStore';
import { BarChart3, TrendingUp } from 'lucide-react';

type Timeframe = '1s' | '5s' | '1m' | '15m' | '1h';

// Helper to generate realistic historical OHLCV data based on base price
function generateHistoricalCandles(basePrice: number, count = 60, intervalSeconds = 5): {
  candles: CandlestickData[];
  volumes: HistogramData[];
  ema: LineData[];
} {
  const candles: CandlestickData[] = [];
  const volumes: HistogramData[] = [];
  const ema: LineData[] = [];

  let currentClose = basePrice * 0.98;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * intervalSeconds;

  let emaVal = currentClose;
  const alpha = 2 / (20 + 1);

  for (let i = 0; i < count; i++) {
    const time = (startTime + i * intervalSeconds) as any;
    const volatility = basePrice * 0.003;
    const change = (Math.random() - 0.48) * volatility;
    const open = currentClose;
    const close = +(open + change).toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * volatility * 0.5).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * volatility * 0.5).toFixed(2);
    currentClose = close;

    candles.push({ time, open, high, low, close });

    const isUp = close >= open;
    volumes.push({
      time,
      value: Math.floor(Math.random() * 500) + 50,
      color: isUp ? 'rgba(0, 240, 144, 0.25)' : 'rgba(255, 59, 86, 0.25)',
    });

    emaVal = close * alpha + emaVal * (1 - alpha);
    ema.push({ time, value: +emaVal.toFixed(2) });
  }

  return { candles, volumes, ema };
}

export const PriceChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('5s');
  const [showEMA, setShowEMA] = useState(true);

  const { activeTicker, prices } = useMarketStore();
  const currentPrice = prices[activeTicker];

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0E1117' },
        textColor: '#64748B',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        vertLine: { color: '#38BDF8', width: 1, style: 2, labelBackgroundColor: '#38BDF8' },
        horzLine: { color: '#38BDF8', width: 1, style: 2, labelBackgroundColor: '#38BDF8' },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
      },
    });

    // 1. Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00F090',
      downColor: '#FF3B56',
      borderVisible: false,
      wickUpColor: '#00F090',
      wickDownColor: '#FF3B56',
    });

    // 2. Volume Histogram Series (overlay in bottom 20%)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    // 3. EMA Line Series
    const emaSeries = chart.addLineSeries({
      color: '#F59E0B',
      lineWidth: 1,
      priceLineVisible: false,
      title: 'EMA 20',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    emaSeriesRef.current = emaSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update Data when Ticker or Timeframe changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !emaSeriesRef.current) return;

    const base = currentPrice?.price || 180.0;
    const intervalSec = timeframe === '1s' ? 1 : timeframe === '5s' ? 5 : timeframe === '1m' ? 60 : 300;
    const { candles, volumes, ema } = generateHistoricalCandles(base, 60, intervalSec);

    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volumes);
    if (showEMA) {
      emaSeriesRef.current.setData(ema);
    } else {
      emaSeriesRef.current.setData([]);
    }

    chartRef.current?.timeScale().fitContent();
  }, [activeTicker, timeframe, showEMA]);

  // Handle incoming real-time ticks
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !currentPrice) return;

    const now = Math.floor(Date.now() / 1000);
    const p = currentPrice.price;

    candleSeriesRef.current.update({
      time: now as any,
      open: p,
      high: +(p + Math.random() * 0.1).toFixed(2),
      low: +(p - Math.random() * 0.1).toFixed(2),
      close: p,
    });

    volumeSeriesRef.current.update({
      time: now as any,
      value: Math.floor(Math.random() * 80) + 10,
      color: currentPrice.change >= 0 ? 'rgba(0, 240, 144, 0.3)' : 'rgba(255, 59, 86, 0.3)',
    });
  }, [currentPrice]);

  return (
    <div className="w-full h-full flex flex-col bg-[#0E1117]/80 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
      {/* Chart Top Controls */}
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-cyan">{activeTicker}</span>
            <span className="text-text-muted text-[11px]">CANDLESTICK + VOL</span>
          </div>

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Timeframe selector */}
          <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/[0.06]">
            {(['1s', '5s', '1m', '15m', '1h'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-cyan/20 text-cyan border border-cyan/30'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* EMA Overlay Toggle */}
          <button
            onClick={() => setShowEMA(!showEMA)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
              showEMA
                ? 'bg-amber/10 border-amber/30 text-amber'
                : 'border-white/[0.06] text-text-muted hover:text-text-primary'
            }`}
          >
            <TrendingUp size={12} />
            <span>EMA 20</span>
          </button>
        </div>

        {/* Live Candle Stat */}
        <div className="flex items-center gap-4 text-[11px]">
          {currentPrice && (
            <div className="flex items-center gap-2">
              <span className="text-text-muted">LAST:</span>
              <span className={`font-bold tabular-nums ${currentPrice.change >= 0 ? 'text-bull-green' : 'text-bear-red'}`}>
                ${currentPrice.price.toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-text-muted">
            <BarChart3 size={13} className="text-cyan" />
            <span>VWAP: ${(basePrice => (basePrice * 1.002).toFixed(2))(currentPrice?.price || 180)}</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="flex-1 w-full relative" />
    </div>
  );
};
