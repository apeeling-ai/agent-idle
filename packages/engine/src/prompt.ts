/**
 * Prompt appraisal. Runs on the SENSOR (CLI daemon). Pure and deterministic.
 *
 * PRIVACY IS STRUCTURAL: this function takes the prompt text, but ONLY the numeric
 * results ({ tier, fill, status, quality }) ever leave the machine. The text itself
 * is never stored, transmitted, or put in any schema. Because the server can't see
 * the text it cannot recompute `quality` — which is exactly why quality drives the
 * PET (mood/fill) only and is excluded from the competitive score by default
 * (see config.ts SCORING + README open-decision #1).
 */

export type FoodTier = "gourmet" | "balanced" | "snack" | "junk";

/** Appraisal mood — distinct from liveness status in decay.ts. */
export type AppraisalStatus = "satisfied" | "content" | "meh" | "confused";

export interface Appraisal {
  tier: FoodTier;
  /** How much energy (0..1) a turn of this quality restores. */
  fill: number;
  status: AppraisalStatus;
  /** 0..1 coarse quality score. The ONLY signal allowed to leave the machine. */
  quality: number;
}

// Lazy, low-effort asks the pet finds unsatisfying / confusing.
const VAGUE_PHRASES = [
  "make it pop",
  "make it nice",
  "make it better",
  "make it good",
  "make it cool",
  "do the thing",
  "fix it",
  "clean it up",
  "just do it",
  "somehow",
  "some stuff",
];

// Tokens that signal a concrete, well-specified request.
const SPECIFIC_WORDS = new Set([
  "should",
  "must",
  "expect",
  "given",
  "when",
  "then",
  "because",
  "constraint",
  "return",
  "function",
  "test",
  "error",
  "input",
  "output",
  "api",
  "type",
  "interface",
  "edge",
]);

const round2 = (n: number): number => Math.round(n * 100) / 100;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function appraisePrompt(text: string): Appraisal {
  const raw = text ?? "";
  const lower = raw.toLowerCase().trim();
  const words = lower.length === 0 ? [] : lower.split(/\s+/);
  const wordCount = words.length;

  let vagueHits = 0;
  for (const phrase of VAGUE_PHRASES) {
    if (lower.includes(phrase)) vagueHits++;
  }

  let specificHits = 0;
  for (const w of words) {
    const bare = w.replace(/[^a-z]/g, "");
    if (SPECIFIC_WORDS.has(bare)) specificHits++;
  }

  const hasCodeFence = raw.includes("```");
  const hasFilePath = /[\w-]+\.[a-z]{1,5}\b/.test(lower) || /\/[\w-]+/.test(raw);
  const hasNumbers = /\d/.test(raw);

  // Build quality from transparent, additive signals.
  let quality = 0.15;
  quality += Math.min(wordCount / 40, 1) * 0.4; // detail / context
  quality += Math.min(specificHits / 4, 1) * 0.2; // concrete vocabulary
  if (hasCodeFence) quality += 0.15;
  if (hasFilePath) quality += 0.1;
  if (hasNumbers) quality += 0.05;
  quality -= vagueHits * 0.4; // lazy asks
  if (wordCount > 0 && wordCount <= 4 && specificHits === 0) quality -= 0.3; // terse & empty

  quality = clamp01(quality);

  const tier: FoodTier =
    quality >= 0.75 ? "gourmet" : quality >= 0.5 ? "balanced" : quality >= 0.25 ? "snack" : "junk";

  const status: AppraisalStatus =
    vagueHits > 0 || (wordCount > 0 && wordCount <= 4 && specificHits === 0)
      ? "confused"
      : quality >= 0.7
        ? "satisfied"
        : quality >= 0.45
          ? "content"
          : "meh";

  // A great prompt is a hearty meal; junk barely registers.
  const fill = round2(quality * 0.7);

  return { tier, fill, status, quality: round2(quality) };
}
