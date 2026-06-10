import { CountUp } from "./CountUp";
import { formatScore } from "./format";

/** A labelled gold figure (Today / Season / All-Time score, or any headline number). */
export function StatCard({
  label,
  value,
  sub,
  big = false,
  animate = true,
}: {
  label: string;
  value: number;
  sub?: string;
  big?: boolean;
  animate?: boolean;
}) {
  return (
    <div className={`stat-card ${big ? "stat-card--big" : ""}`}>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">
        {animate ? <CountUp value={value} format={formatScore} /> : formatScore(value)}
      </span>
      {sub ? <span className="stat-card__sub">{sub}</span> : null}
    </div>
  );
}
