import { describe, expect, it } from "vitest";
import { DECAY, TIME, decay, isAlive, newEntity, type Entity } from "./index.js";

const T0 = 1_700_000_000_000; // fixed epoch ms — deterministic, no Date.now in tests
const hours = (n: number) => n * TIME.HOUR_MS;

function freshEntity(mode: "normal" | "hardcore" = "normal"): Entity {
  return newEntity({ id: "e1", name: "Sir Reginald", species: "knight", mode, now: T0 });
}

describe("decay — lazy liveness ladder", () => {
  it("a fresh entity is healthy and full", () => {
    const live = decay(freshEntity(), T0);
    expect(live.status).toBe("healthy");
    expect(live.alive).toBe(true);
    expect(live.resources.fullness).toBe(1);
  });

  it("10 idle hours makes it hungrier (fullness drops, status worsens)", () => {
    const live = decay(freshEntity(), T0 + hours(10));
    expect(live.resources.fullness).toBeLessThan(1);
    expect(live.status).toBe("hungry");
    expect(live.elapsedHours).toBeCloseTo(10);
  });

  it("walks healthy → hungry → starving as fullness drains", () => {
    expect(decay(freshEntity(), T0 + hours(2)).status).toBe("healthy"); // ~0.875
    expect(decay(freshEntity(), T0 + hours(8)).status).toBe("hungry"); // ~0.5
    expect(decay(freshEntity(), T0 + hours(14)).status).toBe("starving"); // ~0.125
  });

  it("empty but within grace → fainted and recoverable in BOTH modes", () => {
    const at = T0 + hours(20); // empty (>16h) but <16+24h
    expect(decay(freshEntity("normal"), at)).toMatchObject({ status: "fainted", alive: true });
    expect(decay(freshEntity("hardcore"), at)).toMatchObject({ status: "fainted", alive: true });
  });

  it("long neglect past terminal threshold → fainted (normal) vs dead (hardcore)", () => {
    const at = T0 + hours(50); // well past 16h-to-zero + 24h grace

    const normal = decay(freshEntity("normal"), at);
    expect(normal.status).toBe("fainted");
    expect(normal.alive).toBe(true); // default mode is recoverable (D1)

    const hardcore = decay(freshEntity("hardcore"), at);
    expect(hardcore.status).toBe("dead");
    expect(hardcore.alive).toBe(false);
  });

  it("terminal boundary respects terminalGraceHours from config", () => {
    const zeroAt = 1 / DECAY.fullnessLostPerHour; // 16h
    const justBefore = T0 + hours(zeroAt + DECAY.terminalGraceHours - 1);
    const justAfter = T0 + hours(zeroAt + DECAY.terminalGraceHours + 1);
    expect(decay(freshEntity("hardcore"), justBefore).alive).toBe(true);
    expect(decay(freshEntity("hardcore"), justAfter).alive).toBe(false);
  });

  it("is pure — does not mutate the input snapshot", () => {
    const e = freshEntity();
    const before = e.resources.fullness;
    decay(e, T0 + hours(10));
    expect(e.resources.fullness).toBe(before);
  });

  it("ignores clock skew (now before lastUpdated → no decay)", () => {
    const live = decay(freshEntity(), T0 - hours(5));
    expect(live.elapsedHours).toBe(0);
    expect(live.resources.fullness).toBe(1);
    expect(live.status).toBe("healthy");
  });

  it("isAlive matches decay().alive", () => {
    expect(isAlive(freshEntity("hardcore"), T0 + hours(50))).toBe(false);
    expect(isAlive(freshEntity("normal"), T0 + hours(50))).toBe(true);
  });
});
