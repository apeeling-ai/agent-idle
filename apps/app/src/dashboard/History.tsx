import { useState } from "react";
import { BarChart, type Bar } from "./BarChart";
import { EffortBar } from "./EffortBar";
import { Heatmap, type HeatMetric } from "./Heatmap";
import { formatDuration, formatTokens } from "./format";
import type { DayPoint, StatsOverview } from "./types";

const METRICS: { key: HeatMetric; label: string; pick: (d: DayPoint) => number; fmt: (n: number) => string }[] = [
  { key: "tokens", label: "Tokens", pick: (d) => d.tokensFed, fmt: formatTokens },
  { key: "active", label: "Time", pick: (d) => d.activeMs, fmt: formatDuration },
];

const WINDOWS: { key: number; label: string }[] = [
  { key: 30, label: "30d" },
  { key: 90, label: "90d" },
];

/** 7-day trailing moving average over a value series. */
function movingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = values.slice(from, i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

/** UTC-day index → "M/D" label. */
function dayLabel(utcDay: number): string {
  const d = new Date(utcDay * 24 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function History({ overview }: { overview: StatsOverview }) {
  const [metric, setMetric] = useState<HeatMetric>("tokens");
  const [win, setWin] = useState(30);
  const active = METRICS.find((m) => m.key === metric)!;

  const byDay = new Map(overview.days.map((d) => [d.utcDay, d]));

  // A CONTINUOUS daily axis (zero-filled) so a few active days render as a real timeline,
  // not a couple of giant blocks spread across the width.
  const series: { utcDay: number; value: number }[] = [];
  for (let d = overview.utcDay - win + 1; d <= overview.utcDay; d++) {
    const row = byDay.get(d);
    series.push({ utcDay: d, value: row ? active.pick(row) : 0 });
  }
  const values = series.map((s) => s.value);
  const avg = movingAverage(values);

  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const bars: Bar[] = series.map((s, i) => ({
    key: s.utcDay,
    value: s.value,
    hot: s.utcDay === overview.utcDay,
    label: i % labelEvery === 0 ? dayLabel(s.utcDay) : undefined,
  }));

  const total = values.reduce((s, v) => s + v, 0);

  return (
    <div className="history">
      <section className="panel">
        <div className="trends__head">
          <h3 className="panel__title">
            Contributions <span className="panel__hint">last 53 weeks</span>
          </h3>
          <div className="seg">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`seg__btn ${m.key === metric ? "seg__btn--on" : ""}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <Heatmap days={overview.days} today={overview.utcDay} metric={metric} />
      </section>

      <section className="panel">
        <div className="trends__head">
          <h3 className="panel__title">Daily {active.label.toLowerCase()}</h3>
          <div className="seg">
            {WINDOWS.map((wd) => (
              <button
                key={wd.key}
                type="button"
                className={`seg__btn ${wd.key === win ? "seg__btn--on" : ""}`}
                onClick={() => setWin(wd.key)}
              >
                {wd.label}
              </button>
            ))}
          </div>
        </div>
        <BarChart bars={bars} overlay={avg} emptyLabel="no history yet — come back tomorrow" />
        <p className="trends__foot">
          {active.label} total ({win}d): <b>{active.fmt(total)}</b> · line = 7-day average
        </p>
      </section>

      <section className="panel">
        <h3 className="panel__title">
          Lifetime effort <span className="panel__hint">where the time went</span>
        </h3>
        <EffortBar actionMs={overview.lifetime.actionMs} />
      </section>
    </div>
  );
}
