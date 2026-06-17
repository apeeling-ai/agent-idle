/**
 * Mobile companion shell (iOS / Android via Tauri mobile).
 *
 * Unlike the desktop App.tsx this is NOT an ambient overlay — there is no frameless window to
 * size, no drag/resize grip, no click-through, and (critically) NO local sensor daemon: a phone
 * can't run Claude Code, so it never PRODUCES events. The companion is a read-of-truth viewer +
 * the (server-validated) gear shop. It subscribes to the same Convex state the desktop daemon
 * feeds and renders the same Pixi diorama, full-screen, with a bottom tab bar.
 *
 * Everything here is deliberately platform-API-free: the only difference from the web shell is
 * layout (full-screen + safe-area insets) and that auth uses the in-app Convex Auth flow with no
 * loopback token bridge.
 */

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  decay,
  equippedIds,
  equippedTints,
  playerShop,
  resolveEquipped,
  seasonNumber,
  type Entity,
  type Inventory,
  type Liveness,
} from "@agent-idle/engine";
import { api } from "../convex";
import { AuthPanel } from "../AuthPanel";
import { Dashboard } from "../dashboard/Dashboard";
import type { ShareStats } from "../dashboard/shareCard";
import { UsernameSetup, needsUsername } from "../dashboard/UsernameGate";
import { useFriends } from "../friends";
import { PlayerMenu } from "../menu/PlayerMenu";
import { PixiStage, type Creature } from "../PixiStage";
import { tintForSeed, type CreatureView } from "../render/compositor";
import "../theme.css";
import "./mobile.css";

/** The three full-screen tabs the companion can show. */
type Tab = "world" | "stats" | "shop";

interface Pet {
  entity: Entity;
  liveness: Liveness;
  stats: { tokensFed: number };
}

