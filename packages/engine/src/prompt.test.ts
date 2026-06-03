import { describe, expect, it } from "vitest";
import { appraisePrompt } from "./index.js";

const GOURMET = `Refactor the appraisePrompt function in packages/engine/src/prompt.ts so that it
returns a normalized quality score between 0 and 1. The function should handle empty
input, must not throw on null, and the test in prompt.test.ts expects gourmet prompts
to score above 0.75. Given a detailed prompt with code context, when we appraise it,
then the quality must be high.
\`\`\`ts
const example = 1;
\`\`\``;

describe("appraisePrompt — pure sensor heuristic", () => {
  it("a detailed, specific prompt is a gourmet meal that fills and scores high", () => {
    const a = appraisePrompt(GOURMET);
    expect(a.quality).toBeGreaterThanOrEqual(0.75);
    expect(a.tier).toBe("gourmet");
    expect(a.status).toBe("satisfied");
    expect(a.fill).toBeGreaterThan(0.4);
  });

  it('"make it pop" is confusing junk that barely feeds', () => {
    const a = appraisePrompt("make it pop");
    expect(a.quality).toBeLessThanOrEqual(0.3);
    expect(a.status).toBe("confused");
    expect(a.tier).toBe("junk");
    expect(a.fill).toBeLessThan(0.15);
  });

  it("other lazy asks also read as confused", () => {
    expect(appraisePrompt("fix it").status).toBe("confused");
    expect(appraisePrompt("just do it somehow").status).toBe("confused");
  });

  it("is deterministic and bounded", () => {
    const a = appraisePrompt(GOURMET);
    const b = appraisePrompt(GOURMET);
    expect(a).toEqual(b);
    expect(a.quality).toBeLessThanOrEqual(1);
    expect(a.fill).toBeLessThanOrEqual(1);
  });

  it("handles empty input without throwing", () => {
    const a = appraisePrompt("");
    expect(a.quality).toBeGreaterThanOrEqual(0);
    expect(a.fill).toBeGreaterThanOrEqual(0);
  });
});
