/**
 * The signed-in browser experience. Same world data + renderer as the Tauri overlay, but framed
 * for a real tab: a solid page, a top bar with the score, and the diorama in a centred stage
 * card. Stats and the character sheet reuse the existing Dashboard / PlayerMenu unchanged — they
 * were always backend- and window-agnostic — shown here as full-page overlays.
 */

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { PixiStage, type HouseDecoration } from "../PixiStage";
import { Dashboard } from "../dashboard/Dashboard";
import { UsernameSetup } from "../dashboard/UsernameGate";
import { PlayerMenu } from "../menu/PlayerMenu";
import { useFriends } from "../friends";
import { useWorld, formatTokens } from "../world";
import type { LeaderboardData, PetStat, SeasonHistoryEntry, StatsOverview } from "../dashboard/types";

type View = "world" | "stats" | "menu";

export function WebShell({ cliLogin = false }: { cliLogin?: boolean }) {
  const { signOut } = useAuthActions();
  const [view, setView] = useState<View>("world");
  const [banner, setBanner] = useState(cliLogin);
  const world = useWorld({ inStats: view === "stats" });
  const friends = useFriends({ active: view === "stats" });

  // Mandatory onboarding: claim a username before the shell is usable.
  if (world.needsUsername) {
    return (
      <main className="shell">
        <UsernameSetup />
      </main>
    );
  }

  const ov = world.overview as StatsOverview | null | undefined;
  const today = ov?.today?.tokensFed ?? 0;
  const seasonTokens = ov?.season?.tokensFed ?? 0;
  const dailyRank = ov?.dailyRank ?? null;
  const seasonRank = ov?.seasonRank ?? null;
  const streak = ov?.streak ?? 0;

  return (
    <div className="shell">
      <header className="shell-bar">
        <span className="wordmark wordmark--sm">
          <span className="wordmark__glyph" aria-hidden>✥</span>
          <span className="wordmark__text">Agent&nbsp;Idle</span>
        </span>

        <button type="button" className="score-pill" onClick={() => setView("stats")} title="Open stats">
          <span className="score-pill__today" title="Today's tokens · your daily rank">
            🪙 <b>{formatTokens(today)}</b> today
            {dailyRank ? <span className="score-pill__rank">#{dailyRank.rank}</span> : null}
          </span>
          <span className="score-pill__today score-pill__season" title="This season's tokens · your season rank">
            🏅 <b>{formatTokens(seasonTokens)}</b> season
            {seasonRank ? <span className="score-pill__rank">#{seasonRank.rank}</span> : null}
          </span>
          {streak > 0 ? <span className="score-pill__streak">🔥 {streak}</span> : null}
        </button>

        <nav className="shell-nav">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setView("menu")}>
            Character
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setView("stats")}>
            Stats
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      </header>

      {banner ? (
        <div className="shell-banner" role="status">
          <span>✓ Machine connected. You can head back to your terminal — sessions will appear here.</span>
          <button type="button" aria-label="Dismiss" onClick={() => setBanner(false)}>✕</button>
        </div>
      ) : null}

      <main className="shell-main">
        <div className="shell-stage">
          <PixiStage
            creatures={world.creatures}
            decorations={(world.decorations as HouseDecoration[] | null | undefined) ?? []}
            onKillPet={world.killPet}
            muted
          />
        </div>
        <p className="shell-hint">
          {world.loading
            ? "Loading your world…"
            : world.petCount === 0
              ? "No active sessions yet — start one in Claude or Codex to spawn a mining pet."
              : `${world.petCount} ${world.petCount === 1 ? "session" : "sessions"} at work.`}
        </p>
      </main>

      {view === "stats" ? (
        <div className="shell-overlay">
          <Dashboard
            overview={world.overview as StatsOverview | null | undefined}
            lifetime={world.lifetime}
            leaderboard={world.leaderboard as LeaderboardData | null | undefined}
            seasonLeaderboard={world.seasonLeaderboard as LeaderboardData | null | undefined}
            seasonHistory={world.seasonHistory as SeasonHistoryEntry[] | null | undefined}
            pets={world.topPets as PetStat[] | undefined}
            friends={friends}
            onClose={() => setView("world")}
          />
        </div>
      ) : null}

      {view === "menu" ? (
        <div className="shell-overlay">
          <PlayerMenu
            name={world.playerName}
            tokens={world.totalTokens}
            shop={world.shop}
            equipped={world.equipped}
            onBuy={world.onBuy}
            onEquip={world.onEquip}
            onClose={() => setView("world")}
            onOpenStats={() => setView("stats")}
          />
        </div>
      ) : null}
    </div>
  );
}
