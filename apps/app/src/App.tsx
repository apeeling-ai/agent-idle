import { useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { decay, type Entity, type Liveness } from "@agent-idle/engine";
import { api } from "./convex";
import { AuthPanel } from "./AuthPanel";
import { PixiStage, type Creature } from "./PixiStage";
import { tintForSeed, type CreatureView } from "./render/compositor";
import "./App.css";

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

  // LOCAL per-session display hints (repo folder + one-word topic) read from the daemon's
  // loopback endpoint. This data never goes through the server (privacy) — it's on-machine
  // only. Polled so a newly-started session's repo/topic appears within a few seconds.
  const [sessionMeta, setSessionMeta] = useState<Record<string, { repo: string; topic: string }>>({});
  useEffect(() => {
    let alive = true;
    const fetchMeta = () =>
      fetch(`${DAEMON_URL}/sessions`)
        .then((r) => r.json())
        .then((m) => alive && setSessionMeta(m as Record<string, { repo: string; topic: string }>))
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
  const totalTokens = remote?.stats?.tokensFed ?? 0; // sum across pets — what the player has earned

  // The player is always in view (idle); pets spawn beside it per Claude session and
  // re-decay locally each tick so a working pet mines, then settles to idle.
  const playerView: CreatureView = {
    species: "knight", // ignored for the sprite (one shared body); kept for the type
    status: "lively",
    activity: "idle",
    alive: true,
    equipped: [],
  };

  const creatures: Creature[] = [
    // Player carries the running token total; coins fly to it from each pet that earns.
    { key: "player", view: playerView, name: playerName, sub: `🪙 ${formatTokens(totalTokens)}`, tokens: totalTokens },
    ...pets.map((pet): Creature => {
      const live = decay(pet.entity, now);
      // Local repo/topic hint for this session (from the daemon; "" if not yet known).
      const meta = sessionMeta[pet.entity.sessionId];
      const where = meta ? [meta.repo, meta.topic].filter(Boolean).join(" · ") : "";
      return {
        key: pet.entity.id,
        view: {
          species: pet.entity.species,
          status: live.status,
          activity: live.activity,
          alive: live.alive,
          equipped: pet.entity.cosmetics.equipped,
          tint: tintForSeed(pet.entity.id),
          seed: pet.entity.id,
        },
        name: pet.entity.name,
        sub: petLabel(live),
        sub2: where || undefined,
        tokens: pet.stats.tokensFed,
      };
    }),
  ];

  return (
    <main className="ambient">
      <DragHandle />
      <PixiStage creatures={creatures} />
      {pets.length === 0 ? (
        <p className="hint">No active sessions — start one in Claude Code to spawn a mining pet.</p>
      ) : null}
    </main>
  );
}
