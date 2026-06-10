import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { getCurrentWindow, currentMonitor, type Window } from "@tauri-apps/api/window";
import { PhysicalPosition, LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
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
import { AuthPanel } from "./AuthPanel";
import { Dashboard } from "./dashboard/Dashboard";
import { PlayerMenu } from "./menu/PlayerMenu";
import { PixiStage, type Creature } from "./PixiStage";
import { tintForSeed, type CreatureView } from "./render/compositor";
import { WORLD_AREA } from "./render/layout";
import "./theme.css";
import "./App.css";

/** The three views the frameless window can show. */
type Mode = "ambient" | "stats" | "menu";

/** Extra height for the drag handle + gaps in the ambient (diorama) window. */
const CHROME = 40;
/** The window grows to this (logical px) when expanded into the stats dashboard; clamped to
 * the monitor on smaller screens (the dashboard body scrolls if it still overflows). */
const DASH_AREA = { width: 760, height: 700 } as const;
/** The player menu (character sheet) is a narrower panel than the full dashboard. */
const MENU_AREA = { width: 420, height: 560 } as const;
/** Keep the frameless dashboard window this far inside the monitor edges when clamped. */
const DASH_SCREEN_MARGIN = 40;

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** A logical (DPI-independent) window size. */
interface WinSize {
  width: number;
  height: number;
}

/** Read the window's current OUTER size in logical px (the unit setSize/LogicalSize uses). */
async function currentLogicalSize(win: Window): Promise<WinSize> {
  const sf = await win.scaleFactor();
  const s = await win.outerSize(); // physical px
  return { width: s.width / sf, height: s.height / sf };
}

/**
 * Resize the frameless window for the current view: the diorama (ambient — the whole menagerie
 * packs into ONE bounded, now freely-resizable world, see render/layout.ts) or the expanded
 * stats dashboard. The diorama scales responsively to whatever size the user drags it to, so
 * ambient restores the user's last size (`savedAmbient`) rather than snapping back to default.
 * When expanding, clamp the size + position to the monitor so the bigger window never spills
 * off-screen. No-op in the dev browser.
 */
async function applyWindowMode(mode: Mode, savedAmbient: WinSize | null): Promise<void> {
  if (!hasTauri()) return;
  const win = getCurrentWindow();
  if (mode === "ambient") {
    const w = savedAmbient?.width ?? WORLD_AREA.width;
    const h = savedAmbient?.height ?? WORLD_AREA.height + CHROME;
    await win.setSize(new LogicalSize(w, h));
    return;
  }
  // The stats dashboard and the (narrower) player menu both grow the frameless window.
  const area = mode === "menu" ? MENU_AREA : DASH_AREA;
  try {
    const mon = await currentMonitor();
    if (!mon) {
      await win.setSize(new LogicalSize(area.width, area.height));
      return;
    }
    const sf = await win.scaleFactor();
    const monW = mon.size.width / sf;
    const monH = mon.size.height / sf;
    const monX = mon.position.x / sf;
    const monY = mon.position.y / sf;
    // Never grow past the monitor (minus a margin): on a small screen the panel shrinks
    // to fit and its body scrolls, instead of spilling the frameless window off the edge.
    const width = Math.min(area.width, monW - DASH_SCREEN_MARGIN);
    const height = Math.min(area.height, monH - DASH_SCREEN_MARGIN);
    await win.setSize(new LogicalSize(width, height));
    const pos = await win.outerPosition(); // physical px
    const x = Math.min(Math.max(pos.x / sf, monX), monX + monW - width);
    const y = Math.min(Math.max(pos.y / sf, monY), monY + monH - height);
    await win.setPosition(new LogicalPosition(x, y));
  } catch {
    /* monitor query unavailable — fall back to the unclamped panel size */
    await win.setSize(new LogicalSize(area.width, area.height));
  }
}

/**
 * Make the native window click-through (mouse events pass to the desktop behind it) so
 * the pets are a true ambient overlay. No-op outside Tauri (e.g. the dev browser). We
 * keep it interactive while signed out so the sign-in panel is clickable, and turn
 * click-through ON once authenticated (the ambient pet view needs no clicks).
 */
function setClickThrough(ignore: boolean): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void getCurrentWindow().setIgnoreCursorEvents(ignore).catch(() => {});
}

