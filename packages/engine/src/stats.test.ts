import { describe, expect, it } from "vitest";
import {
  ACTIVITY,
  type DayPoint,
  TIME,
  bestDay,
  currentStreak,
  dailyScore,
  dayOfWeek,
  effortSpan,
  foldActivity,
  longestStreak,
  newDailyRollup,
  sumDailies,
  utcDayOf,
} from "./index.js";

describe("effortSpan — capped, total gap classifier", () => {
  it("books a fresh working gap to its tool bucket", () => {
    expect(effortSpan(true, "edit", 10_000)).toEqual({ ms: 10_000, bucket: "edit" });
  });

  it("books a fresh working gap with no tool to thinking", () => {
    expect(effortSpan(true, "none", 10_000)).toEqual({ ms: 10_000, bucket: "thinking" });
  });

  it("books a non-working gap to idle (capped)", () => {
    expect(effortSpan(false, "edit", 10_000)).toEqual({ ms: 10_000, bucket: "idle" });
  });

  it("books a stale gap to idle, capped at the freshness window (not gapMs)", () => {
    expect(effortSpan(true, "shell", ACTIVITY.workTimeoutMs)).toEqual({
      ms: ACTIVITY.workTimeoutMs,
      bucket: "idle",
    });
    expect(effortSpan(true, "shell", ACTIVITY.workTimeoutMs + 5_000)).toEqual({
      ms: ACTIVITY.workTimeoutMs,
      bucket: "idle",
    });
  });

  it("ignores non-positive gaps (clock skew / first event)", () => {
    expect(effortSpan(true, "read", 0)).toEqual({ ms: 0, bucket: "idle" });
    expect(effortSpan(true, "read", -5)).toEqual({ ms: 0, bucket: "idle" });
  });
});

describe("foldActivity — accumulate one event into a day", () => {
  it("adds tokens, active-time and quality", () => {
    const r = foldActivity(newDailyRollup(), {
      tokens: 1500,
      appraisal: { tier: "balanced", fill: 0.4, status: "content", quality: 0.6 },
      prevWorking: true,
      prevAction: "shell",
      gapMs: 8_000,
    });
    expect(r.tokensFed).toBe(1500);
    expect(r.activeMs).toBe(8_000);
    expect(r.actionMs.shell).toBe(8_000);
    expect(r.promptQualitySum).toBeCloseTo(0.6);
    expect(r.promptCount).toBe(1);
  });

  it("books idle time into the idle bucket without inflating activeMs", () => {
    const r = foldActivity(newDailyRollup(), {
      tokens: 500,
      prevWorking: false,
      prevAction: "none",
      gapMs: 8_000,
    });
    expect(r.tokensFed).toBe(500);
    expect(r.activeMs).toBe(0); // idle never inflates working time / the ring goal
    expect(r.actionMs.idle).toBe(8_000);
    expect(r.promptCount).toBe(0);
  });

  it("books working-but-no-tool time into thinking (counted as active)", () => {
    const r = foldActivity(newDailyRollup(), {
      tokens: 0,
      prevWorking: true,
      prevAction: "none",
      gapMs: 6_000,
    });
    expect(r.actionMs.thinking).toBe(6_000);
    expect(r.activeMs).toBe(6_000);
  });
});

describe("dailyScore — tokens only", () => {
  it("weights tokens, ignoring cumulative terms", () => {
    // 100000*0.001 = 100
    expect(dailyScore({ tokensFed: 100_000 })).toBe(100);
  });
});

describe("utcDayOf — UTC day bucketing", () => {
  it("buckets timestamps in the same UTC day together", () => {
    const day = 20_000;
    const start = day * TIME.DAY_MS;
    expect(utcDayOf(start)).toBe(day);
    expect(utcDayOf(start + TIME.DAY_MS - 1)).toBe(day);
    expect(utcDayOf(start + TIME.DAY_MS)).toBe(day + 1);
  });
});

describe("sumDailies — aggregate windows", () => {
  it("sums every additive field including action buckets", () => {
    const a = foldActivity(newDailyRollup(), {
      tokens: 100, prevWorking: true, prevAction: "edit", gapMs: 5_000,
    });
    const b = foldActivity(newDailyRollup(), {
      tokens: 200, prevWorking: true, prevAction: "read", gapMs: 3_000,
    });
    const total = sumDailies([a, b]);
    expect(total.tokensFed).toBe(300);
    expect(total.activeMs).toBe(8_000);
    expect(total.actionMs.edit).toBe(5_000);
    expect(total.actionMs.read).toBe(3_000);
  });
});

describe("dayOfWeek — UTC weekday of a day index", () => {
  it("anchors epoch day 0 (1970-01-01) to Thursday and cycles", () => {
    expect(dayOfWeek(0)).toBe(4); // Thursday
    expect([0, 1, 2, 3, 4, 5, 6].map(dayOfWeek)).toEqual([4, 5, 6, 0, 1, 2, 3]);
  });
});

const day = (utcDay: number, score = 0, tokensFed = score, activeMs = 0): DayPoint => ({
  utcDay,
  score,
  tokensFed,
  activeMs,
});

describe("currentStreak — consecutive active days ending now", () => {
  it("counts today when today is active", () => {
    expect(currentStreak([day(8, 1), day(9, 1), day(10, 1)], 10)).toBe(3);
  });

  it("anchors to yesterday when today hasn't started yet", () => {
    expect(currentStreak([day(8, 1), day(9, 1)], 10)).toBe(2);
  });

  it("stops at a one-day gap", () => {
    expect(currentStreak([day(7, 1), day(9, 1), day(10, 1)], 10)).toBe(2);
  });

  it("is zero with no active days", () => {
    expect(currentStreak([], 10)).toBe(0);
    expect(currentStreak([day(3, 0, 0, 0)], 10)).toBe(0);
  });
});

describe("longestStreak — longest active run in history", () => {
  it("finds the longest among gap-separated runs", () => {
    // runs: [1,2,3] (3), [10,11] (2), [20] (1)
    const days = [1, 2, 3, 10, 11, 20].map((d) => day(d, 1));
    expect(longestStreak(days)).toBe(3);
  });

  it("returns a historic run even when the current run is shorter", () => {
    const days = [1, 2, 3, 4, 9].map((d) => day(d, 1));
    expect(longestStreak(days)).toBe(4);
  });

  it("handles single day and empty", () => {
    expect(longestStreak([day(5, 1)])).toBe(1);
    expect(longestStreak([])).toBe(0);
  });
});

describe("bestDay — top day by score", () => {
  it("picks the max-score day", () => {
    expect(bestDay([day(1, 50), day(2, 200), day(3, 120)])).toEqual({ utcDay: 2, score: 200 });
  });

  it("breaks ties toward the more recent day", () => {
    expect(bestDay([day(1, 100), day(5, 100)])).toEqual({ utcDay: 5, score: 100 });
  });

  it("is null with no scoring days", () => {
    expect(bestDay([])).toBeNull();
    expect(bestDay([day(1, 0, 0, 0)])).toBeNull();
  });
});
