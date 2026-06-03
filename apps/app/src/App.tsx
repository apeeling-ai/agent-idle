import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import {
  apply,
  appraisePrompt,
  decay,
  newEntity,
  newStats,
  type Entity,
  type Event,
  type ReducedState,
} from "@agent-idle/engine";
import { api } from "./convex";
import { AuthPanel } from "./AuthPanel";
import { PixiStage } from "./PixiStage";
import type { CreatureView } from "./render/compositor";
import "./App.css";

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

export default function App() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const token = useAuthToken();

  const ensureAccount = useMutation(api.accounts.getOrCreateAccount);
  const ingest = useMutation(api.events.ingestEvent);
  // Identity-scoped: no args. Returns null when unauthenticated or not yet created.
  const remote = useQuery(api.events.getAccountState, isAuthenticated ? {} : "skip");

  // Materialise the account + creature once after sign-in.
  useEffect(() => {
    if (isAuthenticated) void ensureAccount().catch(() => {});
  }, [isAuthenticated, ensureAccount]);

  // Hand the daemon our authenticated token whenever it changes.
  useEffect(() => {
    if (token) pushTokenToDaemon(token);
  }, [token]);

  // Local preview state for instant feel; Convex is the authority and overrides when present.
  const [state, setState] = useState<ReducedState>(() => ({
    entity: newEntity({ id: "preview", name: "Pixel", species: "knight", now: Date.now() }),
    stats: newStats(),
  }));

  const entity: Entity = (remote?.entity as Entity | undefined) ?? state.entity;
  const live = decay(entity, Date.now());

  const view: CreatureView = useMemo(
    () => ({
      species: entity.species,
      status: remote?.liveness.status ?? live.status,
      alive: remote?.liveness.alive ?? live.alive,
      equipped: entity.cosmetics.equipped,
    }),
    [entity, remote, live.status, live.alive],
  );

  function emit(event: Event) {
    // 1. Instant local preview (engine runs identically here and on the server).
    setState((prev) => apply(prev, event));
    // 2. Post to the authority. Authenticated via Convex Auth — no signature needed.
    if (!isAuthenticated) return;
    void ingest({
      type: event.type,
      source: "app",
      payload:
        event.type === "feed"
          ? { appraisal: event.appraisal, tokens: 0, linesAuthored: 0 }
          : {},
      clientEventId: event.clientEventId,
      clientAt: event.at,
    }).catch(() => {
      /* offline — local preview already updated */
    });
  }

  function feed() {
    emit({
      type: "feed",
      at: Date.now(),
      clientEventId: crypto.randomUUID(),
      appraisal: appraisePrompt("a manual treat from the app"),
    });
  }

  function pet() {
    emit({ type: "pet", at: Date.now(), clientEventId: crypto.randomUUID() });
  }

  return (
    <main className="ambient" data-tauri-drag-region>
      <PixiStage view={view} />
      <div className="hud">
        <span className={`status status--${view.status}`}>{view.status}</span>
        {isAuthenticated ? (
          <div className="controls">
            <button onClick={feed}>Feed</button>
            <button onClick={pet}>Pet</button>
            <button onClick={() => void signOut()}>Sign out</button>
          </div>
        ) : (
          <AuthPanel />
        )}
      </div>
    </main>
  );
}