/**
 * Small visible grab handle to reposition the ambient window. Tauri's startDragging()
 * begins a native window move on press — reliable on the transparent/frameless macOS
 * window, and (unlike data-tauri-drag-region) it never maximizes on double-click. No-op
 * in the dev browser.
 */
function DragHandle() {
  return (
    <button
      type="button"
      className="drag-handle"
      title="Drag to move Agent Idle"
      onMouseDown={(e) => {
        if (e.button !== 0) return; // left button only
        if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
        void getCurrentWindow().startDragging().catch(() => {});
      }}
    >
      <span aria-hidden>✥</span> AI
    </button>
  );
}

/**
 * Bottom-right resize grip for the frameless window. A borderless/decoration-less window has no
 * native edge handles, so we drive a native resize from this grip via startResizeDragging.
 * No-op in the dev browser.
 */
function ResizeGrip() {
  return (
    <div
      className="resize-grip"
      title="Drag to resize Agent Idle"
      aria-hidden
      onMouseDown={(e) => {
        if (e.button !== 0) return; // left button only
        if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
        e.preventDefault();
        // Tauri 2.11 dropped the ResizeDirection enum export — the param is now a string union.
        void getCurrentWindow().startResizeDragging("SouthEast").catch(() => {});
      }}
    />
  );
}

// Where the local CLI sensor daemon listens. Auth is a single machine-shared session:
// the app pushes its Convex Auth token here → the shared store (~/.agent-idle/auth.json)
// that the daemon and CLI also use, so the headless daemon posts as the SAME user.
// Fire-and-forget; the daemon may not be running.
const DAEMON_URL = "http://127.0.0.1:47615";

