import { describe, expect, it } from "vitest";
import { ACTIVITY, DECAY, TIME, decay, isAlive, newEntity, type Entity } from "./index.js";

const T0 = 1_700_000_000_000; // fixed epoch ms — deterministic, no Date.now in tests
const hours = (n: number) => n * TIME.HOUR_MS;

// Scale the test offsets to the configured rates so they hold under any tuning.
const EMPTY_H = 1 / DECAY.energyLostPerHour; // hours to drain full → 0
const GRACE_H = DECAY.terminalGraceHours; // extra hours at 0 before terminal (fainted → dead)
const REMOVE_H = DECAY.removalGraceHours; // extra hours past terminal before removal (dead → gone)

function freshEntity(mode: "normal" | "hardcore" = "normal"): Entity {
  return newEntity({ id: "e1", sessionId: "s1", name: "Sir Reginald", species: "knight", mode, now: T0 });
}

describe("decay — lazy liveness ladder", () => {
  it("a fresh entity is lively, full and not yet working", () => {
    const live = decay(freshEntity(), T0);
    expect(live.status).toBe("lively");
    expect(live.alive).toBe(true);
    expect(live.activity).toBe("idle");
    expect(live.resources.energy).toBe(1);
  });

  it("idle time drains energy and worsens status", () => {
    const live = decay(freshEntity(), T0 + hours(EMPTY_H * 0.5)); // ~0.5 energy
    expect(live.resources.energy).toBeLessThan(1);
    expect(live.status).toBe("weary");
  });

  it("walks lively → weary → drained as energy drains", () => {
    expect(decay(freshEntity(), T0 + hours(EMPTY_H * 0.1)).status).toBe("lively"); // ~0.94
    expect(decay(freshEntity(), T0 + hours(EMPTY_H * 0.5)).status).toBe("weary"); // ~0.5
    expect(decay(freshEntity(), T0 + hours(EMPTY_H * 0.9)).status).toBe("drained"); // ~0.1
  });

  it("empty but within grace → fainted and recoverable in BOTH modes", () => {
    const at = T0 + hours(EMPTY_H + GRACE_H * 0.5);
    expect(decay(freshEntity("normal"), at)).toMatchObject({ status: "fainted", alive: true });
    expect(decay(freshEntity("hardcore"), at)).toMatchObject({ status: "fainted", alive: true });
  });

  it("past the terminal grace → DEAD in both modes, but still alive (always revivable)", () => {
    const at = T0 + hours(EMPTY_H + GRACE_H + REMOVE_H * 0.5); // past terminal, before removal
    for (const mode of ["normal", "hardcore"] as const) {
      const live = decay(freshEntity(mode), at);
      expect(live.status).toBe("dead"); // shows the slump…
      expect(live.alive).toBe(true); // …but a session can always be revived
      expect(live.gone).toBe(false); // not yet removed
    }
  });

  it("fainted → dead boundary respects terminalGraceHours from config", () => {
    const justBefore = T0 + hours(EMPTY_H + GRACE_H * 0.5);
    const justAfter = T0 + hours(EMPTY_H + GRACE_H * 2);
    expect(decay(freshEntity(), justBefore).status).toBe("fainted");
    expect(decay(freshEntity(), justAfter).status).toBe("dead");
  });

  it("a living or recoverable pet is never 'gone'", () => {
    expect(decay(freshEntity(), T0).gone).toBe(false); // lively
    expect(decay(freshEntity(), T0 + hours(EMPTY_H * 0.9)).gone).toBe(false); // drained
    expect(decay(freshEntity(), T0 + hours(EMPTY_H + GRACE_H * 0.5)).gone).toBe(false); // fainted
  });

  it("becomes 'gone' (removed) after removalGraceHours past the terminal rung, in BOTH modes", () => {
    const justBefore = T0 + hours(EMPTY_H + GRACE_H + REMOVE_H * 0.5);
    const wellAfter = T0 + hours(EMPTY_H + GRACE_H + REMOVE_H * 2);
    for (const mode of ["normal", "hardcore"] as const) {
      expect(decay(freshEntity(mode), justBefore).gone).toBe(false);
      expect(decay(freshEntity(mode), wellAfter).gone).toBe(true);
    }
  });

  it("is pure — does not mutate the input snapshot", () => {
    const e = freshEntity();
    const before = e.resources.energy;
    decay(e, T0 + hours(EMPTY_H * 0.5));
    expect(e.resources.energy).toBe(before);
  });

  it("ignores clock skew (now before lastUpdated → no decay)", () => {
    const live = decay(freshEntity(), T0 - hours(5));
    expect(live.elapsedHours).toBe(0);
    expect(live.resources.energy).toBe(1);
    expect(live.status).toBe("lively");
  });

  it("isAlive matches decay().alive (true until removed — always revivable)", () => {
    const terminal = T0 + hours(EMPTY_H + GRACE_H + EMPTY_H);
    for (const mode of ["normal", "hardcore"] as const) {
      expect(isAlive(freshEntity(mode), terminal)).toBe(decay(freshEntity(mode), terminal).alive);
    }
    expect(isAlive(freshEntity(), terminal)).toBe(true); // dead but recoverable
  });
});

describe("decay — activity (working flag + read-time freshness)", () => {
  it("is active (mining) while flagged working and the signal is fresh", () => {
    const e: Entity = { ...freshEntity(), working: true }; // lastUpdated = T0
    expect(decay(e, T0 + 1_000).activity).toBe("active");
  });

  it("lapses to idle once the signal goes stale, even if still flagged working", () => {
    const e: Entity = { ...freshEntity(), working: true };
    expect(decay(e, T0 + ACTIVITY.workTimeoutMs + 1).activity).toBe("idle");
  });

  it("is idle when not flagged working", () => {
    expect(decay({ ...freshEntity(), working: false }, T0).activity).toBe("idle");
  });
});
