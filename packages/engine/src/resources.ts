/**
 * Entity resources. Today this is just `energy` (how charged a session-pet is), but
 * the shape is deliberately an object so tokens / streak / other meters can join later
 * without changing call sites.
 */

export interface Resources {
  /** 0 = drained, 1 = fully energized. Drains over time when idle (see decay.ts). */
  energy: number;
}

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function newResources(): Resources {
  return { energy: 1 };
}
