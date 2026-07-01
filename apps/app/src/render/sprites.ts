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

/**
 * Base URL for sprite sheets. Served from `/sprites` (Vite symlink to the repo `sprites/` folder
 * in dev; embedded in the bundle otherwise).
 *
 * Qualified with the document ORIGIN rather than left as a bare absolute path: inside a Tauri
 * mobile (iOS) webview the page is served from a custom scheme (`tauri://localhost`), and Pixi's
 * asset loader resolves a bare `/sprites/x.png` to `tauri://sprites/x.png` — it treats `sprites`
 * as the host and the texture 404s, killing the whole renderer. Prefixing the origin
 * (`tauri://localhost/sprites/...`) leaves no host to lose, and is correct on web/desktop too
 * (`http://localhost:1420/sprites`, etc.). Falls back to the bare path in non-DOM contexts (tests). */
const ORIGIN =
  typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
    ? window.location.origin
    : "";
export const SPRITE_BASE = `${ORIGIN}/sprites`;

/** The single character key used by the compositor's base layer. */
export const CHARACTER = "hero";

export interface AnimationSpec {
  /** Path under SPRITE_BASE. Will be URI-encoded by the loader (folders have spaces/apostrophes). */
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  /** Left/top origin of the first frame (default 0,0). Lets a spec crop a sub-rect out of
   * a dense Environment atlas instead of assuming a row starting at the top-left. */
  x?: number;
  y?: number;
  /** Explicit frame count. Omitted ⇒ derived from sheet width (the character strips). Set
   * it for single-tile atlas crops (frames: 1) and short animated prop loops. */
  frames?: number;
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
    // The resting/"between turns" action — a pet casts a line ("fishing for new ideas").
    fishing: frame("Fishing_Base/Fishing_Side-Sheet.png", 7),
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

/**
 * LPC player gear (sprites/lpc/, built by scripts/bake-player-assets.py from the local LPC clone).
 * The PLAYER is an LPC paper-doll: an `lpc.body` base (body + head baked together) with
 * frame-aligned armor / helm / weapon layers stacked on top, keyed by the engine's cosmetic ids
 * (e.g. "armor.plate") so cosmeticForLayer resolves straight to a sheet. Each layer sheet is
 * 128×256 = 2 frames × 4 directions (64² cells, order N/W/S/E); we crop the SOUTH row (y=128),
 * 2 frames, for a front-facing idle. Each weapon rung is a DISTINCT baked weapon (dagger →
 * glowblade); aura has no art yet (renders empty).
 */
const LPC_DIR = "lpc";
const lpcIdle = (path: string): SpriteSheetSet => ({
  fallback: "idle",
  animations: { idle: { sheet: `${LPC_DIR}/${path}`, frameWidth: 64, frameHeight: 64, x: 0, y: 128, frames: 2, fps: 3 } },
});
export const LPC_SHEETS: Record<string, SpriteSheetSet> = {
  "lpc.body": lpcIdle("body/idle.png"),
  // Armor tiers (cloth → leather → chain → plate → legion) — distinct per-tier art.
  "armor.cloth": lpcIdle("armor/cloth.png"),
  "armor.leather": lpcIdle("armor/leather.png"),
  "armor.chain": lpcIdle("armor/chain.png"),
  "armor.plate": lpcIdle("armor/plate.png"),
  "armor.legion": lpcIdle("armor/legion.png"),
  // Legs (pants) tiers (cloth → hose → studded → greaves → legion skirt) — drawn under the torso.
  "legs.cloth": lpcIdle("legs/cloth.png"),
  "legs.hose": lpcIdle("legs/hose.png"),
  "legs.studded": lpcIdle("legs/studded.png"),
  "legs.greaves": lpcIdle("legs/greaves.png"),
  "legs.legion": lpcIdle("legs/legion.png"),
  // Helm tiers (nasal → norman → barbuta → greathelm → legion).
  "helm.nasal": lpcIdle("helm/nasal.png"),
  "helm.norman": lpcIdle("helm/norman.png"),
  "helm.barbuta": lpcIdle("helm/barbuta.png"),
  "helm.greathelm": lpcIdle("helm/greathelm.png"),
  "helm.legion": lpcIdle("helm/legion.png"),
  // Weapon tiers — DISTINCT baked weapons (dagger → saber → longsword → rapier → glowblade),
  // see scripts/bake-player-assets.py.
  "weapon.bronze": lpcIdle("weapon/bronze.png"),
  "weapon.iron": lpcIdle("weapon/iron.png"),
  "weapon.steel": lpcIdle("weapon/steel.png"),
  "weapon.mithril": lpcIdle("weapon/mithril.png"),
  "weapon.prismatic": lpcIdle("weapon/prismatic.png"),
  // Aura tiers — procedural glow halos drawn BEHIND the hero (spark → flame → radiant).
  "aura.spark": lpcIdle("aura/spark.png"),
  "aura.flame": lpcIdle("aura/flame.png"),
  "aura.radiant": lpcIdle("aura/radiant.png"),
};

/**
 * Diorama layers — the ground pad + scene prop that turn a floating pet into a little
 * "zone" (see compositor `zoneForView`). They reuse the AnimationSpec shape but crop a
 * sub-rect of an Environment atlas (frames: 1) or play a short animated prop loop (the
 * bonfire). Same loader as the character sheets; the renderer only PLACES ground/scene
 * layers differently (a wide pad behind the pet, a prop at its feet). Pure data.
 *
 * Sprite keys are namespaced `ground.<zone>` / `scene.<zone>` so they never collide with
 * character keys in the renderer's one shared cache. A zone with no scene entry (`rest`)
 * simply has no prop.
 */
const ENV = "Environment";

/** A single cropped tile/prop from an atlas. */
const crop = (sheet: string, x: number, y: number, w: number, h: number): AnimationSpec => ({
  sheet: `${ENV}/${sheet}`,
  frameWidth: w,
  frameHeight: h,
  fps: 1,
  x,
  y,
  frames: 1,
});

/** A short animated prop strip (horizontal frames of w×h from the top-left). */
const animProp = (sheet: string, w: number, h: number, frames: number): AnimationSpec => ({
  sheet: `${ENV}/${sheet}`,
  frameWidth: w,
  frameHeight: h,
  fps: 6,
  x: 0,
  y: 0,
  frames,
});

/** Wrap a single spec as an idle-only set (ground pads + scene props never animate by
 * AnimationName — they're keyed per zone, so one `idle` entry is all the loader needs). */
const envSet = (spec: AnimationSpec): SpriteSheetSet => ({ fallback: "idle", animations: { idle: spec } });

/**
 * Ground pads + scene props per diorama zone. Crops are pinned to clean, isolated regions
 * of the pack's atlases (verified by alpha bounding-box analysis), so each is a single
 * floor fill / object with no neighbour bleed. Loaded into the same cache as
 * CHARACTER_SHEETS (keys are namespaced). Three distinct floors (stone / wood / sand) read
 * the zones apart; the prop names each one.
 */
export const SCENE_SHEETS: Record<string, SpriteSheetSet> = {
  // Ground floors.
  "ground.mine": envSet(crop("Tilesets/Dungeon_Tiles.png", 64, 0, 48, 48)), // dark dungeon stone
  "ground.rest": envSet(crop("Tilesets/Dungeon_Tiles.png", 64, 0, 48, 48)), // (somber) stone
  "ground.lumber": envSet(crop("Structures/Buildings/Floors.png", 0, 0, 48, 48)), // sawmill wood floor
  "ground.camp": envSet(crop("Structures/Buildings/Floors.png", 0, 0, 48, 48)), // wood planks (hearth)
  "ground.pond": envSet(crop("Tilesets/Water_tiles.png", 2, 2, 92, 80)), // grassy bank ringed by water
  // Scene props — the station/resource that names the zone.
  "scene.mine": envSet(crop("Props/Static/Rocks.png", 0, 16, 32, 48)), // a boulder to mine
  "scene.lumber": envSet(crop("Props/Static/Trees/Model_03/Size_02.png", 0, 5, 30, 75)), // a tree to chop
  "scene.camp": envSet(animProp("Structures/Stations/Bonfire/Bonfire_01-Sheet.png", 32, 32, 4)), // a campfire
  // The graveyard marker — the pack has no gravestone, so a lone boulder on the somber dark
  // stone reads as a grave cairn where downed pets are laid to rest.
  "scene.grave": envSet(crop("Props/Static/Rocks.png", 0, 16, 32, 48)),
};

/**
 * The pre-baked BACKGROUND SCENE — a full 480×450 lush grass map (grass base, soft dirt/stone
 * clearings for the work zones, scattered trees/bushes/flowers/rocks) composed
 * from the pack's tilesets + props by scripts/bake-world-scene.py into /sprites/generated/. The
 * renderer draws this as the world backdrop; pets and the animated campfire render on top.
 * Single frame; its size MUST match the world area (see WORLD_AREA in layout.ts).
 *
 * `world.house` is the cabin baked on its OWN transparent 480×450 layer (same bake script). The
 * renderer draws it as a FOREGROUND overlay (above the pets, below the player) so a pet walking
 * up behind the cabin is occluded by it — depth the flat backdrop can't give.
 */
export const WORLD_SCENE_SHEETS: Record<string, SpriteSheetSet> = {
  "world.scene": envSet({ sheet: "generated/world_scene.png", frameWidth: 480, frameHeight: 450, fps: 1, frames: 1 }),
  "world.house": envSet({ sheet: "generated/world_house.png", frameWidth: 480, frameHeight: 450, fps: 1, frames: 1 }),
};

/**
 * Status-layer overlays — the attention bubble that floats above a pet's head when the agent
 * wants the human (see compositor `statusOverlay`). These are tiny single-frame PNGs authored
 * for this project (NOT from the Pixel Crawler pack), served from /sprites/UI. Loaded into the
 * same cache as the character/scene sheets; keys are namespaced `status.*`. A missing key just
 * leaves the layer empty, so the pipeline degrades gracefully if the art is absent.
 */
const uiTile = (file: string): AnimationSpec => ({ sheet: `UI/${file}`, frameWidth: 32, frameHeight: 32, fps: 1, frames: 1 });
export const STATUS_SHEETS: Record<string, SpriteSheetSet> = {
  "status.question": envSet(uiTile("status_question.png")), // gentle "?" — finished, your turn
  "status.alert": envSet(uiTile("status_alert.png")), // urgent "!" — blocked on a permission prompt
};

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cut a sheet into frames. A single-row character strip derives its count from the sheet
 * width; an atlas crop / animated prop supplies an explicit origin (x,y) and frame count.
 * Pure. */
export function sliceFrames(sheetWidth: number, spec: AnimationSpec): Frame[] {
  const x0 = spec.x ?? 0;
  const y0 = spec.y ?? 0;
  const count = spec.frames ?? Math.max(1, Math.floor(sheetWidth / spec.frameWidth));
  return Array.from({ length: count }, (_, i) => ({
    x: x0 + i * spec.frameWidth,
    y: y0,
    w: spec.frameWidth,
    h: spec.frameHeight,
  }));
}

/** Resolve a requested animation against a set, applying the fallback. */
export function resolveAnimation(set: SpriteSheetSet, name: AnimationName): AnimationSpec {
  return set.animations[name] ?? set.animations[set.fallback] ?? set.animations.idle!;
}

/** Bump when re-baking sprites so clients fetch the new art instead of a cached PNG (Pixi
 * caches textures by URL, and dev servers may HTTP-cache the file). Shared with the menu. */
export const ASSET_VERSION = "15";

/** Build a loadable, URI-encoded URL for a sheet path (cache-busted by ASSET_VERSION). */
export function sheetUrl(sheet: string): string {
  return `${SPRITE_BASE}/${sheet.split("/").map(encodeURIComponent).join("/")}?v=${ASSET_VERSION}`;
}
