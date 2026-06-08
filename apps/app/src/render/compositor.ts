/**
 * The compositor — the renderer-agnostic seam.
 *
 * It owns the LAYER STACK (base → body → head → aura → status) and decides, from an
 * engine state, which sprite/animation each layer should show. It NEVER imports Pixi
 * (or any renderer) and NEVER imports Tauri. ONE compositor drives the live creature,
 * the leaderboard avatars, and the share card — never fork the layer stack.
 *
 * A concrete renderer (see renderer-pixi.ts) implements the `Renderer` interface; the
 * compositor only issues renderer-agnostic draw calls. This module is written so the
 * whole render/ folder lifts into packages/client later without surgery.
 */

import type { ActivityStatus, LivenessStatus, Species } from "@agent-idle/engine";

/** On-screen px size of one creature's SPRITE cell (square). Shared by the renderer
 * (sprite layout) and the React host (label alignment). */
export const CELL_PX = 96;

/** Height of the name+state strip BELOW each sprite cell. The grid row is CELL_PX +
 * LABEL_PX tall: sprite in the top square, label in the strip — so labels never overlap
 * or clip against the sprite. Shared by the renderer (row pitch) and the host (labels). */
export const LABEL_PX = 42;

/** Distinct pet colours. One shared body, recoloured per pet so they read apart. */
const PALETTE = [
  0xff6b6b, 0xffd166, 0x06d6a0, 0x4dabf7, 0xb197fc, 0xffa94d, 0xf783ac, 0x63e6be,
];

/** FNV-1a hash of a seed string → unsigned 32-bit int. Pure. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic tint for a pet from a seed (its id). Pure. */
export function tintForSeed(seed: string): number {
  return PALETTE[hashSeed(seed) % PALETTE.length];
}

/** Bottom → top. `ground`/`scene` are the diorama (a floor pad + a station/prop behind the
 * pet — see zoneForView); equipped cosmetics slot into body/head/aura. */
export const LAYER_ORDER = ["ground", "scene", "base", "body", "head", "aura", "status"] as const;
export type Layer = (typeof LAYER_ORDER)[number];

/** Named animations the renderer must be able to play. `mine`/`hit`/`collect`/`pierce`/
 * `slice` are the working actions (see WORKING_ANIMATIONS). `revive` is renderer-synthesized
 * (death reversed — the pet gets back up) and is NOT emitted by the pure compositor; the
 * renderer plays it on a death → alive transition. */
export type AnimationName =
  | "idle"
  | "run"
  | "walk"
  | "mine"
  | "hit"
  | "collect"
  | "pierce"
  | "slice"
  | "fishing"
  | "death"
  | "revive";

/** The working-action pool. A pet picks one deterministically from its seed so different
 * pets do different jobs (mine / gather / chop) instead of all mining. */
// (pierce + hit excluded — their poses read badly: pierce is a low forward thrust, hit a flinch.)
export const WORKING_ANIMATIONS = ["mine", "collect", "slice"] as const satisfies readonly AnimationName[];

/** What a single layer should display this frame. `sprite: null` hides the layer. */
export interface LayerView {
  /** Sprite key the renderer resolves to a sheet (e.g. "hero", "helm.bronze"). null = empty. */
  sprite: string | null;
  animation: AnimationName;
  /** 0..1, drives e.g. a hunger tint on the status layer. */
  intensity?: number;
  /** Multiply colour (e.g. 0xff6b6b). Omitted = no tint (white). */
  tint?: number;
}

export type Scene = Record<Layer, LayerView>;

/** A scene tagged with its creature's stable key. The renderer keys slots by this so a
 * pet keeps its animation state across reordering AND across removal/return (a session
 * coming back from death/hidden plays the revive instead of popping in). */
export interface RenderItem {
  key: string;
  scene: Scene;
}

/** Minimal renderer contract. Implemented by renderer-pixi.ts. */
export interface Renderer {
  /** Apply one keyed scene per creature (player first), laid out in `columns` columns. */
  applyScenes(items: RenderItem[], columns: number): void;
  destroy(): void;
}

export interface CreatureView {
  species: Species;
  status: LivenessStatus;
  /** Short-term usage signal — drives the mining (active) vs resting (idle) animation. */
  activity: ActivityStatus;
  alive: boolean;
  /** equipped cosmetic ids → resolved to body/head/aura layers. */
  equipped: string[];
  /** Per-creature recolour. Omitted = natural colour (used for the player). */
  tint?: number;
  /** Stable identity (the pet id) used to pick a per-pet working animation. Omitted ⇒
   * defaults to the first working action (mining). */
  seed?: string;
  /** The account's avatar (not a session pet). The player is the armoured "hero" — it
   * renders its species body (knight/wizard/rogue). Session pets render the little worker
   * body instead, which has the full action set (mine/collect/etc). */
  isPlayer?: boolean;
}

/** Pick this pet's working action from its seed — stable per pet, varied across the
 * menagerie. No seed ⇒ the default (mining). Pure. */
export function workingAnimation(seed?: string): AnimationName {
  if (!seed) return WORKING_ANIMATIONS[0];
  return WORKING_ANIMATIONS[hashSeed(seed) % WORKING_ANIMATIONS.length];
}

