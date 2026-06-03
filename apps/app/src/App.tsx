import { useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { decay, type Entity, type Liveness } from "@agent-idle/engine";
import { api } from "./convex";
import { AuthPanel } from "./AuthPanel";
import { PixiStage, type Creature } from "./PixiStage";
import { tintForSeed, type CreatureView } from "./render/compositor";
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

/** A single pet as returned by getPlayerState (raw snapshot + the server's liveness read). */
interface Pet {
  entity: Entity;
  liveness: Liveness;
}

function petLabel(live: Liveness): string {
  return live.activity === "active" ? "working" : live.status;
}

export default function App() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const token = useAuthToken();

  // Identity-scoped: no args. Returns null when unauthenticated or not yet created.
  const remote = useQuery(api.events.getPlayerState, isAuthenticated ? {} : "skip");

  // Hand the daemon our authenticated token — on change AND on a heartbeat. The daemon
  // may (re)start after we signed in (e.g. `pnpm dev` restart), and it only learns the
  // token by us pushing it, so a periodic re-push guarantees it lands within a few sec.
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

  if (!isAuthenticated) {
    return (
      <main className="ambient" data-tauri-drag-region>
        <div className="hud">
          <AuthPanel />
        </div>
      </main>
    );
  }

  const pets = (remote?.pets ?? []) as Pet[];
  const playerName = remote?.account?.githubLogin ?? "you";

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
    { key: "player", view: playerView, name: playerName, sub: "you" },
    ...pets.map((pet): Creature => {
      const live = decay(pet.entity, now);
      return {
        key: pet.entity.id,
        view: {
          species: pet.entity.species,
          status: live.status,
          activity: live.activity,
          alive: live.alive,
          equipped: pet.entity.cosmetics.equipped,
          tint: tintForSeed(pet.entity.id),
        },
        name: pet.entity.name,
        sub: petLabel(live),
      };
    }),
  ];

  return (
    <main className="ambient" data-tauri-drag-region>
      <PixiStage creatures={creatures} />
      {pets.length === 0 ? (
        <p className="hint">No active sessions — start one in Claude Code to spawn a mining pet.</p>
      ) : null}
      <div className="hud">
        {remote ? (
          <span className="hint">
            {pets.length} {pets.length === 1 ? "pet" : "pets"} • score {remote.score}
          </span>
        ) : null}
        <div className="controls">
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    </main>
  );
}
