"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart } from "lightweight-charts";
import { useTheme } from "next-themes";

// TradingView Lightweight Charts. Its attribution logo stays on (CLAUDE.md hard rule 12),
// so layout.attributionLogo is never set to false here.
export function EquityChart({ points }: { points: { date: string; equity: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;
    const dark = resolvedTheme !== "light";
    const up = points.length < 2 || points[points.length - 1]!.equity >= points[0]!.equity;
    // The canvas needs hex or rgb colors; these match the --gain and --loss tokens.
    const [r, g, b] = up ? [34, 197, 94] : [239, 68, 68];

    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#a1a1aa" : "#52525b", attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#27272a" : "#e4e4e7" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: `rgb(${r}, ${g}, ${b})`,
      topColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
      bottomColor: `rgba(${r}, ${g}, ${b}, 0)`,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    series.setData(points.map((p) => ({ time: p.date, value: p.equity })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points, resolvedTheme]);

  if (points.length === 0) return <p className="py-16 text-center text-sm text-muted-foreground">No trading days recorded yet.</p>;
  return <div ref={ref} className="h-72 w-full" data-testid="equity-chart" />;
}
