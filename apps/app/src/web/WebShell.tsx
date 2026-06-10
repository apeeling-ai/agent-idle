/**
 * The signed-in browser experience. Same world data + renderer as the Tauri overlay, but framed
 * for a real tab: a solid page, a top bar with the score, and the diorama in a centred stage
 * card. Stats and the character sheet reuse the existing Dashboard / PlayerMenu unchanged — they
 * were always backend- and window-agnostic — shown here as full-page overlays.
 */

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { PixiStage } from "../PixiStage";
import { Dashboard } from "../dashboard/Dashboard";
import { PlayerMenu } from "../menu/PlayerMenu";
import { useWorld, formatTokens } from "../world";
import type { LeaderboardData, PetStat, StatsOverview } from "../dashboard/types";

type View = "world" | "stats" | "menu";

export function WebShell({ cliLogin = false }: { cliLogin?: boolean }) {
  const { signOut } = useAuthActions();
  const [view, setView] = useState<View>("world");
  const [banner, setBanner] = useState(cliLogin);
  const world = useWorld({ inStats: view === "stats" });

  const today = (world.overview as StatsOverview | null | undefined)?.today?.tokensFed ?? 0;
  const streak = (world.overview as StatsOverview | null | undefined)?.streak ?? 0;

  return (
    <div className="shell">
      <header className="shell-bar">
        <span className="wordmark wordmark--sm">
          <span className="wordmark__glyph" aria-hidden>✥</span>
          <span className="wordmark__text">Agent&nbsp;Idle</span>
        </span>

        <button type="button" className="score-pill" onClick={() => setView("stats")} title="Open stats">
          <span className="score-pill__coin">🪙 {formatTokens(world.totalTokens)}</span>
          <span className="score-pill__today"><b>{formatTokens(today)}</b> today</span>
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
          <PixiStage creatures={world.creatures} onKillPet={world.killPet} muted />
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
            pets={world.topPets as PetStat[] | undefined}
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
