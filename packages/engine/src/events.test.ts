import { describe, expect, it } from "vitest";
import {
  type ActivityEvent,
  ACTIVITY,
  type Entity,
  type ReducedState,
  TIME,
  apply,
  appraisePrompt,
  decay,
  newEntity,
  newStats,
} from "./index.js";

const T0 = 1_700_000_000_000;
const hours = (n: number) => n * TIME.HOUR_MS;

function freshState(energy = 1): ReducedState {
  const entity: Entity = {
    ...newEntity({ id: "e1", sessionId: "s1", name: "Reg", species: "knight", now: T0 }),
    resources: { energy },
  };
  return { entity, stats: newStats() };
}

function activityEvent(at: number, over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    type: "activity",
    sessionId: "s1",
    at,
    clientEventId: `evt-${at}-${over.tokens ?? 0}`,
    appraisal: appraisePrompt("write a focused unit test for the decay ladder edge cases"),
    tokens: 1200,
    linesAuthored: 30,
    ...over,
  };
}

describe("apply — event reducer (server == client)", () => {
  it("an activity event replenishes energy and accumulates stats", () => {
    const next = apply(
      freshState(0.3),
      activityEvent(T0, { appraisal: { tier: "gourmet", fill: 0.5, status: "satisfied", quality: 0.9 } }),
    );
    expect(next.entity.resources.energy).toBeCloseTo(0.8);
    expect(next.entity.lastUpdated).toBe(T0);
    expect(next.stats.tokensFed).toBe(1200);
    expect(next.stats.linesAuthored).toBe(30);
    expect(next.stats.promptCount).toBe(1);
    expect(next.stats.promptQualitySum).toBeCloseTo(0.9);
  });

  it("decays to the event time BEFORE replenishing", () => {
    // Full at T0, used 16h later (drained to ~0), appraisal adds 0.5.
    const ev = activityEvent(T0 + hours(16), { appraisal: { tier: "balanced", fill: 0.5, status: "content", quality: 0.6 } });
    const next = apply(freshState(1), ev);
    expect(next.entity.resources.energy).toBeCloseTo(0.5, 1);
    expect(next.entity.lastUpdated).toBe(T0 + hours(16));
  });

  it("energy is clamped at 1", () => {
    const next = apply(
      freshState(0.9),
      activityEvent(T0, { appraisal: { tier: "gourmet", fill: 0.8, status: "satisfied", quality: 1 } }),
    );
    expect(next.entity.resources.energy).toBe(1);
  });

  it("additive stats are order-free across reorderings", () => {
    const a = activityEvent(T0 + hours(1), { tokens: 100, linesAuthored: 5 });
    const b = activityEvent(T0 + hours(3), { tokens: 250, linesAuthored: 11 });

    const forward = apply(apply(freshState(1), a), b).stats;
    const backward = apply(apply(freshState(1), b), a).stats;

    expect(forward.tokensFed).toBe(backward.tokensFed);
    expect(forward.linesAuthored).toBe(backward.linesAuthored);
    expect(forward.promptCount).toBe(backward.promptCount);
    expect(forward.promptQualitySum).toBeCloseTo(backward.promptQualitySum);
    expect(forward.tokensFed).toBe(350);
  });

  it("a register event spawns a fully-energized pet, not working, no stats change", () => {
    const next = apply(freshState(0.2), { type: "register", sessionId: "s1", at: T0, clientEventId: "r1" });
    expect(next.entity.resources.energy).toBe(1);
    expect(next.entity.lastUpdated).toBe(T0);
    expect(next.entity.working).toBe(false);
    expect(next.stats.promptCount).toBe(0);
  });

  it("a turn-start activity (working:true) marks the pet working and mining", () => {
    const next = apply(freshState(1), { type: "activity", sessionId: "s1", at: T0, clientEventId: "w1", working: true });
    expect(next.entity.working).toBe(true);
    expect(decay(next.entity, T0 + 1000).activity).toBe("active");
  });

  it("a turn-end activity (working:false) stops working immediately", () => {
    const started = apply(freshState(1), { type: "activity", sessionId: "s1", at: T0, clientEventId: "w1", working: true });
    const ended = apply(started, { type: "activity", sessionId: "s1", at: T0 + 5000, clientEventId: "w2", working: false });
    expect(ended.entity.working).toBe(false);
    expect(decay(ended.entity, T0 + 5001).activity).toBe("idle");
  });

  it("an activity ping (no appraisal) gives a small bump and does not count as a prompt", () => {
    const next = apply(freshState(0.5), { type: "activity", sessionId: "s1", at: T0, clientEventId: "p1" });
    expect(next.entity.resources.energy).toBeCloseTo(0.5 + ACTIVITY.pingEnergy);
    expect(next.stats.promptCount).toBe(0);
    expect(next.stats.tokensFed).toBe(0);
  });

  it("does not mutate the input state", () => {
    const state = freshState(0.4);
    apply(state, activityEvent(T0));
    expect(state.entity.resources.energy).toBe(0.4);
    expect(state.stats.tokensFed).toBe(0);
  });
});
