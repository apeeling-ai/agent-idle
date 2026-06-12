/**
 * Dev gallery manifest — a catalogue of every renderable asset + game enum, for the
 * `?gallery` browser (see DevGallery.tsx). DEV-ONLY and self-contained: it intentionally
 * does NOT import the game's compositor/sprites so the gallery can show assets the game
 * doesn't currently wire up (walk, carry, watering, mobs, spare props). Data verified by
 * sips/PIL inventory. Paths are repo-relative (start with `sprites/`); assetUrl() turns
 * them into the Vite-served `/sprites/...` URL.
 */

/** One animation strip (single horizontal row of `frames` cells of frameW×frameH). */
export interface Anim {
  name: string;
  sheet: string;
  frameW: number;
  frameH: number;
  frames: number;
  fps: number;
}

export interface Body {
  key: string;
  label: string;
  group: "worker" | "npc" | "mob";
  animations: Anim[];
}

/** A static (or short animated) crop of an atlas — a ground pad or a scene prop. */
export interface Crop {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** >1 ⇒ an animated left-to-right strip starting at (x,y). */
  frames?: number;
  fps?: number;
}

export interface Zone {
  id: string;
  label: string;
  blurb: string;
  ground: Crop;
  prop: (Crop & { label?: string }) | null;
}

// ---------------------------------------------------------------------------
// Bodies & their animations
// ---------------------------------------------------------------------------

