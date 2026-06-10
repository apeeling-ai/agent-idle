/**
 * The player's live world, as data — the Convex subscriptions + engine math that turn the
 * authoritative account state into the renderer's `Creature[]`, the progression, and the gear
 * loadout. App.tsx (the Tauri overlay) owns its own copy wired to native-window sizing; this
 * hook is the SAME derivation for the browser shell (web/WebShell.tsx), with no Tauri imports
 * so it stays platform-agnostic. The renderer/compositor is never forked — both shells feed the
 * one PixiStage.
 */

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  decay,
  equippedIds,
  equippedTints,
  playerShop,
  resolveEquipped,
  type Entity,
  type Inventory,
  type Liveness,
} from "@agent-idle/engine";
import { api } from "./convex";
import { tintForSeed, type CreatureView } from "./render/compositor";
import type { Creature } from "./PixiStage";

/** Where the local CLI sensor daemon listens — same shared port the Tauri app uses. Pushing the
 * token here completes `agent-idle login` when the browser and daemon are on one machine; it's a
 * harmless no-op (a failed fetch) when the web app is served from a remote deployment. */
const DAEMON_URL = "http://127.0.0.1:47615";

/** A single pet as returned by getPlayerState (raw snapshot + the server's liveness read). */
interface Pet {
  entity: Entity;
  liveness: Liveness;
  stats: { tokensFed: number };
}

/** Compact count, e.g. 1234 → "1.2k", 1.2e9 → "1.2B". Coins reach the billions, so the ramp runs
 * to T. Shared by every surface that shows the coin/token total. */
export function formatTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}

/** The short status word under a pet ("working" / "idle" / the decay rung). */
export function petLabel(live: Liveness): string {
  if (live.activity === "active") return "working";
  return live.status === "lively" ? "idle" : live.status;
}

function pushTokenToDaemon(token: string): void {
  void fetch(`${DAEMON_URL}/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => {
    /* daemon not running / remote deployment — fine */
  });
}

export interface World {
  /** Still resolving the first server read (distinct from "signed in but empty"). */
  loading: boolean;
  /** Player + every session pet, ready to hand to PixiStage. Player is always index 0. */
  creatures: Creature[];
  /** Number of live session pets (player excluded) — drives the empty-state hint. */
  petCount: number;
  playerName: string;
  /** Complete lifetime token total (from the dailyStats rollup, never drops dead sessions). */
  totalTokens: number;
  /** The gear shop/economy derived from lifetime tokens + the persisted inventory (wallet,
   * prestige level, per-slot owned/next/reached). */
  shop: ReturnType<typeof playerShop>;
  /** The resolved cosmetic ids actually worn (drives the avatar preview). */
  equipped: string[];
  overview: ReturnType<typeof useQuery>;
  leaderboard: ReturnType<typeof useQuery>;
  topPets: ReturnType<typeof useQuery>;
  lifetime: { tokensFed: number; activeMs: number; promptCount: number };
  /** Buy the next tier in a slot (expectedNext = the slot's current owned count). */
  onBuy: (slot: string, expectedNext: number) => void;
  /** Equip a reached rank (rank=null clears the override → auto-highest). */
  onEquip: (slot: string, rank: number | null) => void;
  killPet: (sessionId: string) => Promise<void>;
}

/**
 * Subscribe to the player's world. `inStats` gates the heavier dashboard queries (leaderboard +
 * top pets) so the ambient view stays cheap, exactly like the Tauri overlay. Everything returned
 * is identity-scoped and numeric — no prompt/code text ever crosses this boundary.
 */
export function useWorld({ inStats }: { inStats: boolean }): World {
  const { isAuthenticated } = useConvexAuth();
  const token = useAuthToken();

  const remote = useQuery(api.events.getPlayerState, isAuthenticated ? {} : "skip");
  const overview = useQuery(api.stats.getStatsOverview, isAuthenticated ? {} : "skip");
  const leaderboard = useQuery(api.stats.getDailyLeaderboard, isAuthenticated && inStats ? {} : "skip");
  const topPets = useQuery(api.stats.getTopPets, isAuthenticated && inStats ? {} : "skip");
  const killPetMutation = useMutation(api.events.killPet);
  const buyGearMutation = useMutation(api.gear.buyGear);
  const setEquippedMutation = useMutation(api.gear.setEquipped);

  // Hand the daemon our token (on change + heartbeat) so a same-machine `agent-idle login`
  // that opened this page completes, and a daemon that (re)starts re-learns the session.
  useEffect(() => {
    if (!token) return;
    pushTokenToDaemon(token);
    const id = setInterval(() => pushTokenToDaemon(token), 4_000);
    return () => clearInterval(id);
  }, [token]);

  // Local clock so pets transition active → idle (and decay) between server pushes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const pets = (remote?.pets ?? []) as Pet[];
  const playerName = remote?.account?.githubLogin ?? "you";

  const lifetime = {
    tokensFed: (overview as any)?.lifetime?.tokensFed ?? remote?.stats?.tokensFed ?? 0,
    activeMs: (overview as any)?.lifetime?.activeMs ?? 0,
    promptCount: (overview as any)?.lifetime?.promptCount ?? remote?.stats?.promptCount ?? 0,
  };
  const totalTokens = lifetime.tokensFed;

  const inventory = (remote?.account?.gear ?? { owned: {}, equipped: {} }) as Inventory;
  const shop = playerShop(totalTokens, inventory);
  const wornPieces = resolveEquipped(inventory);
  const equipped = equippedIds(wornPieces);

  const playerView: CreatureView = {
    species: "knight",
    status: "lively",
    activity: "idle",
    alive: true,
    equipped,
    equippedTints: equippedTints(wornPieces),
    isPlayer: true,
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
          // Pets show no per-pet cosmetics (that system was removed — gear is the account avatar's).
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

  return {
    loading: isAuthenticated && remote === undefined,
    creatures,
    petCount: pets.length,
    playerName,
    totalTokens,
    shop,
    equipped,
    overview,
    leaderboard,
    topPets,
    lifetime,
    onBuy: (slot, expectedNext) => {
      void buyGearMutation({ slot, expectedNext }).catch(() => {
        /* unaffordable / offline — reactive state stays put */
      });
    },
    onEquip: (slot, rank) => {
      void setEquippedMutation({ slot, rank }).catch(() => {
        /* rank not reached / offline — reactive state stays put */
      });
    },
    killPet: async (sessionId) => {
      await killPetMutation({ sessionId });
    },
  };
}
