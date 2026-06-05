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
    // The "working" action set — the compositor picks one per pet so the menagerie
    // isn't all swinging the same pickaxe (see WORKING_ANIMATIONS in compositor.ts).
    mine: frame("Crush_Base/Crush_Side-Sheet.png", 10), // pickaxe swing
    hit: frame("Hit_Base/Hit_Side-Sheet.png", 10),
    collect: frame("Collect_Base/Collect_Side-Sheet.png", 10),
    pierce: frame("Pierce_Base/Pierce_Side-Sheet.png", 10),
    slice: frame("Slice_Base/Slice_Side-Sheet.png", 10),
    death: frame("Death_Base/Death_Side-Sheet.png", 6),
  },
};

/**
 * Pixel Crawler NPC bodies (Knight / Rogue / Wizard) — armor and robes are baked into the
 * art, so a pet rendered as its species looks properly equipped. They ship only idle / run
 * / death, so the "working" actions reuse the run cycle (an active pet looks busy) and
 * anything else falls back to idle. Frame sizes differ per sheet (idle/death 32², run 64²)
 * but the renderer scales every frame to a common height, so they line up on screen.
 */
function npcSet(folder: string): SpriteSheetSet {
  const at = (sub: string, size: number, fps: number): AnimationSpec => ({
    sheet: `Entities/Npc's/${folder}/${sub}`,
    frameWidth: size,
    frameHeight: size,
    fps,
  });
  const run = at("Run/Run-Sheet.png", 64, 10);
  return {
    fallback: "idle",
    animations: {
      idle: at("Idle/Idle-Sheet.png", 32, 6),
      run,
      death: at("Death/Death-Sheet.png", 32, 6),
      mine: run, // no NPC work sheets — reuse run so an active pet reads as "busy"
      collect: run,
      slice: run,
    },
  };
}

/** Keyed by base-sprite key. The compositor's base layer uses the pet's `species`; `hero`
 * (the Body_A character) stays available for the dev harness / future use. */
export const CHARACTER_SHEETS: Record<string, SpriteSheetSet> = {
  [CHARACTER]: heroSet,
  knight: npcSet("Knight"),
  rogue: npcSet("Rogue"),
  wizard: npcSet("Wizzard"), // folder is misspelled in the pack
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