function petLabel(live: Liveness): string {
  if (live.activity === "active") return "working";
  return live.status === "lively" ? "idle" : live.status;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function MobileApp() {
  const { isAuthenticated } = useConvexAuth();

  const remote = useQuery(api.events.getPlayerState, isAuthenticated ? {} : "skip");
  const killPet = useMutation(api.events.killPet);
  const buyGear = useMutation(api.gear.buyGear);
  const setEquipped = useMutation(api.gear.setEquipped);

  const [tab, setTab] = useState<Tab>("world");
  const onStats = isAuthenticated && tab === "stats";

  const [muted, setMuted] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("agent-idle:muted") === "1",
  );
  const toggleMuted = () =>
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem("agent-idle:muted", next ? "1" : "0");
      } catch {
        /* private mode / storage unavailable — the in-memory toggle still works */
      }
      return next;
    });

  // Same subscriptions as desktop: overview is always-on (feeds the score chip + lifetime
  // totals); the heavier leaderboards only subscribe while the Stats tab is open.
  const overview = useQuery(api.stats.getStatsOverview, isAuthenticated ? {} : "skip");
  const leaderboard = useQuery(api.stats.getDailyLeaderboard, onStats ? {} : "skip");
  const seasonLeaderboard = useQuery(api.stats.getSeasonLeaderboard, onStats ? {} : "skip");
  const seasonHistory = useQuery(api.stats.getSeasonHistory, onStats ? {} : "skip");
  const decorations = useQuery(api.stats.getSeasonDecorations, isAuthenticated ? {} : "skip");
  const topPets = useQuery(api.stats.getTopPets, onStats ? {} : "skip");
  const friends = useFriends({ active: onStats });

  const lifetimeTotals = {
    tokensFed: overview?.lifetime?.tokensFed ?? remote?.stats?.tokensFed ?? 0,
    activeMs: overview?.lifetime?.activeMs ?? 0,
    promptCount: overview?.lifetime?.promptCount ?? remote?.stats?.promptCount ?? 0,
  };

  // Local clock so pets transition active → idle (and decay) between server pushes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!isAuthenticated) {
    return (
      <main className="mobile mobile--auth">
        <div className="mobile-auth-card">
          <h1 className="mobile-wordmark">Agent Idle</h1>
          <p className="mobile-tagline">Check on your menagerie.</p>
          <AuthPanel />
        </div>
      </main>
    );
  }

  // Mandatory onboarding: claim a username before the companion is usable.
  if (needsUsername(remote)) {
    return (
      <main className="mobile mobile--auth">
        <UsernameSetup />
      </main>
    );
  }

  const pets = (remote?.pets ?? []) as Pet[];
  const playerName = remote?.account?.username ?? remote?.account?.githubLogin ?? "you";
  const totalTokens = lifetimeTotals.tokensFed;

  const inventory = (remote?.account?.gear ?? { owned: {}, equipped: {} }) as Inventory;
  const shop = playerShop(totalTokens, inventory);
  const wornPieces = resolveEquipped(inventory);
  const equipped = equippedIds(wornPieces);
  const tints = equippedTints(wornPieces);
  const onBuy = (slot: string, expectedNext: number) => {
    void buyGear({ slot, expectedNext }).catch(() => {
      /* unaffordable / offline — the reactive state just stays put */
    });
  };
  const onEquip = (slot: string, rank: number | null) => {
    void setEquipped({ slot, rank }).catch(() => {
      /* rank not reached / offline — the reactive state just stays put */
    });
  };

  const playerView: CreatureView = {
    species: "knight",
    status: "lively",
    activity: "idle",
    alive: true,
    equipped,
    equippedTints: tints,
    isPlayer: true,
  };

  // The player's progress, distilled for the Friends-tab share card (mirrors desktop App.tsx).
  const shareStats: ShareStats = {
    handle: playerName,
    level: shop.level.level,
    seasonRank: overview?.seasonRank ?? null,
    dailyRank: overview?.dailyRank ?? null,
    seasonNumber: seasonNumber(overview?.season_index ?? 0),
    lifetimeTokens: totalTokens,
    streak: overview?.streak ?? 0,
    longestStreak: overview?.longestStreak ?? 0,
    daysActive: overview?.daysActive ?? 0,
    trophies: (seasonHistory ?? []).filter((s) => s.top.some((t) => t.isYou)).map((s) => s.reward.glyph),
    avatar: playerView,
  };

  const creatures: Creature[] = [
    {
      key: "player",
      view: playerView,
      name: playerName,
      badge: shop.level.level > 0 ? `Lv ${shop.level.level}` : undefined,
      sub: `🪙 ${formatTokens(totalTokens)}`,
      tokens: totalTokens,
    },
    ...pets.map((pet): Creature => {
      const live = decay(pet.entity, now);
      // No sessionMeta on mobile: the working-directory hint comes from the local daemon, which
      // only runs on the dev machine. Mobile shows the pet without the folder label.
      return {
        key: pet.entity.id,
        sessionId: pet.entity.sessionId,
        view: {
          species: pet.entity.species,
          status: live.status,
          activity: live.activity,
          waiting: live.waiting,
          action: live.action,
          failed: live.failed,
          alive: live.alive,
          equipped: [],
          tint: tintForSeed(pet.entity.id),
          seed: pet.entity.id,
        },
        name: pet.entity.name,
        sub: petLabel(live),
        tokens: pet.stats.tokensFed,
      };
    }),
  ];

  return (
    <main className="mobile">
      <header className="mobile-topbar">
        <div className="mobile-score">
          <span title="Today's tokens · your daily rank">
            🪙 <b>{formatTokens(overview?.today?.tokensFed ?? 0)}</b>
            {overview?.dailyRank ? <span className="mobile-rank">#{overview.dailyRank.rank}</span> : null}
          </span>
          <span title="This season's tokens · your season rank">
            🏅 <b>{formatTokens(overview?.season?.tokensFed ?? 0)}</b>
            {overview?.seasonRank ? <span className="mobile-rank">#{overview.seasonRank.rank}</span> : null}
          </span>
        </div>
        <button
          type="button"
          className="mobile-mute"
          onClick={toggleMuted}
          title={muted ? "Unmute sounds" : "Mute sounds"}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          aria-pressed={muted}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </header>

      <section className="mobile-body">
        {tab === "world" ? (
          <div className="mobile-stage">
            <PixiStage
              creatures={creatures}
              decorations={decorations ?? []}
              onOpenHome={() => setTab("shop")}
              onKillPet={async (sessionId) => {
                await killPet({ sessionId });
              }}
              muted={muted}
            />
          </div>
        ) : tab === "stats" ? (
          <Dashboard
            overview={overview}
            lifetime={lifetimeTotals}
            leaderboard={leaderboard}
            seasonLeaderboard={seasonLeaderboard}
            seasonHistory={seasonHistory}
            pets={topPets}
            friends={friends}
            share={shareStats}
            onClose={() => setTab("world")}
          />
        ) : (
          <PlayerMenu
            name={playerName}
            tokens={totalTokens}
            shop={shop}
            equipped={equipped}
            onBuy={onBuy}
            onEquip={onEquip}
            onClose={() => setTab("world")}
            onOpenStats={() => setTab("stats")}
          />
        )}
      </section>

      <nav className="mobile-tabs">
        <button
          type="button"
          className={tab === "world" ? "is-active" : ""}
          onClick={() => setTab("world")}
        >
          <span aria-hidden>🏡</span>
          <span>World</span>
        </button>
        <button
          type="button"
          className={tab === "stats" ? "is-active" : ""}
          onClick={() => setTab("stats")}
        >
          <span aria-hidden>📊</span>
          <span>Stats</span>
        </button>
        <button
          type="button"
          className={tab === "shop" ? "is-active" : ""}
          onClick={() => setTab("shop")}
        >
          <span aria-hidden>⚔️</span>
          <span>Gear</span>
        </button>
      </nav>
    </main>
  );
}
