import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../store/marketStore';

export const PriceChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  const { activeTicker, prices } = useMarketStore();
  const currentPrice = prices[activeTicker];

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#121216' }, // surface
        textColor: '#8a8a94', // text-muted
      },
      grid: {
        vertLines: { color: '#242429' }, // border
        horzLines: { color: '#242429' },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: {
        vertLine: { color: '#4f8cff', labelBackgroundColor: '#4f8cff' },
        horzLine: { color: '#4f8cff', labelBackgroundColor: '#4f8cff' },
      }
    });

    const series = chart.addLineSeries({
      color: '#4f8cff',
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Initial size
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []); // Mount only

  // Update chart data when active ticker changes (ideally we fetch history here, for now we just clear)
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData([]);
    }
  }, [activeTicker]);

  // Update chart when new ticks arrive
  useEffect(() => {
    if (seriesRef.current && currentPrice) {
      seriesRef.current.update({
        time: (currentPrice.timestamp / 1000) as any,
        value: currentPrice.price
      });
    }
  }, [currentPrice]);

  return (
    <div className="w-full h-full flex flex-col bg-surface border border-border">
      <div className="px-4 py-2 border-b border-border flex justify-between items-center">
        <span className="font-mono font-bold text-accent">{activeTicker}</span>
        {currentPrice && (
          <span className={`font-mono tabular-nums ${currentPrice.change >= 0 ? 'text-bull-green' : 'text-bear-red'}`}>
            {currentPrice.price.toFixed(2)}
          </span>
        )}
      </div>
      <div ref={chartContainerRef} className="flex-1 w-full relative" />
    </div>
  );
};
