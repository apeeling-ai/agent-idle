/**
 * Sprite manifest for the Pixel Crawler pack (by Anokolisa, in repo `sprites/`).
 *
 * Pure data + a pure slicing helper — NO Pixi here. The Pixi renderer loads the
 * sheets and uses `sliceFrames` to cut them by the pack's grid.
 *
 * We render ONE character — the `Body_A` hero — for both the player and every pet,
 * because it is the only body in the pack with a full action set (notably a mining
 * swing, `Crush`). The engine still tracks `species` per pet; that can return later as
 * a tint / weapon overlay. All Body_A side-facing sheets are 64×64 frames:
 *   Idle_Side   256×64 → ×4
 *   Run_Side    384×64 → ×6
 *   Crush_Side  512×64 → ×8   (the "mining" swing)
 *   Death_Side  512×64 → ×8
 * Frame COUNT is derived from the loaded texture width, so per-animation differences
 * are tolerated.
 */

import type { AnimationName } from "./compositor";

/** Served by Vite from /sprites (symlinked to the repo `sprites/` folder). */
export const SPRITE_BASE = "/sprites";

/** The single character key used by the compositor's base layer. */
export const CHARACTER = "hero";

export interface AnimationSpec {
  /** Path under SPRITE_BASE. Will be URI-encoded by the loader (folders have spaces/apostrophes). */
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  fps: number;
}

export interface SpriteSheetSet {
  animations: Partial<Record<AnimationName, AnimationSpec>>;
  /** Animation to use when a requested one is missing from this set. */
  fallback: AnimationName;
}

const BODY_A = "Entities/Characters/Body_A/Animations";
const frame = (sheet: string, fps: number): AnimationSpec => ({
  sheet: `${BODY_A}/${sheet}`,
  frameWidth: 64,
  frameHeight: 64,
  fps,
});

const heroSet: SpriteSheetSet = {
  fallback: "idle",
  animations: {
    idle: frame("Idle_Base/Idle_Side-Sheet.png", 6),
    run: frame("Run_Base/Run_Side-Sheet.png", 10),
    mine: frame("Crush_Base/Crush_Side-Sheet.png", 10), // the working / mining swing
    death: frame("Death_Base/Death_Side-Sheet.png", 6),
  },
};

/** Keyed by character id. One entry today: the shared `hero` body. */
export const CHARACTER_SHEETS: Record<string, SpriteSheetSet> = {
  [CHARACTER]: heroSet,
};

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cut a single-row sheet into frames by its grid. Pure. */
export function sliceFrames(sheetWidth: number, spec: AnimationSpec): Frame[] {
  const count = Math.max(1, Math.floor(sheetWidth / spec.frameWidth));
  return Array.from({ length: count }, (_, i) => ({
    x: i * spec.frameWidth,
    y: 0,
    w: spec.frameWidth,
    h: spec.frameHeight,
  }));
}

/** Resolve a requested animation against a set, applying the fallback. */
export function resolveAnimation(set: SpriteSheetSet, name: AnimationName): AnimationSpec {
  return set.animations[name] ?? set.animations[set.fallback] ?? set.animations.idle!;
}

/** Build a loadable, URI-encoded URL for a sheet path. */
export function sheetUrl(sheet: string): string {
  return `${SPRITE_BASE}/${sheet.split("/").map(encodeURIComponent).join("/")}`;
}
