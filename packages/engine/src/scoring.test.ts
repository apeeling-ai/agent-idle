import { describe, expect, it } from "vitest";
import { evaluateUnlocks, score, type TrainerStats } from "./index.js";

const stats: TrainerStats = {
  tokensFed: 100_000,
  linesAuthored: 2_000,
  avgPromptQuality: 0.9,
  survivalStreakDays: 10,
  zoneAchievements: 2,
};

describe("score — TrainerScore", () => {
  it("excludes unverifiable avgPromptQuality by default", () => {
    // 100000*0.001 + 2000*0.5 + 10*25 + 2*50 = 100 + 1000 + 250 + 100 = 1450
    expect(score(stats)).toBe(1450);
  });

  it("is unaffected by avgPromptQuality when excluded", () => {
    const high = score({ ...stats, avgPromptQuality: 1 });
    const low = score({ ...stats, avgPromptQuality: 0 });
    expect(high).toBe(low);
  });

  it("includes quality only when explicitly opted in with a weight", () => {
    const base = score(stats);
    const withQuality = score(stats, {
      includePromptQuality: true,
      weights: {
        tokensFed: 1 / 1000,
        linesAuthored: 0.5,
        avgPromptQuality: 100,
        survivalStreakDays: 25,
        zoneAchievements: 50,
      },
    });
    expect(withQuality).toBe(base + Math.round(0.9 * 100));
  });
});

describe("evaluateUnlocks — pure stat-threshold rules", () => {
  it("unlocks bronze helm at 50k tokens but not iron", () => {
    const owned = evaluateUnlocks({ ...stats, tokensFed: 60_000 });
    expect(owned).toContain("helm.bronze");
    expect(owned).not.toContain("helm.iron");
  });

  it("unlocks the streak aura at a 7-day streak", () => {
    expect(evaluateUnlocks({ ...stats, survivalStreakDays: 7 })).toContain("aura.streak");
  });

  it("grants nothing at zero stats", () => {
    expect(
      evaluateUnlocks({
        tokensFed: 0,
        linesAuthored: 0,
        avgPromptQuality: 0,
        survivalStreakDays: 0,
        zoneAchievements: 0,
      }),
    ).toEqual([]);
  });
});
