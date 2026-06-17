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

/** One time-scope's headline tokens + worked-turns/time sub-line (+ leaderboard rank for the live
 * windows). `variant` lifts Today/Season above the muted All-time total. */
function Scope({
  label,
  tokens,
  turns,
  activeMs,
  variant,
  rank,
}: {
  label: string;
  tokens: number;
  turns: number;
  activeMs: number;
  variant: "day" | "season" | "muted";
  rank?: { rank: number; total: number } | null;
}) {
  return (
    <div className={`stat-card scope-card scope-card--${variant}`}>
      <span className="stat-card__label">
        {label}
        {rank ? <span className="scope-card__rank">#{rank.rank} of {rank.total}</span> : null}
      </span>
      <span className="stat-card__value">
        <CountUp value={tokens} format={formatTokens} />
      </span>
      <span className="stat-card__sub">
        🤖 {formatScore(turns)} turns · ⏱️ {formatDuration(activeMs)}
      </span>
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
  const todayTurns = today?.promptCount ?? 0;
  const season = overview.season;
  const fraction = activeMs / DAILY_ACTIVE_GOAL_MS;
  const best = overview.bestDay;
  const bestTokens = best ? (overview.days.find((d) => d.utcDay === best.utcDay)?.tokensFed ?? 0) : 0;

  return (
    <div className="overview">
      {/* The three scopes at a glance — Today & Season are the live competitive windows (accented,
          with your rank); All-time is the never-resetting total (muted). One compact row. */}
      <section className="panel">
        <h3 className="panel__title">
          Standings <span className="panel__hint">season resets every 2 weeks</span>
        </h3>
        <div className="scopes">
          <Scope
            variant="day"
            label="🪙 Today"
            tokens={todayTokens}
            turns={todayTurns}
            activeMs={activeMs}
            rank={overview.dailyRank}
          />
          <Scope
            variant="season"
            label="🏅 Season"
            tokens={season.tokensFed}
            turns={season.promptCount}
            activeMs={season.activeMs}
            rank={overview.seasonRank}
          />
          <Scope
            variant="muted"
            label="🗄️ All-time"
            tokens={lifetime.tokensFed}
            turns={lifetime.promptCount}
            activeMs={lifetime.activeMs}
          />
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
          <Record icon="📅" label="days active" value={`${overview.daysActive}`} />
        </div>
      </section>

      {/* Today in detail — the 2h goal ring beside today's effort split. Turn-driven, never
          per-second, so it sits still at rest. */}
      <section className="panel today-detail">
        <div className="today-detail__head">
          <h3 className="panel__title">
            Today <span className="panel__hint">{formatDuration(activeMs)} worked · 🪙 {formatTokens(todayTokens)}</span>
          </h3>
          <Ring
            fraction={fraction}
            size={84}
            stroke={9}
            center={`${Math.round(fraction * 100)}%`}
            caption="of 2h goal"
          />
        </div>
        <EffortBar actionMs={today?.actionMs ?? ZERO_ACTION} />
      </section>
    </div>
  );
}
