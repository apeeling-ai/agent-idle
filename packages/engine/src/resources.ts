/**
 * Entity resources. Today this is just `fullness` (the inverse of hunger), but the
 * shape is deliberately an object so tokens / streak / other meters can join later
 * without changing call sites.
 */

export interface Resources {
  /** 0 = empty/starving, 1 = completely full. Drains over time (see decay.ts). */
  fullness: number;
}

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function newResources(): Resources {
  return { fullness: 1 };
}

/** Convenience: hunger is the inverse of fullness. */
export function hunger(resources: Resources): number {
  return clamp01(1 - resources.fullness);
}
