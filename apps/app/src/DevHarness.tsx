/**
 * DEV-ONLY visual/audio harness for the render seam. Mount with `?harness` in dev
 * (see main.tsx) to exercise the real compositor → Pixi → sound path with mock pets —
 * no Convex, auth, or Claude session, and no waiting on energy decay.
 *
 * It renders ONE pet per entry in WORKING_ANIMATIONS, each labelled with its action, so
 * every working animation is shown exactly once (no hash-luck duplicates) and stays in
 * sync if the pool changes. Verifies:
 *  - varied working actions: each pet plays a different, labelled action when working.
 *  - "done working" chime: leaving "working" flips active → idle and should ding once.
 *  - the full liveness lifecycle: ALIVE → DEAD (slump) → HIDDEN (despawn) → ALIVE again.
 *    Revive (the get-up) must play on BOTH dead → alive (slot persists) and
 *    hidden → alive (slot was destroyed; the renderer remembers it died).
 */

import { useState } from "react";
import { PixiStage, type Creature } from "./PixiStage";
import {
  tintForSeed,
  workingAnimation,
  WORKING_ANIMATIONS,
  type AnimationName,
  type CreatureView,
} from "./render/compositor";

/** Find a seed whose hash lands on `anim`, so each demo pet shows that exact action. */
function seedForAnimation(anim: AnimationName): string {
  for (let i = 0; i < 10_000; i++) {
    const seed = `pet-${i}`;
    if (workingAnimation(seed) === anim) return seed;
  }
  return "pet-0";
}

// One demo pet per working action, computed once (pure).
const DEMO = WORKING_ANIMATIONS.map((anim) => ({ anim, seed: seedForAnimation(anim) }));

type Life = "alive" | "dead" | "hidden";

export function DevHarness() {
  const [life, setLife] = useState<Life>("alive");
  const [working, setWorking] = useState(false);

  // HIDDEN ⇒ empty list (pets despawn, exactly like a `gone` removal). Revive re-adds them.
  const creatures: Creature[] =
    life === "hidden"
      ? []
      : DEMO.map(({ anim, seed }): Creature => {
          const dead = life === "dead";
          const view: CreatureView = {
            species: "knight",
            status: dead ? "dead" : "lively",
            activity: working && !dead ? "active" : "idle",
            alive: true, // sessions are always revivable
            equipped: [],
            tint: tintForSeed(seed),
            seed,
          };
          return { key: anim, view, name: anim, sub: dead ? "dead" : working ? "working" : "idle" };
        });

  const btn = { padding: "4px 10px" };
  return (
    <main className="ambient">
      <div className="hud" style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => setWorking((w) => !w)} disabled={life !== "alive"}>
          {working ? "Stop working (→ idle + ding)" : "Start working"}
        </button>
        <button style={btn} onClick={() => setLife("dead")} disabled={life === "dead"}>
          Kill (slump)
        </button>
        <button style={btn} onClick={() => setLife("hidden")} disabled={life !== "dead"}>
          Hide (despawn)
        </button>
        <button style={btn} onClick={() => setLife("alive")} disabled={life === "alive"}>
          Revive (get-up)
        </button>
        <span style={{ alignSelf: "center", opacity: 0.7, fontSize: 12 }}>
          state: <b>{life}</b> — revive should play on both dead→alive and hidden→alive
        </span>
      </div>
      <PixiStage creatures={creatures} />
    </main>
  );
}
