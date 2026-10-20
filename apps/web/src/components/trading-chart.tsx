"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, createSeriesMarkers, type MouseEventParams, type Time, type UTCTimestamp } from "lightweight-charts";
import { useTheme } from "next-themes";

export interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartMarker {
  /** Seconds since the epoch, snapped to the bar the fill falls in. */
  time: number;
  price: number;
  side: "buy" | "sell";
  quantity: number;
  decisionId: string;
}

const GAIN = "rgb(34, 197, 94)";
const LOSS = "rgb(239, 68, 68)";

// Candles, volume and the agent's fills. Clicking a fill marker jumps to its
// decision in the feed. The TradingView attribution logo stays on (hard rule 12).
export function TradingChart({ bars, markers }: { bars: ChartBar[]; markers: ChartMarker[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;
    const dark = resolvedTheme !== "light";
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#a1a1aa" : "#52525b", attributionLogo: true },
      grid: { vertLines: { color: dark ? "#1f1f23" : "#f4f4f5" }, horzLines: { color: dark ? "#27272a" : "#e4e4e7" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: GAIN, downColor: LOSS, borderVisible: false, wickUpColor: GAIN, wickDownColor: LOSS });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.25 } });
    candles.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));

    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)" })));

    createSeriesMarkers(
      candles,
      [...markers]
        .sort((a, b) => a.time - b.time)
        .map((m) => ({
          id: m.decisionId,
          time: m.time as UTCTimestamp,
          position: m.side === "buy" ? ("atPriceBottom" as const) : ("atPriceTop" as const),
          price: m.price,
          shape: m.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          color: m.side === "buy" ? GAIN : LOSS,
          text: `${m.side === "buy" ? "Buy" : "Sell"} ${m.quantity}`,
        })),
    );

    const onClick = (p: MouseEventParams<Time>) => {
      if (typeof p.hoveredObjectId !== "string") return;
      const card = document.getElementById(`decision-${p.hoveredObjectId}`);
      if (!card) return;
      history.replaceState(null, "", `#decision-${p.hoveredObjectId}`);
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      card.focus();
    };
    chart.subscribeClick(onClick);
    chart.timeScale().fitContent();
    return () => {
      chart.unsubscribeClick(onClick);
      chart.remove();
    };
  }, [bars, markers, resolvedTheme]);

  return <div ref={ref} className="h-[26rem] w-full" data-testid="trading-chart" />;
}
