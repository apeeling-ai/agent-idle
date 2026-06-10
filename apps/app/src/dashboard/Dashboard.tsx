/**
 * The expanded stats dashboard the ambient overlay grows into. Window- and backend-
 * agnostic: it takes already-fetched data as props (App.tsx owns the convex subscriptions
 * and the Tauri window resize), so this whole tree could later move to a browser route or
 * a second window unchanged — same seam as render/.
 */

import { useState } from "react";
import "./dashboard.css";
import { History } from "./History";
import { Leaderboard } from "./Leaderboard";
import { Overview } from "./Overview";
import { Pets } from "./Pets";
import type { LeaderboardData, LifetimeTotals, PetStat, StatsOverview } from "./types";

type Tab = "overview" | "history" | "pets" | "leaderboard";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "history", label: "History" },
  { key: "pets", label: "Pets" },
  { key: "leaderboard", label: "Leaderboard" },
];

export function Dashboard({
  overview,
  lifetime,
  leaderboard,
  pets,
  onClose,
  initialTab = "overview",
}: {
  overview: StatsOverview | null | undefined;
  /** Complete never-reset totals (from the dailyStats rollup) — the Overview's accumulation figures. */
  lifetime: LifetimeTotals;
  leaderboard: LeaderboardData | null | undefined;
  pets?: PetStat[];
  onClose: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const loading = overview === undefined;

  return (
    <div className="dash">
      <div className="dash__bg" aria-hidden />
      <header className="dash__top">
        <nav className="dash__tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`dash__tab ${t.key === tab ? "dash__tab--on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button type="button" className="dash__close" onClick={onClose} title="Back to pets">
          ✕
        </button>
      </header>

      <div className="dash__body">
        {loading ? (
          <p className="dash__loading">Loading your stats…</p>
        ) : !overview ? (
          <p className="dash__loading">No stats yet — start a Claude Code session to begin.</p>
        ) : tab === "overview" ? (
          <Overview overview={overview} lifetime={lifetime} />
        ) : tab === "history" ? (
          <History overview={overview} />
        ) : tab === "pets" ? (
          <Pets pets={pets ?? []} />
        ) : (
          <Leaderboard data={leaderboard ?? { entries: [], you: null, utcDay: overview.utcDay }} />
        )}
      </div>
    </div>
  );
}
