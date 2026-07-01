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
  seasonNumber,
  type Entity,
  type Inventory,
  type Liveness,
  type PetAction,
} from "@agent-idle/engine";
import { api } from "./convex";
import { AuthPanel } from "./AuthPanel";
import { Dashboard } from "./dashboard/Dashboard";
import type { ShareStats } from "./dashboard/shareCard";
import type { StatsOverview } from "./dashboard/types";
import { UsernameSetup, needsUsername } from "./dashboard/UsernameGate";
import { isWindowsDesktop } from "./platform";
import { useFriends } from "./friends";
import { PlayerMenu } from "./menu/PlayerMenu";
import { PixiStage, type Creature } from "./PixiStage";
import { tintForSeed, type CreatureView } from "./render/compositor";
import { WORLD_AREA } from "./render/layout";
import "./theme.css";
import "./App.css";

/** The views the frameless window can show. "collapsed" is the peek bar — the window shrunk to
 * just the top control strip (the diorama hidden), one click away from folding back to ambient. */
type Mode = "ambient" | "stats" | "menu" | "collapsed";

/** Extra height for the drag handle + gaps in the ambient (diorama) window. */
const CHROME = 40;
/** The ambient window's LOCKED height (logical px) for a given width: the world drawn at its own
 * aspect ratio, plus the fixed CHROME header. The resize is constrained to this so the window only
 * scales PROPORTIONALLY (like holding a constrain key in a design tool) — it can't be stretched. */
const ambientHeightFor = (width: number): number =>
  Math.round(width * (WORLD_AREA.height / WORLD_AREA.width)) + CHROME;
/** Default ambient window size (logical px), sized to fit a small side monitor: the tall
 * 480×450 world at a 0.7 fit (336×315) + CHROME. Resizable but aspect-LOCKED (ambientHeightFor),
 * so it stays proportional; the stage auto-fits the world to whatever size it's dragged to. */
const AMBIENT_DEFAULT = {
  width: WORLD_AREA.width * 0.7,
  height: ambientHeightFor(WORLD_AREA.width * 0.7),
} as const;
/** The window grows to this (logical px) when expanded into the stats dashboard; clamped to
 * the monitor on smaller screens (the dashboard body scrolls if it still overflows). */
const DASH_AREA = { width: 760, height: 700 } as const;
/** The player menu (character sheet) is a narrower panel than the full dashboard. */
const MENU_AREA = { width: 420, height: 560 } as const;
/** Collapsed (peek) window height (logical px): just the top control strip. Below tauri.conf's
 * old 240 minHeight, so that floor was lowered to let setSize shrink this far. */
const COLLAPSED_HEIGHT = 34;
/** How close (px) the full score bar may get to the window edge before it drops to the compact
 * rotating single stat. A margin (not 0) so the swap happens BEFORE the controls look crammed. */
const BREATHING = 18;
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

