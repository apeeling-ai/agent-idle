/**
 * Sprite manifest for the Pixel Crawler pack (by Anokolisa, in repo `sprites/`).
 *
 * Pure data + a pure slicing helper — NO Pixi here. The Pixi renderer loads the
 * sheets and uses `sliceFrames` to cut them by the pack's grid.
 *
 * The NPC sets (Knight / Wizzard / Rogue) map onto our three species and ship Idle /
 * Run / Death sheets. Verified frame grids (via sips):
 *   Idle  128×32  → 32×32 frames (×4)
 *   Run   384×64  → 64×64 frames (×6)
 *   Death 288×32  → 32×32 frames (×9)
 * Frame COUNT is derived from the loaded texture width, so per-species differences
 * are tolerated. walk/hit/collect are not in the NPC sets → they fall back to idle
 * (see resolveAnimation). TODO: source those from Characters/Body_A if needed.
 */

import type { Species } from "@agent-idle/engine";
import type { AnimationName } from "./compositor";

/** Served by Vite from /sprites (symlinked to the repo `sprites/` folder). */
export const SPRITE_BASE = "/sprites";

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

const npcSet = (folder: string): SpriteSheetSet => ({
  fallback: "idle",
  animations: {
    idle: { sheet: `Entities/Npc's/${folder}/Idle/Idle-Sheet.png`, frameWidth: 32, frameHeight: 32, fps: 6 },
    run: { sheet: `Entities/Npc's/${folder}/Run/Run-Sheet.png`, frameWidth: 64, frameHeight: 64, fps: 10 },
    death: { sheet: `Entities/Npc's/${folder}/Death/Death-Sheet.png`, frameWidth: 32, frameHeight: 32, fps: 8 },
  },
});

export const SPECIES_SHEETS: Record<Species, SpriteSheetSet> = {
  knight: npcSet("Knight"),
  wizard: npcSet("Wizzard"), // pack spelling
  rogue: npcSet("Rogue"),
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
