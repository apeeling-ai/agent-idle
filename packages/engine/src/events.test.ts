import { describe, expect, it } from "vitest";
import {
  type Entity,
  type FeedEvent,
  type ReducedState,
  TIME,
  apply,
  appraisePrompt,
  newEntity,
  newStats,
} from "./index.js";

const T0 = 1_700_000_000_000;
const hours = (n: number) => n * TIME.HOUR_MS;

function freshState(fullness = 1): ReducedState {
  const entity: Entity = {
    ...newEntity({ id: "e1", name: "Reg", species: "knight", now: T0 }),
    resources: { fullness },
  };
  return { entity, stats: newStats() };
}

function feedEvent(at: number, over: Partial<FeedEvent> = {}): FeedEvent {
  return {
    type: "feed",
    at,
    clientEventId: `evt-${at}-${over.tokens ?? 0}`,
    appraisal: appraisePrompt("write a focused unit test for the decay ladder edge cases"),
    tokens: 1200,
    linesAuthored: 30,
    ...over,
  };
}

describe("apply — event reducer (server == client)", () => {
  it("a feed event fills the pet and accumulates stats", () => {
    const next = apply(freshState(0.3), feedEvent(T0, { appraisal: { tier: "gourmet", fill: 0.5, status: "satisfied", quality: 0.9 } }));
    expect(next.entity.resources.fullness).toBeCloseTo(0.8);
    expect(next.entity.lastUpdated).toBe(T0);
    expect(next.stats.tokensFed).toBe(1200);
    expect(next.stats.linesAuthored).toBe(30);
    expect(next.stats.promptCount).toBe(1);
    expect(next.stats.promptQualitySum).toBeCloseTo(0.9);
  });

  it("decays to the event time BEFORE feeding", () => {
    // Full at T0, fed 16h later (drained to ~0), appraisal adds 0.5.
    const ev = feedEvent(T0 + hours(16), { appraisal: { tier: "balanced", fill: 0.5, status: "content", quality: 0.6 } });
    const next = apply(freshState(1), ev);
    expect(next.entity.resources.fullness).toBeCloseTo(0.5, 1);
    expect(next.entity.lastUpdated).toBe(T0 + hours(16));
  });

  it("fullness is clamped at 1", () => {
    const next = apply(freshState(0.9), feedEvent(T0, { appraisal: { tier: "gourmet", fill: 0.8, status: "satisfied", quality: 1 } }));
    expect(next.entity.resources.fullness).toBe(1);
  });

  it("additive stats are order-free across reorderings", () => {
    const a = feedEvent(T0 + hours(1), { tokens: 100, linesAuthored: 5 });
    const b = feedEvent(T0 + hours(3), { tokens: 250, linesAuthored: 11 });

    const forward = apply(apply(freshState(1), a), b).stats;
    const backward = apply(apply(freshState(1), b), a).stats;

    expect(forward.tokensFed).toBe(backward.tokensFed);
    expect(forward.linesAuthored).toBe(backward.linesAuthored);
    expect(forward.promptCount).toBe(backward.promptCount);
    expect(forward.promptQualitySum).toBeCloseTo(backward.promptQualitySum);
    expect(forward.tokensFed).toBe(350);
  });

  it("a pet event gives a small affectionate bump, no stats change", () => {
    const next = apply(freshState(0.5), { type: "pet", at: T0, clientEventId: "p1" });
    expect(next.entity.resources.fullness).toBeCloseTo(0.55);
    expect(next.stats.promptCount).toBe(0);
  });

  it("does not mutate the input state", () => {
    const state = freshState(0.4);
    apply(state, feedEvent(T0));
    expect(state.entity.resources.fullness).toBe(0.4);
    expect(state.stats.tokensFed).toBe(0);
  });
});