interface HelperLive {
  agentId: string;
  agentType: string;
  action: PetAction;
  startedAt: number;
  finishedAt?: number;
  tokens?: number;
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
async function applyWindowMode(
  mode: Mode,
  savedAmbient: WinSize | null,
  savedPos: { x: number; y: number } | null,
): Promise<void> {
  if (!hasTauri()) return;
  const win = getCurrentWindow();
  if (mode === "ambient") {
    const w = savedAmbient?.width ?? AMBIENT_DEFAULT.width;
    const h = savedAmbient?.height ?? AMBIENT_DEFAULT.height;
    await win.setSize(new LogicalSize(w, h));
    // Restore the exact position captured when we left ambient. Expanding into a panel can MOVE
    // the window — when it's near a screen edge we clamp the larger panel inside the monitor
    // (below) — so without restoring it here the smaller ambient window would stay at that
    // shifted spot and appear to "jump" every time you open then close Settings/Scoreboard.
    if (savedPos) await win.setPosition(new PhysicalPosition(savedPos.x, savedPos.y));
    return;
  }
  if (mode === "collapsed") {
    // Peek bar: keep the current ambient width (the strip keeps its layout, re-expand is seamless)
    // and shrink to the control strip. Top-left stays put.
    const w = savedAmbient?.width ?? AMBIENT_DEFAULT.width;
    await win.setSize(new LogicalSize(w, COLLAPSED_HEIGHT));
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
 * Hide the window fully by native-minimizing it.
 *  - macOS: it drops to the Dock; clicking the Dock thumbnail restores it (no taskbar exists —
 *    `skipTaskbar` is on).
 *  - Windows: there's no Dock, and this frameless window is `skipTaskbar`, so a plain minimize
 *    would strand it with no way back. We re-show its taskbar button (the only restore
 *    affordance) just for the minimized stretch, then hide it again the moment the window is
 *    restored (regains focus) — keeping the ambient, taskbar-free look during normal use.
 * The window comes back in whatever mode it left in. No-op in the dev browser.
 */
async function minimizeWindow(): Promise<void> {
  if (!hasTauri()) return;
  const win = getCurrentWindow();
  try {
    if (isWindowsDesktop()) {
      await win.setSkipTaskbar(false);
      const unlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (!focused) return; // ignore the blur that minimizing itself fires
        void win.setSkipTaskbar(true).catch(() => {});
        unlisten();
      });
    }
    await win.minimize();
  } catch {
    /* window API unavailable — ignore */
  }
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

/** Smallest ambient width we let the grip drag to (matches tauri.conf `minWidth`). */
const MIN_AMBIENT_WIDTH = 260;

/**
 * Bottom-right resize grip for the frameless window. A borderless/decoration-less window has no
 * native edge handles.
 *
 * We deliberately do NOT use Tauri's startResizeDragging here: on a transparent macOS window that
 * spins a nested native mouse-tracking loop which starves the webview compositor, so the content
 * tears/freezes while the frame resizes (the "glitchy" resize). Instead we drive the resize from
 * pointer events on the normal runloop — the webview keeps repainting between frames — and set the
 * size ourselves at animation-frame cadence with the height aspect-LOCKED at the source (no
 * fighting an after-the-fact corrective setSize, no end-of-drag snap). No-op in the dev browser.
 */
function ResizeGrip() {
  return (
    <div
      className="resize-grip"
      title="Drag to resize Agent Idle"
      aria-hidden
      onPointerDown={(e) => {
        if (e.button !== 0) return; // left button only
        if (!hasTauri()) return;
        e.preventDefault();
        const win = getCurrentWindow();
        const grip = e.currentTarget;
        grip.setPointerCapture(e.pointerId);
        // screenX/screenY are logical (CSS) px on macOS — the same unit LogicalSize uses — so the
        // window tracks the cursor 1:1. Width is the master dimension; height follows from aspect.
        const startX = e.screenX;
        const startY = e.screenY;
        const aspect = WORLD_AREA.width / WORLD_AREA.height;
        let startW = AMBIENT_DEFAULT.width;
        let ready = false; // ignore moves until the real starting width is known
        void currentLogicalSize(win)
          .then((s) => {
            startW = s.width;
            ready = true;
          })
          .catch(() => {
            ready = true;
          });
        let targetW = startW;
        let raf = 0;
        const apply = () => {
          raf = 0;
          void win.setSize(new LogicalSize(targetW, ambientHeightFor(targetW))).catch(() => {});
        };
        const move = (ev: PointerEvent) => {
          if (!ready) return;
          // Either axis can grow the window (down-drag counts as a proportional right-drag), so the
          // SE corner feels like it follows the cursor even though height is locked to width.
          const delta = Math.max(ev.screenX - startX, (ev.screenY - startY) * aspect);
          targetW = Math.max(MIN_AMBIENT_WIDTH, Math.round(startW + delta));
          if (!raf) raf = requestAnimationFrame(apply); // coalesce to one setSize per frame
        };
        const up = () => {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          grip.removeEventListener("pointercancel", up);
          if (raf) {
            cancelAnimationFrame(raf);
            apply(); // flush the final size
          }
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
        grip.addEventListener("pointercancel", up);
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

/**
 * The always-visible score: today's and this season's tokens, each with the player's live
 * leaderboard rank. Shared by the full ambient bar (click → stats dashboard) and the collapsed
 * peek bar (click → fold back out), so the two strips never drift apart.
 */
function ScoreChip({
  overview,
  onClick,
  title,
  compact = false,
  phase = 0,
}: {
  overview: StatsOverview | null | undefined;
  onClick: () => void;
  title: string;
  /** Narrow window: show ONE stat (chosen by `phase`) instead of both, side by side. */
  compact?: boolean;
  /** Which stat the compact bar shows — 0 = today, 1 = season. Flips every 30s upstream. */
  phase?: 0 | 1;
}) {
  // In compact mode the word ("today"/"season") is dropped — the emoji already tells them apart,
  // and the shorter form keeps even a "999.9M #12" stat inside the 260px-min window without
  // clipping the controls.
  const Stat = ({ icon, n, word, rank, hint }: { icon: string; n: number; word: string; rank?: number; hint: string }) => (
    <span className="score-chip__stat" title={hint}>
      {icon} <b>{formatTokens(n)}</b>
      {compact ? null : ` ${word}`}
      {rank != null ? <span className="score-chip__rank"> #{rank}</span> : null}
    </span>
  );
  const today = (
    <Stat icon="🪙" n={overview?.today?.tokensFed ?? 0} word="today" rank={overview?.dailyRank?.rank} hint="Today's tokens · your daily rank" />
  );
  const season = (
    <Stat icon="🏅" n={overview?.season?.tokensFed ?? 0} word="season" rank={overview?.seasonRank?.rank} hint="This season's tokens · your season rank" />
  );
  return (
    <button type="button" className="score-chip" onClick={onClick} title={title}>
      {compact ? (phase === 0 ? today : season) : (
        <>
          {today}
          {season}
        </>
      )}
    </button>
  );
}

/** One icon button in the top bar's right control cluster (mute / collapse / hide). */
function BarButton({
  glyph,
  label,
  onClick,
  pressed,
}: {
  glyph: string;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="bar-btn"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
    >
      {glyph}
    </button>
  );
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

  // The ⤓ minimize control is identical on every platform; only its tooltip differs, since the
  // window lands in the Dock on macOS and the taskbar on Windows.
  const hideLabel = isWindowsDesktop() ? "Minimize to taskbar" : "Hide to Dock";

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
  const seasonLeaderboard = useQuery(api.stats.getSeasonLeaderboard, inStats ? {} : "skip");
  const seasonHistory = useQuery(api.stats.getSeasonHistory, inStats ? {} : "skip");
  // Earned season trophies for the cabin. Cheap + always-on (bounded by seasons played) so the
  // diorama can show them in ambient mode without opening the dashboard.
  const decorations = useQuery(api.stats.getSeasonDecorations, isAuthenticated ? {} : "skip");
  const topPets = useQuery(api.stats.getTopPets, inStats ? {} : "skip");
  // Friends data + mutations, gated to when the dashboard is open (the Friends tab + the
  // leaderboard's Friends filter both live there).
  const friends = useFriends({ active: inStats });
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
  const [subagents, setSubagents] = useState<Record<string, HelperLive[]>>({});
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
  useEffect(() => {
    let alive = true;
    const fetchSubagents = () =>
      fetch(`${DAEMON_URL}/subagents`)
        .then((r) => r.json())
        .then((m) => alive && setSubagents(m as Record<string, HelperLive[]>))
        .catch(() => {});
    fetchSubagents();
    const id = setInterval(fetchSubagents, 1_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Local clock so pets transition active → idle (and decay) between server pushes — corrected to
  // SERVER time. getPlayerState returns its own Date.now() as `updatedAt`; the gap to ours is this
  // machine's clock skew (we hit an 8-minute one), so we decay with `now + clockOffset` ≈ server
  // time. Without this, a misset local clock makes every pet render idle/dead even while working.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const [clockOffset, setClockOffset] = useState(0);
  useEffect(() => {
    if (remote?.updatedAt != null) setClockOffset(remote.updatedAt - Date.now());
  }, [remote?.updatedAt]);
  const serverNow = now + clockOffset;

  // Compact-score fit detection. When the user drags the ambient window narrow enough that the
  // full score (BOTH today AND season) no longer fits the bar, we fall back to showing ONE stat
  // at a time (it then rotates every 30s — see `scorePhase` below). We measure the REAL fit — the
  // bar's natural content width vs the window's inner width — rather than guessing a pixel
  // breakpoint, because the token text width varies wildly ("0" vs "93.9M") and this is a freely
  // resizable app window, not a fixed-width page. `ambientRef`/`topbarRef` are attached only on the
  // ambient + peek bars; in other modes the effect no-ops (refs null).
  const ambientRef = useRef<HTMLElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);
  const [compactScore, setCompactScore] = useState(false);
  // The full bar's natural width, remembered while expanded so we know when there's room to expand
  // back (we can't measure the full width while we're only rendering one stat).
  const fullBarWidthRef = useRef(0);
  useEffect(() => {
    const root = ambientRef.current;
    if (!root) return;
    const evaluate = () => {
      const r = ambientRef.current;
      const bar = topbarRef.current;
      if (!r || !bar) return;
      const available = r.clientWidth; // the window's inner width, in CSS px
      setCompactScore((prev) => {
        if (!prev) {
          // Expanded: the bar's children don't shrink (flex-shrink:0 in CSS), so `scrollWidth` is
          // the full bar's TRUE natural width. We switch to compact once it gets within BREATHING px
          // of the window edge — BEFORE the controls would get crammed/overlapped, not after.
          const needed = bar.scrollWidth;
          if (needed > available - BREATHING) {
            fullBarWidthRef.current = needed; // remember the natural full width
            return true;
          }
          return false;
        }
        // Compact: re-expand only once the full bar fits again with the same breathing room (plus a
        // little extra slack so it can't flap back and forth at the exact boundary).
        return available < fullBarWidthRef.current + BREATHING + 8;
      });
    };
    const ro = new ResizeObserver(evaluate);
    ro.observe(root);
    evaluate();
    return () => ro.disconnect();
    // Re-measure when the mode changes (the bar attaches/detaches) or the displayed numbers (hence
    // the text width) change.
  }, [
    mode,
    overview?.today?.tokensFed,
    overview?.season?.tokensFed,
    overview?.dailyRank?.rank,
    overview?.seasonRank?.rank,
  ]);
  // Which single stat the compact bar shows: flips every 30s off the local clock (no extra timer —
  // `now` already ticks each second), so both today and season stay trackable on a narrow window.
  const scorePhase = (Math.floor(now / 30_000) % 2) as 0 | 1;

  // Size the frameless window to the current view: the (resizable) diorama (ambient) or the
  // grown stats dashboard. Re-runs on sign-in AND every mode toggle. The diorama is now freely
  // resizable, so when LEAVING ambient we remember the user's size and restore it on return,
  // instead of snapping back to the default. No-op in the dev browser.
  // Derived before the unauthenticated early-return so the hook order stays stable.
  const ambientSizeRef = useRef<WinSize | null>(null);
  const ambientPosRef = useRef<{ x: number; y: number } | null>(null);
  const prevModeRef = useRef<Mode>(mode);
  useEffect(() => {
    if (!isAuthenticated) return; // sign-in panel: leave the default window size
    let cancelled = false;
    void (async () => {
      // Capture the user's current ambient size AND position right before expanding into a panel,
      // so returning to ambient restores both (the panel resize can shift the window near an edge).
      if (hasTauri() && mode !== "ambient" && prevModeRef.current === "ambient") {
        try {
          const win = getCurrentWindow();
          ambientSizeRef.current = await currentLogicalSize(win);
          const p = await win.outerPosition(); // physical px — restored verbatim on return
          ambientPosRef.current = { x: p.x, y: p.y };
        } catch {
          /* size/position query unavailable — fall back to default size, no reposition on return */
        }
      }
      if (cancelled) return;
      await applyWindowMode(mode, ambientSizeRef.current, ambientPosRef.current);
      prevModeRef.current = mode;
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, mode]);

  // Aspect-LOCK the ambient window: snap the height back to ambientHeightFor(width) so the grip
  // scales it proportionally instead of stretching it. Only in ambient mode (the dashboard/menu
  // drive their own sizes). Crucially this snaps only AFTER the drag settles, not on every resize
  // event: calling setSize mid-drag fights the live native startResizeDragging loop (the cursor and
  // our correction tug against each other → jitter). So we debounce — let the native resize run
  // free, then snap once movement pauses. A guard ignores the onResized our own snap echoes back.
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  useEffect(() => {
    if (!hasTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let snapTimer: ReturnType<typeof setTimeout> | undefined;
    let settling = false; // ignore the onResized echoed by our own corrective setSize
    const snap = async () => {
      if (modeRef.current !== "ambient") return;
      try {
        const sf = await win.scaleFactor();
        const s = await win.outerSize(); // physical px — read fresh at settle time
        const w = Math.round(s.width / sf);
        const h = Math.round(s.height / sf);
        const targetH = ambientHeightFor(w);
        if (Math.abs(targetH - h) > 1) {
          settling = true;
          await win.setSize(new LogicalSize(w, targetH));
          settling = false;
        }
      } catch {
        settling = false;
      }
    };
    void (async () => {
      unlisten = await win.onResized(() => {
        if (modeRef.current !== "ambient" || settling) return;
        if (snapTimer) clearTimeout(snapTimer);
        snapTimer = setTimeout(() => void snap(), 120);
      });
    })();
    return () => {
      if (snapTimer) clearTimeout(snapTimer);
      if (unlisten) unlisten();
    };
  }, []);

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

  // Mandatory onboarding: a signed-in player must claim a username before anything else.
  if (needsUsername(remote)) {
    return (
      <main className="ambient ambient--stats">
        <DragHandle />
        <UsernameSetup />
      </main>
    );
  }

  const pets = (remote?.pets ?? []) as Pet[];
  const playerName = remote?.account?.username ?? remote?.account?.githubLogin ?? "you";
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

  // The player's progress, distilled for the Friends-tab share card (rank, streak, trophies).
  // Trophies = glyphs of past seasons the player finished top-3 in (a podium row in season history).
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
    avatar: playerView, // the LPC paper-doll + worn gear, composited into the card's crest
  };

  const petCreatures = pets.map((pet): Creature => {
    const live = decay(pet.entity, serverNow);
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
  });
  const petBySession = new Map(petCreatures.map((pet) => [pet.sessionId, pet]));
  const helperCreatures = Object.entries(subagents).flatMap(([parentSessionId, helpers]) => {
    const parent = petBySession.get(parentSessionId);
    if (!parent) return [];
    return helpers.map((helper): Creature => ({
      key: `helper:${parentSessionId}:${helper.agentId}`,
      view: {
        species: parent.view.species,
        status: parent.view.status,
        activity: "active",
        action: helper.action,
        failed: false,
        alive: true,
        equipped: [],
        tint: parent.view.tint,
        seed: parent.view.seed,
      },
      name: helper.agentType,
      helper: { parentKey: parent.key, finished: helper.finishedAt != null },
      tokens: helper.tokens,
    }));
  });

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
    ...petCreatures,
    ...helperCreatures,
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
          seasonLeaderboard={seasonLeaderboard}
          seasonHistory={seasonHistory}
          pets={topPets}
          friends={friends}
          share={shareStats}
          onClose={() => setMode("ambient")}
        />
      </main>
    );
  }

  // Collapsed (peek) mode: the window is shrunk to one toolbar. The world map is hidden; the
  // score and compact animated agent row stay glanceable in the bar.
  if (mode === "collapsed") {
    const collapsedCreatures = creatures.filter((c) => c.key !== "player" && c.view.activity === "active");
    return (
      <main className="ambient ambient--peek" ref={ambientRef}>
        <div className="topbar topbar--peek" ref={topbarRef}>
          <DragHandle />
          <ScoreChip
            overview={overview}
            onClick={() => setMode("ambient")}
            title="Click to expand"
            compact={compactScore}
            phase={scorePhase}
          />
          {collapsedCreatures.length > 0 ? (
            <div className="topbar__agents">
              <PixiStage creatures={collapsedCreatures} muted={muted} variant="strip" />
            </div>
          ) : null}
          <div className="topbar__controls">
            <BarButton glyph="⤢" label="Expand" onClick={() => setMode("ambient")} />
            <BarButton glyph="⤓" label={hideLabel} onClick={() => void minimizeWindow()} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ambient" ref={ambientRef}>
      {/* Top bar: the AI drag handle, the always-visible score (→ stats dashboard), and the
          right-hand control cluster — mute, collapse to the peek bar, and minimize (to the Dock
          on macOS, the taskbar on Windows). */}
      <div className="topbar" ref={topbarRef}>
        <DragHandle />
        <ScoreChip
          overview={overview}
          onClick={() => setMode("stats")}
          title="Open stats"
          compact={compactScore}
          phase={scorePhase}
        />
        <div className="topbar__controls">
          <BarButton
            glyph={muted ? "🔇" : "🔊"}
            label={muted ? "Unmute sounds" : "Mute sounds"}
            onClick={toggleMuted}
            pressed={muted}
          />
          <BarButton glyph="–" label="Collapse to peek bar" onClick={() => setMode("collapsed")} />
          <BarButton glyph="⤓" label={hideLabel} onClick={() => void minimizeWindow()} />
        </div>
      </div>
      {/* Clicking the cabin (the player's home) opens the player menu (character sheet). */}
      <PixiStage
        creatures={creatures}
        decorations={decorations ?? []}
        onOpenHome={() => setMode("menu")}
        onKillPet={async (sessionId) => {
          await killPet({ sessionId });
        }}
        muted={muted}
      />
      <ResizeGrip />
    </main>
  );
}