/**
 * A diorama zone — the place + prop a pet stands at, DERIVED from what it's doing. This is
 * the architecture-fitting form of the Path-B "zones" (see docs/plans): a working pet gets
 * a zone matching its action, a resting pet gathers at camp, a downed pet gets a bare spot.
 * Pure — it only picks a zone id; sprites/* maps the id to ground + scene art.
 */
export type ZoneId = "mine" | "grove" | "lumber" | "camp" | "pond" | "rest";

/** Zones that have a scene prop (rest = bare pad; pond = water only, the rod is animated). */
const ZONES_WITH_PROP: ReadonlySet<ZoneId> = new Set<ZoneId>(["mine", "grove", "lumber", "camp"]);

/** Pick a pet's diorama zone from its liveness + activity. Pure, deterministic per seed. */
export function zoneForView(view: CreatureView): ZoneId {
  if (!view.alive || view.status === "dead" || view.status === "fainted") return "rest";
  if (view.activity === "active") {
    switch (workingAnimation(view.seed)) {
      case "mine":
        return "mine";
      case "collect":
        return "grove";
      case "slice":
        return "lumber"; // the Slice swing is a wood-chop — pair it with a tree, not an anvil
    }
  }
  // Idle: nobody is working, so everyone just rests at camp (no fishing-at-the-pond busywork).
  return "camp";
}

/** Map liveness + activity → the base creature animation. Pure. */
function statusToAnimation(view: CreatureView): AnimationName {
  if (!view.alive || view.status === "dead") return "death";
  if (view.status === "fainted") return "death"; // the brief swoon before death — same down pose
  if (view.activity === "active") return workingAnimation(view.seed); // producing → its work action
  // Idle: nobody is working — the pet just stands at rest (no fishing/idle busywork).
  return "idle";
}

/**
 * Decide which cosmetic id (if any) occupies a given layer. STUB mapping by id prefix
 * — extend as the cosmetic catalogue grows. Pure.
 */
function cosmeticForLayer(layer: Layer, equipped: string[]): string | null {
  const prefix = { body: "armor.", head: "helm.", aura: "aura." } as const;
  if (layer === "body" || layer === "head" || layer === "aura") {
    return equipped.find((id) => id.startsWith(prefix[layer])) ?? null;
  }
  return null;
}

/**
 * A stable string identity for a view's RENDERED content. Hosts use this to avoid
 * re-pushing (and restarting animations on) ticks that didn't change anything visible.
 */
export function viewSignature(view: CreatureView): string {
  return [view.species, view.status, view.activity, view.alive, view.equipped.join(","), view.tint ?? "-", view.seed ?? "-"].join("|");
}

/** The little worker body (Body_A) — the only one in the art pack with a full ACTION set:
 * mine (Crush), gather (Collect), chop (Slice), plus fish/farm/fight/haul. Every session
 * PET uses it so its work actually animates. The PLAYER instead uses its armoured species
 * body (knight/wizard/rogue), which only has idle/run/death — fine, the player never works. */
const WORKER_BODY = "hero";

/** Build the renderer-agnostic Scene from a creature view. Pure — easy to unit test. */
export function buildScene(view: CreatureView): Scene {
  const baseAnim = statusToAnimation(view);
  const zone = zoneForView(view);
  // The player is the armoured hero (its species body); a pet is the little worker body that
  // can actually mine/collect/etc.
  const baseSprite = view.isPlayer ? view.species : WORKER_BODY;
  return {
    // The diorama: a floor pad, and a station/prop matching what this pet is doing. These
    // are NOT tinted (the per-pet recolour applies to the creature only).
    ground: { sprite: `ground.${zone}`, animation: "idle" },
    scene: { sprite: ZONES_WITH_PROP.has(zone) ? `scene.${zone}` : null, animation: "idle" },
    // The player's armoured species body, or a pet's worker body — both recoloured per
    // creature via `tint` (the player passes none, so it keeps natural colours).
    base: { sprite: baseSprite, animation: baseAnim, tint: view.tint },
    body: { sprite: cosmeticForLayer("body", view.equipped), animation: baseAnim, tint: view.tint },
    head: { sprite: cosmeticForLayer("head", view.equipped), animation: baseAnim, tint: view.tint },
    aura: { sprite: cosmeticForLayer("aura", view.equipped), animation: "idle" },
    // The status layer shows mood overlays (e.g. a low-energy tint when drained).
    status: { sprite: view.status === "drained" ? "status.drained" : null, animation: "idle" },
  };
}

/** Thin orchestrator: holds a renderer, pushes scenes built from creature views. */
export class Compositor {
  constructor(private readonly renderer: Renderer) {}

  /** Render the whole menagerie in order (player first, then pets), in `columns` columns.
   * Each creature carries its stable `key` so the renderer can keep per-pet animation state
   * across reordering and removal/return. */
  showAll(creatures: { key: string; view: CreatureView }[], columns: number): void {
    this.renderer.applyScenes(
      creatures.map(({ key, view }) => ({ key, scene: buildScene(view) })),
      columns,
    );
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
