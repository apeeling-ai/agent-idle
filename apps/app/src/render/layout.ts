/**
 * The world layout — pure, renderer-agnostic placement of the whole menagerie inside ONE
 * shared, bounded area built from fixed ACTION ROOMS. No Pixi, no DOM, no Tauri.
 *
 * The world is a little floor-plan of rooms on a grid: a mine, a lumber yard, a camp, a pond,
 * and a graveyard. A pet stands in the room matching what it's doing (see `zoneForView`):
 * mining in the mine, fishing at the pond, idling at the camp, lying in the graveyard once it
 * dies. When its action
 * changes the renderer walks it from its old room to the new one. The PLAYER stands prominent
 * at its home spot up top, overseeing the whole floor-plan.
 *
 * Placement is a PURE function of (agent id, zone) — nothing else. Not array order, not how
 * many pets share the room, not wall-clock. Two consequences:
 *  - Stability: a pet keeps its exact spot across activity-only ticks and as neighbours come
 *    and go; it only moves when its OWN zone changes (then the renderer walks it there).
 *  - Multi-machine consistency: because the agent id and its zone are synced through Convex and
 *    the math is deterministic, every machine derives the IDENTICAL coordinate locally. Coords
 *    are never written or synced — no machine can clobber another's. (Same idea as the pure
 *    engine running identically everywhere; positions are presentation, derived not stored.)
 * A final clamp guarantees nothing — pet or room — leaves the bounds.
 */

import { hashSeed } from "./compositor";
import type { ZoneId } from "./compositor";

export interface Area {
  width: number;
  height: number;
}

/** An anchor (feet/center) in area pixels, the scale the slot renders at, and the direction the
 * pet faces while working in this zone (+1 right / -1 left) so its swing lands on the prop. */
export interface Placement {
  x: number;
  y: number;
  scale: number;
  face: number;
}

/** A room the renderer draws as an always-present fixture: a framed floor patch (w×h centered
 * on x,y) with its station prop, and pets clustered inside. */
export interface ZonePlacement {
  id: ZoneId;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Prop scale (the boulder / tree / campfire / grave). */
  scale: number;
}

/** What a single creature carries into the layout: its key + the zone it's currently in. The
 * first entry (index 0) is the player and is placed at its home spot regardless of zone. */
export interface CreatureZone {
  key: string;
  zone: ZoneId;
}

export interface WorldLayout {
  area: Area;
  positions: Map<string, Placement>;
  zones: ZonePlacement[];
}

/** The fixed world the ambient window shows. 4:3 reads well as a desktop overlay. */
export const WORLD_AREA: Area = { width: 480, height: 360 };

/** Nominal agent footprint at scale 1 (matches the renderer's SPRITE_PX). */
export const BASE_SPRITE = 64;

/** The clearing footprint (matches the baked terrain patches) carried on each ZonePlacement. */
const ROOM_W = 156;
const ROOM_H = 108;
/** The campfire prop scale. */
const PROP_SCALE = 0.82;

/** Player home: standing on the porch of the cabin baked at top-centre. y is set so the
 * sprite's FEET (center + BASE_SPRITE/2) land on the porch ground line (PORCH_Y=128 in
 * scripts/bake-world-scene.py): (128 − 32) / 360 ≈ 0.267. */
const PLAYER_FRAC = { x: 0.5, y: 0.267 };
const PLAYER_SCALE = 1;
const PET_SCALE = 1;

/** Keep pets off the hard edge. */
const MARGIN = 6;
/** Pets gather in a TIGHT cluster at the work spot (so they're all beside the prop, not spread
 * across the clearing swinging at air). A small box, hashed per id → stable + identical per machine. */
const CLUSTER_W = 30;
const CLUSTER_H = 16;

/**
 * Each zone's WORK SPOT — the pet cluster center (fraction of the area) + the facing toward its
 * prop. These MUST match CLUSTERS in scripts/bake-world-scene.py: the prop is baked just to the
 * right of this spot, so a pet standing here facing right swings onto the boulder / tree.
 */
const ZONE_CLUSTER: Record<ZoneId, { x: number; y: number; face: number }> = {
  mine: { x: 84 / 480, y: 150 / 360, face: 1 },
  lumber: { x: 392 / 480, y: 150 / 360, face: 1 },
  camp: { x: 150 / 480, y: 285 / 360, face: 1 },
  rest: { x: 336 / 480, y: 285 / 360, face: 1 },
  pond: { x: 44 / 480, y: 238 / 360, face: 1 }, // front bank of the baked pond (center POND=52,232 in bake-world-scene.py) — read/web → fishing, rod casts right onto the water
};

