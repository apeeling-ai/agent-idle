/**
 * Pixel-bar chart, SVG-based for crisp blocky bars (shape-rendering crispEdges) plus an
 * optional moving-average overlay line. Used for both the live token stream (Today) and
 * the multi-day trend (Trends). RESPONSIVE: it measures its container so it always fills
 * the panel exactly and never overflows the (clipped) dashboard body.
 */
import { useEffect, useRef, useState } from "react";

export interface Bar {
  key: string | number;
  value: number;
  /** Optional label under the bar (drawn sparsely to avoid clutter). */
  label?: string;
  /** Highlight (e.g. the current/last bar). */
  hot?: boolean;
}

export function BarChart({
  bars,
  height = 150,
  color = "var(--gold)",
  overlay,
  emptyLabel = "no activity yet",
}: {
  bars: Bar[];
  height?: number;
  color?: string;
  /** Per-bar overlay values (e.g. moving average) drawn as a line. Same length as bars. */
  overlay?: number[];
  emptyLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 8, bottom: 16, left: 4, right: 4 };
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...bars.map((b) => b.value), ...(overlay ?? []));
  const n = Math.max(1, bars.length);
  const hasData = bars.some((b) => b.value > 0);

  // Render the SVG only once we know the real width, so a fixed fallback can't briefly
  // overflow the clipped body. The wrapper still occupies the row so the measure is stable.
  const w = width;
  const plotW = w - pad.left - pad.right;
  const slot = plotW / n;
  // Cap the bar width so a sparse series (a couple of days) renders as slim bars, never one
  // giant slab spanning the chart.
  const barW = Math.min(22, Math.max(1, slot * 0.7));
  const y = (v: number) => pad.top + plotH * (1 - v / max);
  const linePts =
    overlay && overlay.length === bars.length
      ? overlay.map((v, i) => `${pad.left + slot * (i + 0.5)},${y(v)}`).join(" ")
      : null;

  return (
    <div className="barchart" ref={wrapRef} style={{ height }}>
      {w > 0 ? (
        <svg width={w} height={height} shapeRendering="crispEdges">
          <line
            x1={pad.left}
            y1={pad.top + plotH}
            x2={w - pad.right}
            y2={pad.top + plotH}
            stroke="var(--edge)"
            strokeWidth={1}
          />
          {bars.map((b, i) => {
            const h = (b.value / max) * plotH;
            const x = pad.left + slot * i + (slot - barW) / 2;
            return (
              <rect
                key={b.key}
                className={`bar ${b.hot ? "bar--hot" : ""}`}
                x={x}
                y={pad.top + plotH - h}
                width={barW}
                height={Math.max(b.value > 0 ? 1 : 0, h)}
                fill={b.hot ? "var(--gold)" : color}
                rx={1}
              />
            );
          })}
          {linePts ? (
            <polyline
              points={linePts}
              fill="none"
              stroke="var(--parch)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              opacity={0.7}
              shapeRendering="geometricPrecision"
            />
          ) : null}
          {bars.map((b, i) =>
            b.label ? (
              <text
                key={`l-${b.key}`}
                x={pad.left + slot * (i + 0.5)}
                y={height - 4}
                textAnchor="middle"
                className="bar__label"
              >
                {b.label}
              </text>
            ) : null,
          )}
        </svg>
      ) : null}
      {!hasData ? <div className="barchart__empty">{emptyLabel}</div> : null}
    </div>
  );
}
