/**
 * GitHub-style contribution calendar — the accumulation dashboard's centerpiece. Columns are
 * weeks (Sun→Sat rows), each cell a UTC day tinted by a selectable metric. SVG + crisp pixel
 * cells to match the rest of the dashboard; responsive via the same ResizeObserver measure as
 * BarChart. Pure render from the `days` series — nothing animates or re-buckets on a clock.
 */
import { dayOfWeek } from "@agent-idle/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration, formatTokens } from "./format";
import type { DayPoint } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const ROWS = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type HeatMetric = "tokens" | "active";

function pick(d: DayPoint, m: HeatMetric): number {
  return m === "active" ? d.activeMs : d.tokensFed;
}

function fmt(v: number, m: HeatMetric): string {
  return m === "active" ? formatDuration(v) : formatTokens(v);
}

/** A day index → "Jun 3" (UTC). */
function dayLabel(utcDay: number): string {
  const d = new Date(utcDay * DAY_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Value → 0 (empty) … 4 (hottest). LOG-scaled: token/time counts are heavy-tailed, so a
 * linear scale would wash out every day except the single biggest. Log keeps small days
 * visible relative to the busiest. */
function level(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const f = Math.log10(value + 1) / Math.log10(max + 1);
  if (f > 0.8) return 4;
  if (f > 0.6) return 3;
  if (f > 0.35) return 2;
  return 1;
}

export function Heatmap({
  days,
  today,
  metric,
  weeks = 53,
}: {
  days: DayPoint[];
  today: number;
  metric: HeatMetric;
  weeks?: number;
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

  // The grid: the rightmost column is the week containing `today`; we walk back `weeks` weeks.
  const { cells, max, gridStart } = useMemo(() => {
    const valueOf = new Map<number, number>();
    for (const d of days) valueOf.set(d.utcDay, pick(d, metric));
    const start = today - dayOfWeek(today) - (weeks - 1) * ROWS;
    let mx = 0;
    const grid: { utcDay: number; col: number; row: number; value: number }[] = [];
    for (let col = 0; col < weeks; col++) {
      for (let row = 0; row < ROWS; row++) {
        const utcDay = start + col * ROWS + row;
        if (utcDay > today) continue; // future cells render blank
        const value = valueOf.get(utcDay) ?? 0;
        if (value > mx) mx = value;
        grid.push({ utcDay, col, row, value });
      }
    }
    return { cells: grid, max: mx, gridStart: start };
  }, [days, today, metric, weeks]);

  const monthLabelH = 14;
  const w = width;
  const slot = w / weeks; // cell + gap per column
  const gap = Math.max(1, Math.round(slot * 0.16));
  const cell = Math.max(3, Math.floor(slot - gap));
  const height = monthLabelH + ROWS * (cell + gap);

  // Month markers: first column of each new UTC month (by that column's top-row day).
  const months = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    let prev = -1;
    for (let col = 0; col < weeks; col++) {
      const m = new Date((gridStart + col * ROWS) * DAY_MS).getUTCMonth();
      if (m !== prev) {
        out.push({ col, label: MONTHS[m] });
        prev = m;
      }
    }
    return out;
  }, [gridStart, weeks]);

  const hasData = max > 0;

  return (
    <div className="heatmap" ref={wrapRef}>
      {w > 0 ? (
        <svg width={w} height={height} shapeRendering="crispEdges">
          {months.map((mo) => (
            <text
              key={`m-${mo.col}`}
              x={mo.col * slot}
              y={10}
              className="heatmap__month"
            >
              {mo.label}
            </text>
          ))}
          {cells.map((c) => {
            const lv = level(c.value, max);
            return (
              <rect
                key={c.utcDay}
                className="heatmap__cell"
                x={c.col * slot}
                y={monthLabelH + c.row * (cell + gap)}
                width={cell}
                height={cell}
                rx={1}
                fill={`var(--heat-${lv})`}
              >
                <title>{`${dayLabel(c.utcDay)} · ${fmt(c.value, metric)}`}</title>
              </rect>
            );
          })}
        </svg>
      ) : null}
      {!hasData ? <div className="heatmap__empty">no history yet — grind a few sessions</div> : null}
    </div>
  );
}