/** The rooms the baked world is divided into — every place a pet can stand and work, in render
 * order. All are painted into the backdrop (bake-world-scene.py); this list drives the live
 * camp fire (renderer-pixi) and the hover descriptions (PixiStage). */
const VISIBLE_ZONES: readonly ZoneId[] = ["mine", "lumber", "camp", "pond", "rest"];

/** Per-room footprint override. Most rooms share the clearing box (ROOM_W×ROOM_H); the pond is
 * the smaller baked water+bank, so its hover box hugs the water instead of the whole quadrant. */
const ROOM_SIZE: Partial<Record<ZoneId, { w: number; h: number }>> = {
  pond: { w: 116, h: 88 },
};

/** Human-readable blurb for each room, surfaced as a hover tooltip so the diorama explains
 * itself: which agent action sends a pet here and what it's doing. Pure text — no DOM. */
export interface ZoneInfo {
  title: string;
  desc: string;
}
export const ZONE_INFO: Record<ZoneId, ZoneInfo> = {
  mine: { title: "The Mine", desc: "Running shell commands — swinging a pickaxe for tokens." },
  lumber: { title: "The Lumber Yard", desc: "Writing & editing code — chopping wood." },
  camp: { title: "The Camp", desc: "Idle between turns — resting by the fire." },
  pond: { title: "The Pond", desc: "Reading, searching & browsing the web — casting a line at the water." },
  rest: { title: "The Graveyard", desc: "Drained or fainted — resting here until they recover." },
};

/** Clickable region over the baked cabin at top-centre (the player's home) — clicking it opens
 * the stats dashboard. Fractions of the area; sized to cover the cabin down to its porch line
 * (PORCH_Y=128 in scripts/bake-world-scene.py) without overlapping the work rooms below. */
export const HOUSE_BOX = { x: 0.5, y: 0.18, w: 0.42, h: 0.36 } as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Hash a key to two independent unit fractions in [0, 1]. Deterministic per key. */
function hashUnit(key: string): { u: number; v: number } {
  const h = hashSeed(key);
  return { u: (h & 0xffff) / 0xffff, v: ((h >>> 16) & 0xffff) / 0xffff };
}

/**
 * Compute placements for the whole menagerie. The first creature is the PLAYER (home spot);
 * the rest stand in their room, clustered in its lower half (in front of the station). Pure
 * and deterministic: same (creatures, area) → identical layout.
 */
export function worldLayout(creatures: CreatureZone[], area: Area): WorldLayout {
  const positions = new Map<string, Placement>();

  const zones: ZonePlacement[] = VISIBLE_ZONES.map((id) => ({
    id,
    x: ZONE_CLUSTER[id].x * area.width,
    y: ZONE_CLUSTER[id].y * area.height,
    w: ROOM_SIZE[id]?.w ?? ROOM_W,
    h: ROOM_SIZE[id]?.h ?? ROOM_H,
    scale: PROP_SCALE,
  }));

  if (creatures.length === 0) return { area, positions, zones };

  const [player, ...pets] = creatures;
  positions.set(player.key, {
    x: clamp(PLAYER_FRAC.x * area.width, MARGIN, area.width - MARGIN),
    y: clamp(PLAYER_FRAC.y * area.height, MARGIN, area.height - MARGIN),
    scale: PLAYER_SCALE,
    face: 1,
  });

  // Each pet stands at a hashed point in its zone's TIGHT work cluster, facing its prop — pure
  // (id, zone), so stable and identical on every machine.
  for (const pet of pets) {
    const c = ZONE_CLUSTER[pet.zone] ?? ZONE_CLUSTER.camp;
    const ax = c.x * area.width;
    const ay = c.y * area.height;
    const { u, v } = hashUnit(pet.key);
    const x = clamp(ax + (u - 0.5) * CLUSTER_W, MARGIN, area.width - MARGIN);
    const y = clamp(ay + (v - 0.5) * CLUSTER_H, MARGIN, area.height - MARGIN);
    positions.set(pet.key, { x, y, scale: PET_SCALE, face: c.face });
  }

  return { area, positions, zones };
}
