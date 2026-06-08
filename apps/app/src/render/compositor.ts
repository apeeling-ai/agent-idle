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
  /** The account avatar (not a session pet). The renderer sizes/places it differently — the
   * armoured species body is bulkier and fills its frame, vs the little worker pets. */
  isPlayer?: boolean;
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
  /** What the session is doing right now (LOCAL hint from the daemon). Drives the zone +
   * action when active; omitted ⇒ fall back to the per-seed working action. */
  workKind?: WorkKind;
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

/**
 * What KIND of work a session is doing right now — a LOCAL hint derived by the daemon from
 * the tool in use (a category, never prompt/code text). It maps to the zone the pet works in
 * AND the action it plays, so the diorama actually reads the work:
 *   read  → mining a boulder (digging through the codebase)
 *   edit  → chopping wood    (building/reshaping code)
 *   run   → gathering        (running commands, collecting output)
 *   web   → fishing at the pond (fishing for info online)
 *   think → mining (the generic "working" default)
 */
export const WORK_KINDS = ["read", "edit", "run", "web", "think"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/** Runtime guard for a daemon-supplied work string (it crosses the loopback boundary). */
export function isWorkKind(s: string | undefined | null): s is WorkKind {
  return !!s && (WORK_KINDS as readonly string[]).includes(s);
}

const WORK_MAP: Record<WorkKind, { zone: ZoneId; anim: AnimationName }> = {
  read: { zone: "mine", anim: "mine" },
  edit: { zone: "lumber", anim: "slice" },
  run: { zone: "grove", anim: "collect" },
  web: { zone: "pond", anim: "fishing" },
  think: { zone: "mine", anim: "mine" },
};

/** Resolve the work mapping for a view, if it carries a (valid) work kind. Pure. */
function workMapFor(view: CreatureView): { zone: ZoneId; anim: AnimationName } | null {
  return view.workKind ? (WORK_MAP[view.workKind] ?? null) : null;
}

/** Pick a pet's diorama zone from its liveness + activity. A pet STAYS at its work zone even
 * when idle — it just stands there next to the boulder/tree/etc. instead of working (the
 * animation, not the zone, reflects active vs idle). Only a pet with no work to stand by
 * (the player, or one that has never worked) rests at camp. Pure. */
export function zoneForView(view: CreatureView): ZoneId {
  if (!view.alive || view.status === "dead" || view.status === "fainted") return "rest";
  // Stand at the zone for what this session is/was doing — active or idle.
  const work = workMapFor(view);
  if (work) return work.zone;
  // No known work kind. If actively working, derive a zone from the seed; otherwise camp.
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
  return "camp";
}

/** Map liveness + activity → the base creature animation. Pure. */
function statusToAnimation(view: CreatureView): AnimationName {
  if (!view.alive || view.status === "dead") return "death";
  if (view.status === "fainted") return "death"; // the brief swoon before death — same down pose
  if (view.activity === "active") {
    // Producing → play the action matching the real work (read=mine, edit=chop, …); fall
    // back to the per-seed action when the work kind is unknown.
    return workMapFor(view)?.anim ?? workingAnimation(view.seed);
  }
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
  // workKind is included so a zone swap with unchanged liveness (e.g. read→edit, same
  // status/activity/equipped/seed) still changes the signature and re-pushes the scene —
  // otherwise PixiStage's showAll effect (keyed on the signature) drops the boulder→tree swap.
  return [view.species, view.status, view.activity, view.alive, view.equipped.join(","), view.tint ?? "-", view.seed ?? "-", view.workKind ?? "-"].join("|");
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
      creatures.map(({ key, view }) => ({ key, scene: buildScene(view), isPlayer: view.isPlayer })),
      columns,
    );
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
