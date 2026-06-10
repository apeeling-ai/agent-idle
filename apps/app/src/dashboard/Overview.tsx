import { CountUp } from "./CountUp";
import { EffortBar } from "./EffortBar";
import { Ring } from "./Ring";
import { DAILY_ACTIVE_GOAL_MS, formatDuration, formatScore, formatTokens } from "./format";
import type { LifetimeTotals, StatsOverview } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ZERO_ACTION = { shell: 0, edit: 0, read: 0, web: 0, thinking: 0, idle: 0 };

function dayLabel(utcDay: number): string {
  const d = new Date(utcDay * DAY_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A labelled headline figure that counts up; `format` controls units (tokens/time/count). */
function Figure({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
}) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">
        <CountUp value={value} format={format} />
      </span>
    </div>
  );
}

/** A record tile (static value + caption) — streaks and the best day on record. */
function Record({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="record">
      <span className="record__icon">{icon}</span>
      <div className="record__body">
        <span className="record__value">{value}</span>
        <span className="record__label">{label}</span>
        {sub ? <span className="record__sub">{sub}</span> : null}
      </div>
    </div>
  );
}

export function Overview({
  overview,
  lifetime,
}: {
  overview: StatsOverview;
  /** Complete never-reset totals (from the dailyStats rollup) — the accumulation figures. */
  lifetime: LifetimeTotals;
}) {
  const today = overview.today;
  const activeMs = today?.activeMs ?? 0;
  const todayTokens = today?.tokensFed ?? 0;
  const fraction = activeMs / DAILY_ACTIVE_GOAL_MS;
  const best = overview.bestDay;
  const bestTokens = best ? (overview.days.find((d) => d.utcDay === best.utcDay)?.tokensFed ?? 0) : 0;

  return (
    <div className="overview">
      {/* Hero: the headline is TOTAL TOKENS FED — the number that only ever climbs. */}
      <section className="panel hero">
        <div className="hero__text">
          <span className="hero__eyebrow">🪙 Tokens fed · all-time</span>
          <span className="hero__big">
            <CountUp value={lifetime.tokensFed} format={formatTokens} />
          </span>
          <div className="hero__mini">
            <span>🔥 {overview.streak}-day streak</span>
            <span>🏆 best {overview.longestStreak}d</span>
            <span>📅 {overview.daysActive} days active</span>
          </div>
        </div>
        <Ring
          fraction={fraction}
          center={`${Math.round(fraction * 100)}%`}
          caption="of today's 2h goal"
        />
      </section>

      {/* The rest of the lifetime accumulation — also never resets. */}
      <section className="panel">
        <h3 className="panel__title">
          Lifetime <span className="panel__hint">since day one</span>
        </h3>
        <div className="totals">
          <Figure label="🤖 Worked turns · this month" value={overview.season.promptCount} format={formatScore} />
          <Figure label="⏱️ Time worked" value={lifetime.activeMs} format={formatDuration} />
          <Figure label="🤖 Worked turns" value={lifetime.promptCount} format={formatScore} />
          <Figure label="🪙 This month" value={overview.season.tokensFed} format={formatTokens} />
        </div>
      </section>

      {/* Records — the personal bests worth chasing. */}
      <section className="panel">
        <h3 className="panel__title">Records</h3>
        <div className="records">
          <Record icon="🔥" label="current streak" value={`${overview.streak}d`} />
          <Record icon="🏆" label="longest streak" value={`${overview.longestStreak}d`} />
          <Record
            icon="⭐"
            label="best day"
            value={best ? formatTokens(bestTokens) : "—"}
            sub={best ? dayLabel(best.utcDay) : "no active day yet"}
          />
          <Record icon="🪙" label="today" value={formatTokens(todayTokens)} />
        </div>
      </section>

      {/* Today at a glance — turn-driven, never per-second, so it sits still at rest. */}
      <section className="panel">
        <h3 className="panel__title">
          Today <span className="panel__hint">{formatDuration(activeMs)} worked · 🪙 {formatTokens(todayTokens)}</span>
        </h3>
        <EffortBar actionMs={today?.actionMs ?? ZERO_ACTION} />
      </section>
    </div>
  );
}