function pushTokenToDaemon(token: string): void {
  void fetch(`${DAEMON_URL}/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => {
    /* daemon not running — fine */
  });
}

/** A single pet as returned by getPlayerState (raw snapshot + the server's liveness read). */
interface Pet {
  entity: Entity;
  liveness: Liveness;
  stats: { tokensFed: number };
}

function petLabel(live: Liveness): string {
  if (live.activity === "active") return "working";
  // Resting + healthy reads "idle"; weaker rungs surface the decay (weary/drained/…).
  return live.status === "lively" ? "idle" : live.status;
}

/** Compact token count, e.g. 1234 → "1.2k". */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export default function App() {
  const { isAuthenticated } = useConvexAuth();
  const token = useAuthToken();

  // Identity-scoped: no args. Returns null when unauthenticated or not yet created.
  const remote = useQuery(api.events.getPlayerState, isAuthenticated ? {} : "skip");
  const killPet = useMutation(api.events.killPet);
  const buyGear = useMutation(api.gear.buyGear);
  const setEquipped = useMutation(api.gear.setEquipped);

  // Ambient diorama, the player menu (clicking the house), or the expanded stats dashboard.
  const [mode, setMode] = useState<Mode>("ambient");
  const inStats = isAuthenticated && mode === "stats";

  // Sound on/off, persisted so the choice survives a window restart. Passed to PixiStage,
  // which owns the SoundPlayer (the only thing that touches Web Audio).
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

  // The overview (lifetime totals, streaks, records + the per-day series) also feeds the
  // always-visible score chip, so it subscribes whenever signed in. It recomputes per TURN,
  // not per second, so nothing churns at rest. The leaderboard only subscribes while the
  // dashboard is open, so the ambient diorama stays cheap. All identity-scoped, numeric-only.
  const overview = useQuery(api.stats.getStatsOverview, isAuthenticated ? {} : "skip");
  const leaderboard = useQuery(api.stats.getDailyLeaderboard, inStats ? {} : "skip");
  const topPets = useQuery(api.stats.getTopPets, inStats ? {} : "skip");
  // Complete lifetime accumulation from the dailyStats rollup. It's keyed per-account-per-day,
  // so it never loses despawned ("gone") pets the way getPlayerState's live aggregate does —
  // that filter is why the coin/menu read LOW (it dropped dead sessions' tokens). The rollup is
  // backfilled from the append-only eventLedger, so it equals the true lifetime. Fall back to
  // the live aggregate only until the overview query resolves.
  const lifetimeTotals = {
    tokensFed: overview?.lifetime?.tokensFed ?? remote?.stats?.tokensFed ?? 0,
    activeMs: overview?.lifetime?.activeMs ?? 0,
    promptCount: overview?.lifetime?.promptCount ?? remote?.stats?.promptCount ?? 0,
  };

  // Keep the window interactive so the drag handle (and pets) stay grabbable. Full-window
  // click-through is disabled now that we have on-window controls to click. (No-op in the
  // dev browser.)
  useEffect(() => {
    setClickThrough(false);
  }, []);

  // Move the whole window with the arrow keys (Shift = bigger steps) — a reliable
  // alternative to dragging the handle. Click the window once so it has focus, then press
  // an arrow. No-op in the dev browser.
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 60 : 15;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      const win = getCurrentWindow();
      void win.outerPosition().then((p) => win.setPosition(new PhysicalPosition(p.x + dx, p.y + dy)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hand the daemon our authenticated token — on change AND on a heartbeat. The daemon
  // may (re)start after we signed in (e.g. `pnpm dev` restart), and it only learns the
  // token by us pushing it, so a periodic re-push guarantees it lands within a few sec.
  useEffect(() => {
    if (!token) return;
    pushTokenToDaemon(token);
    const id = setInterval(() => pushTokenToDaemon(token), 4_000);
    return () => clearInterval(id);
  }, [token]);

  // LOCAL per-session display hints (working folder) read from the daemon's
  // loopback endpoint. This data never goes through the server (privacy) — it's on-machine
  // only. Polled so a newly-started session's folder appears within a few seconds.
  const [sessionMeta, setSessionMeta] = useState<Record<string, { repo: string; terminal?: string }>>({});
  useEffect(() => {
    let alive = true;
    const fetchMeta = () =>
      fetch(`${DAEMON_URL}/sessions`)
        .then((r) => r.json())
        .then((m) => alive && setSessionMeta(m as Record<string, { repo: string; terminal?: string }>))
        .catch(() => {});
    fetchMeta();
    const id = setInterval(fetchMeta, 4_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Local clock so pets transition active → idle (and decay) between server pushes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Size the frameless window to the current view: the (resizable) diorama (ambient) or the
  // grown stats dashboard. Re-runs on sign-in AND every mode toggle. The diorama is now freely
  // resizable, so when LEAVING ambient we remember the user's size and restore it on return,
  // instead of snapping back to the default. No-op in the dev browser.
  // Derived before the unauthenticated early-return so the hook order stays stable.
  const ambientSizeRef = useRef<WinSize | null>(null);
  const prevModeRef = useRef<Mode>(mode);
  useEffect(() => {
    if (!isAuthenticated) return; // sign-in panel: leave the default window size
    let cancelled = false;
    void (async () => {
      // Capture the user's current (resized) ambient size right before expanding into a panel.
      if (hasTauri() && mode !== "ambient" && prevModeRef.current === "ambient") {
        try {
          ambientSizeRef.current = await currentLogicalSize(getCurrentWindow());
        } catch {
          /* size query unavailable — fall back to the default ambient size on return */
        }
      }
      if (cancelled) return;
      await applyWindowMode(mode, ambientSizeRef.current);
      prevModeRef.current = mode;
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, mode]);

  if (!isAuthenticated) {
    return (
      <main className="ambient">
        <DragHandle />
        <div className="hud">
          <AuthPanel />
        </div>
      </main>
    );
  }

  const pets = (remote?.pets ?? []) as Pet[];
  const playerName = remote?.account?.githubLogin ?? "you";
  const totalTokens = lifetimeTotals.tokensFed; // complete lifetime (rollup) — never drops dead sessions

  // Gear economy: lifetime tokens MINT coins; the persisted inventory (owned tiers + worn-rank
  // overrides) is spent down. Pure engine math (same on server/CLI/app) derives the shop view,
  // the worn pieces, and their prestige recolours. The shop's level badge rides on the player's
  // label; `equipped`/`tints` drive both the diorama avatar and the character-sheet preview.
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

  // The player is always in view (idle); pets spawn beside it per Claude session and
  // re-decay locally each tick so a working pet mines, then settles to idle.
  const playerView: CreatureView = {
    species: "knight", // the armoured "cool guy" body the player is rendered as
    status: "lively",
    activity: "idle",
    alive: true,
    equipped, // the worn pieces (override or auto-highest) — armor/helm/weapon/aura
    equippedTints: tints, // per-piece prestige recolour
    isPlayer: true, // render the armoured species body (pets render the little worker body)
  };

  const creatures: Creature[] = [
    // Player carries the running token total; coins fly to it from each pet that earns.
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
      // Local working-directory hint for this session (from the daemon; "" if not yet known).
      const meta = sessionMeta[pet.entity.sessionId];
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
          // Pets show no per-pet cosmetics (that system was removed — player gear is account
          // loadout); the compositor still slots `equipped` for the player avatar.
          equipped: [],
          tint: tintForSeed(pet.entity.id),
          seed: pet.entity.id,
        },
        name: pet.entity.name,
        sub: petLabel(live),
        directoryName: meta?.repo || undefined,
        tokens: pet.stats.tokensFed,
      };
    }),
  ];

  // Player menu (character sheet): the prestige level + gear slots, opened by clicking the cabin.
  if (mode === "menu") {
    return (
      <main className="ambient ambient--stats">
        <PlayerMenu
          name={playerName}
          tokens={totalTokens}
          shop={shop}
          equipped={equipped}
          onBuy={onBuy}
          onEquip={onEquip}
          onClose={() => setMode("ambient")}
          onOpenStats={() => setMode("stats")}
        />
      </main>
    );
  }

  // Expanded stats: the window has grown into the full dashboard (from the menu or the chip).
  if (mode === "stats") {
    return (
      <main className="ambient ambient--stats">
        <Dashboard
          overview={overview}
          lifetime={lifetimeTotals}
          leaderboard={leaderboard}
          pets={topPets}
          onClose={() => setMode("ambient")}
        />
      </main>
    );
  }

  return (
    <main className="ambient">
      {/* Top bar: the AI drag handle with the token chip to its right. Tokens only — total
          (lifetime) and today's — plus the streak; clicking it opens the dashboard. */}
      <div className="topbar">
        <DragHandle />
        <button type="button" className="score-chip" onClick={() => setMode("stats")} title="Open stats">
          <span className="score-chip__tokens" title="Total tokens fed">🪙 {formatTokens(totalTokens)}</span>
          <span className="score-chip__stat">
            <b>{formatTokens(overview?.today?.tokensFed ?? 0)}</b> today
          </span>
          {overview && overview.streak > 0 ? (
            <span className="score-chip__streak">🔥 {overview.streak}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="mute-btn"
          onClick={toggleMuted}
          title={muted ? "Unmute sounds" : "Mute sounds"}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          aria-pressed={muted}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      {/* Clicking the cabin (the player's home) opens the player menu (character sheet). */}
      <PixiStage
        creatures={creatures}
        onOpenHome={() => setMode("menu")}
        onKillPet={async (sessionId) => {
          await killPet({ sessionId });
        }}
        muted={muted}
      />
      {pets.length === 0 ? (
        <p className="hint">No active sessions — start one in Claude Code to spawn a mining pet.</p>
      ) : null}
      <ResizeGrip />
    </main>
  );
}