export const BODIES: Body[] = [
  {
    key: "hero",
    label: "Worker (Body_A)",
    group: "worker",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Characters/Body_A/Animations/Idle_Base/Idle_Side-Sheet.png", frameW: 64, frameH: 64, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Characters/Body_A/Animations/Run_Base/Run_Side-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "walk", sheet: "sprites/Entities/Characters/Body_A/Animations/Walk_Base/Walk_Side-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 8 },
      { name: "mine (crush)", sheet: "sprites/Entities/Characters/Body_A/Animations/Crush_Base/Crush_Side-Sheet.png", frameW: 64, frameH: 64, frames: 8, fps: 10 },
      { name: "collect", sheet: "sprites/Entities/Characters/Body_A/Animations/Collect_Base/Collect_Side-Sheet.png", frameW: 64, frameH: 64, frames: 8, fps: 10 },
      { name: "slice (chop)", sheet: "sprites/Entities/Characters/Body_A/Animations/Slice_Base/Slice_Side-Sheet.png", frameW: 64, frameH: 64, frames: 8, fps: 10 },
      { name: "pierce", sheet: "sprites/Entities/Characters/Body_A/Animations/Pierce_Base/Pierce_Side-Sheet.png", frameW: 64, frameH: 64, frames: 8, fps: 10 },
      { name: "hit", sheet: "sprites/Entities/Characters/Body_A/Animations/Hit_Base/Hit_Side-Sheet.png", frameW: 64, frameH: 64, frames: 4, fps: 10 },
      { name: "fishing", sheet: "sprites/Entities/Characters/Body_A/Animations/Fishing_Base/Fishing_Side-Sheet.png", frameW: 64, frameH: 64, frames: 8, fps: 8 },
      { name: "watering", sheet: "sprites/Entities/Characters/Body_A/Animations/Watering_Base/Watering_Side-Sheet.png", frameW: 64, frameH: 64, frames: 8, fps: 8 },
      { name: "carry_idle", sheet: "sprites/Entities/Characters/Body_A/Animations/Carry_Idle/Carry_Idle_Side-Sheet.png", frameW: 64, frameH: 64, frames: 4, fps: 8 },
      { name: "carry_run", sheet: "sprites/Entities/Characters/Body_A/Animations/Carry_Run/Carry_Run_Side-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "carry_walk", sheet: "sprites/Entities/Characters/Body_A/Animations/Carry_Walk/Carry_Walk_Side-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 8 },
      { name: "death", sheet: "sprites/Entities/Characters/Body_A/Animations/Death_Base/Death_Side-Sheet.png", frameW: 64, frameH: 64, frames: 8, fps: 6 },
    ],
  },
  {
    key: "knight",
    label: "Knight",
    group: "npc",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Npc's/Knight/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Npc's/Knight/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Npc's/Knight/Death/Death-Sheet.png", frameW: 32, frameH: 32, frames: 9, fps: 6 },
    ],
  },
  {
    key: "rogue",
    label: "Rogue",
    group: "npc",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Npc's/Rogue/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Npc's/Rogue/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Npc's/Rogue/Death/Death-Sheet.png", frameW: 32, frameH: 32, frames: 12, fps: 6 },
    ],
  },
  {
    key: "wizard",
    label: "Wizard",
    group: "npc",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Npc's/Wizzard/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Npc's/Wizzard/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Npc's/Wizzard/Death/Death-Sheet.png", frameW: 32, frameH: 32, frames: 12, fps: 6 },
    ],
  },
  {
    key: "orc",
    label: "Orc",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Orc Crew/Orc/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Orc Crew/Orc/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Orc Crew/Orc/Death/Death-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 6 },
    ],
  },
  {
    key: "orc_warrior",
    label: "Orc Warrior",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Warrior/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Warrior/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Warrior/Death/Death-Sheet.png", frameW: 80, frameH: 80, frames: 7, fps: 6 },
    ],
  },
  {
    key: "orc_rogue",
    label: "Orc Rogue",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Rogue/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Rogue/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Rogue/Death/Death-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 6 },
    ],
  },
  {
    key: "orc_shaman",
    label: "Orc Shaman",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Shaman/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Shaman/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Orc Crew/Orc - Shaman/Death/Death-Sheet.png", frameW: 64, frameH: 64, frames: 7, fps: 6 },
    ],
  },
  {
    key: "skeleton",
    label: "Skeleton",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Base/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Base/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Base/Death/Death-Sheet.png", frameW: 64, frameH: 64, frames: 12, fps: 6 },
    ],
  },
  {
    key: "skeleton_warrior",
    label: "Skeleton Warrior",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Warrior/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Warrior/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Warrior/Death/Death-Sheet.png", frameW: 48, frameH: 48, frames: 8, fps: 6 },
    ],
  },
  {
    key: "skeleton_rogue",
    label: "Skeleton Rogue",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Rogue/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Rogue/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Rogue/Death/Death-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 6 },
    ],
  },
  {
    key: "skeleton_mage",
    label: "Skeleton Mage",
    group: "mob",
    animations: [
      { name: "idle", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Mage/Idle/Idle-Sheet.png", frameW: 32, frameH: 32, frames: 4, fps: 6 },
      { name: "run", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Mage/Run/Run-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 10 },
      { name: "death", sheet: "sprites/Entities/Mobs/Skeleton Crew/Skeleton - Mage/Death/Death-Sheet.png", frameW: 64, frameH: 64, frames: 6, fps: 6 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Zones (live in the game today) — ground pad + scene prop
// ---------------------------------------------------------------------------

export const ZONES: Zone[] = [
  {
    id: "mine",
    label: "Mine",
    blurb: "Actively producing → swings a pickaxe at a boulder.",
    ground: { sheet: "sprites/Environment/Tilesets/Dungeon_Tiles.png", x: 64, y: 0, w: 48, h: 48 },
    prop: { sheet: "sprites/Environment/Props/Static/Rocks.png", x: 0, y: 16, w: 32, h: 48, label: "boulder" },
  },
  {
    id: "lumber",
    label: "Lumber",
    blurb: "Chopping (Slice) → fells a tree on the sawmill floor.",
    ground: { sheet: "sprites/Environment/Structures/Buildings/Floors.png", x: 0, y: 0, w: 48, h: 48 },
    prop: { sheet: "sprites/Environment/Props/Static/Trees/Model_03/Size_02.png", x: 0, y: 5, w: 30, h: 75, label: "tree" },
  },
  {
    id: "camp",
    label: "Camp (player)",
    blurb: "The player rests at the hearth (the home base).",
    ground: { sheet: "sprites/Environment/Structures/Buildings/Floors.png", x: 0, y: 0, w: 48, h: 48 },
    prop: { sheet: "sprites/Environment/Structures/Stations/Bonfire/Bonfire_01-Sheet.png", x: 0, y: 0, w: 32, h: 32, frames: 4, fps: 6, label: "bonfire (animated)" },
  },
  {
    id: "pond",
    label: "Pond",
    blurb: "Reading, searching & web → casts a line at the pond.",
    ground: { sheet: "sprites/Environment/Tilesets/Water_tiles.png", x: 2, y: 2, w: 92, h: 80 },
    prop: null,
  },
  {
    id: "rest",
    label: "Rest",
    blurb: "Fainted or down → a bare stone spot, no prop.",
    ground: { sheet: "sprites/Environment/Tilesets/Dungeon_Tiles.png", x: 64, y: 0, w: 48, h: 48 },
    prop: null,
  },
];

/** Which body animation each zone shows when occupied by a worker (for the zone previews). */
export const ZONE_ANIM: Record<string, string> = {
  mine: "mine (crush)",
  lumber: "slice (chop)",
  camp: "idle",
  pond: "fishing",
  rest: "death",
};

// ---------------------------------------------------------------------------
// Spare assets not yet used by any zone — the "what else we could build" shelf
// ---------------------------------------------------------------------------

export const MORE_GROUNDS: (Crop & { label: string })[] = [
  { label: "Cobblestone (cool grey)", sheet: "sprites/Environment/Tilesets/Floors_Tiles.png", x: 0, y: 352, w: 48, h: 48 },
  { label: "Packed earth (warm)", sheet: "sprites/Environment/Tilesets/Floors_Tiles.png", x: 0, y: 384, w: 48, h: 32 },
  { label: "Sand / desert", sheet: "sprites/Environment/Tilesets/Floors_Tiles.png", x: 128, y: 352, w: 48, h: 48 },
  { label: "Dungeon teal stone", sheet: "sprites/Environment/Tilesets/Dungeon_Tiles.png", x: 64, y: 16, w: 48, h: 48 },
  { label: "Deep water", sheet: "sprites/Environment/Tilesets/Water_tiles.png", x: 160, y: 0, w: 48, h: 48 },
  { label: "Wood planks", sheet: "sprites/Environment/Structures/Buildings/Floors.png", x: 0, y: 0, w: 48, h: 48 },
];

export const MORE_PROPS: (Crop & { label: string })[] = [
  { label: "Anvil (smithing)", sheet: "sprites/Environment/Structures/Stations/Anvil/Anvil.png", x: 176, y: 14, w: 96, h: 82 },
  { label: "Furnace / forge", sheet: "sprites/Environment/Structures/Stations/Furnace/Furnace.png", x: 112, y: 68, w: 77, h: 124 },
  { label: "Sawmill base", sheet: "sprites/Environment/Structures/Stations/Sawmill/Base.png", x: 144, y: 1, w: 112, h: 75 },
  { label: "Workbench", sheet: "sprites/Environment/Structures/Stations/Workbench/Workbench.png", x: 112, y: 1, w: 64, h: 60 },
  { label: "Bonfire (animated)", sheet: "sprites/Environment/Structures/Stations/Bonfire/Bonfire_01-Sheet.png", x: 0, y: 0, w: 32, h: 32, frames: 4, fps: 6 },
  { label: "Pine tree", sheet: "sprites/Environment/Props/Static/Trees/Model_03/Size_02.png", x: 0, y: 5, w: 30, h: 75 },
  { label: "Tall bush", sheet: "sprites/Environment/Props/Static/Vegetation.png", x: 3, y: 32, w: 42, h: 64 },
  { label: "Round shrub", sheet: "sprites/Environment/Props/Static/Vegetation.png", x: 2, y: 99, w: 43, h: 43 },
  { label: "Boulder cluster", sheet: "sprites/Environment/Props/Static/Rocks.png", x: 2, y: 19, w: 28, h: 43 },
  { label: "Small rock", sheet: "sprites/Environment/Props/Static/Rocks.png", x: 35, y: 19, w: 26, h: 27 },
  { label: "Supply sack", sheet: "sprites/Environment/Props/Static/Resources.png", x: 11, y: 20, w: 31, h: 18 },
  { label: "Farm crop bed", sheet: "sprites/Environment/Props/Static/Farm.png", x: 144, y: 102, w: 32, h: 26 },
  { label: "Pumpkin", sheet: "sprites/Environment/Props/Static/Farm.png", x: 352, y: 112, w: 32, h: 32 },
];

// ---------------------------------------------------------------------------
// Sounds, palette, states, cosmetics (game enums)
// ---------------------------------------------------------------------------

export const SOUNDS: { key: "workDone" | "coin"; label: string; desc: string }[] = [
  { key: "workDone", label: "Work done", desc: "Peon \"Work, work.\" — a session finished working (real .wav)." },
  { key: "coin", label: "Coin", desc: "Bright two-note cha-ching — tokens flew to the player (WebAudio)." },
];

/** The per-pet recolour palette (Pixi multiply tint). Shown as swatches; the gallery's
 * CSS sprites are NOT tinted (tint is a GPU multiply applied in-game per pet). */
export const TINTS = ["#ff6b6b", "#ffd166", "#06d6a0", "#4dabf7", "#b197fc", "#ffa94d", "#f783ac", "#63e6be"];

export const LIVENESS: { status: string; desc: string }[] = [
  { status: "lively", desc: "Full energy — normal." },
  { status: "weary", desc: "Energy below ~66% — getting tired." },
  { status: "drained", desc: "Energy low (below ~33%) — a red tint overlays the body." },
  { status: "fainted", desc: "Energy hit 0 — the down/death pose; recoverable by using the session." },
  { status: "dead", desc: "Past the grace window — down pose; revives (gets up) when the session is used again." },
];

export const COSMETICS: { id: string; label: string; layer: string; requires: string }[] = [
  { id: "helm.bronze", label: "Bronze Helm", layer: "head", requires: "tokensFed ≥ 50,000" },
  { id: "helm.iron", label: "Iron Helm", layer: "head", requires: "tokensFed ≥ 250,000" },
  { id: "aura.streak", label: "Streak Aura", layer: "aura", requires: "survivalStreakDays ≥ 7" },
  { id: "cape.explorer", label: "Explorer Cape", layer: "(unmapped)", requires: "zoneAchievements ≥ 3" },
];

/** Repo-relative `sprites/...` path → the Vite-served URL (the `/sprites` symlink). */
export function assetUrl(path: string): string {
  return "/" + path.split("/").map(encodeURIComponent).join("/");
}
