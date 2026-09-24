"use client";
import { useEffect, useRef, useState } from "react";
import { ColorType, createChart, LineSeries, type ISeriesApi, type Time } from "lightweight-charts";
import { continuousSegments, DAY_MS, type GPUPricePoint } from "@/lib/market";

// Array input intentionally supports future GPU comparison without changing the chart contract.
export type ChartSeries = { label: string; color: string; points: GPUPricePoint[] };
export default function PriceChart({ series, theme }: { series: ChartSeries[]; theme: "dark" | "light" }) {
  const container = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState("");
  useEffect(() => {
    if (!container.current) return;
    setHover("");
    const dark = theme === "dark";
    const chart = createChart(container.current, {
      autoSize: true, height: 330,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#84928f" : "#64716e", fontFamily: "Arial, sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#24312e" : "#e4eae7", style: 1 } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.15 } },
      timeScale: { borderVisible: false, rightOffset: 2, minBarSpacing: 0.1 },
      crosshair: { vertLine: { color: "#74877d", labelBackgroundColor: "#305442" }, horzLine: { color: "#74877d", labelBackgroundColor: "#305442" } },
      localization: { locale: "en-US", priceFormatter: (p: number) => "$" + p.toFixed(3) },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
    });
    const entries: { api: ISeriesApi<"Line">; label: string; archival: boolean }[] = [];
    const allPoints = series.flatMap(s => s.points);
    // Add whitespace dates for a true calendar scale. Values remain absent, never zero-filled.
    if (allPoints.length) {
      const min = Math.min(...allPoints.map(p => Date.parse(p.timestamp)));
      const max = Math.max(...allPoints.map(p => Date.parse(p.timestamp)));
      const timeline = chart.addSeries(LineSeries, { visible: false, priceScaleId: "" });
      const calendar = [];
      for (let day = min; day <= max; day += DAY_MS) calendar.push({ time: new Date(day).toISOString().slice(0, 10) });
      timeline.setData(calendar);
    }
    for (const item of series) {
      const segments = continuousSegments(item.points);
      segments.forEach((segment, index) => {
        const archival = segment[0].archival;
        const line = chart.addSeries(LineSeries, {
          color: archival ? "#91a0be" : item.color, lineWidth: 2,
          lineVisible: !archival, pointMarkersVisible: archival || segment.length === 1, pointMarkersRadius: 3,
          lastValueVisible: index === segments.length - 1, priceLineVisible: index === segments.length - 1,
          priceLineColor: dark ? "#52785f" : "#9cb6a7", priceLineStyle: 2,
          priceFormat: { type: "price", precision: 3, minMove: 0.001 },
        });
        line.setData(segment.map(p => ({ time: p.timestamp.slice(0, 10), value: p.priceUsdPerGpuHour })));
        entries.push({ api: line, label: item.label, archival });
      });
    }
    chart.subscribeCrosshairMove(event => {
      const values = entries.flatMap(entry => {
        const data = event.seriesData.get(entry.api);
        return data && "value" in data ? [`${entry.label} $${data.value.toFixed(4)}${entry.archival ? " · Archive" : ""}`] : [];
      });
      const time: Time | undefined = event.time;
      const label = typeof time === "object" ? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}` : String(time ?? "");
      setHover(values.length ? `${label}  /  ${values.join(" · ")}` : "");
    });
    chart.timeScale().fitContent();
    const resize = new ResizeObserver(() => chart.timeScale().fitContent());
    resize.observe(container.current);
    return () => { resize.disconnect(); chart.remove(); };
  }, [series, theme]);
  return <div className="chart-wrap"><div className="chart-hover" aria-live="polite">{hover || "チャートにカーソルを合わせて日次価格を確認"}</div><div ref={container} className="chart-canvas" role="img" aria-label="GPUレンタル価格の時系列チャート。欠損日は線をつながず表示します。" /></div>;
}
