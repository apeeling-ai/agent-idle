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

import type { ActivityStatus, LivenessStatus, PetAction, Species, WaitingKind } from "@agent-idle/engine";
import type { WorldLayout } from "./layout";

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

/** FNV-1a hash of a seed string → unsigned 32-bit int. Pure. Exported so the world layout
 * (layout.ts) seeds its per-agent scatter jitter with the same hash the rest of the system
 * uses (tints, working-action pick). */
export function hashSeed(seed: string): number {
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
 * pet — see zoneForView); equipped cosmetics slot into body(armor)/head(helm)/weapon/aura. */
export const LAYER_ORDER = ["ground", "scene", "aura", "base", "legs", "body", "head", "weapon", "status"] as const;
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
 * pets do different jobs (mine / fish / chop) instead of all mining. */
// (pierce + hit excluded — their poses read badly: pierce is a low forward thrust, hit a flinch.)
// (the old "collect"/gather job is retired — reading & searching now reads as FISHING, so the
//  common case sends pets to the pond and they fish far more often.)
export const WORKING_ANIMATIONS = ["mine", "fishing", "slice"] as const satisfies readonly AnimationName[];

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
  /** Apply one keyed scene per creature (player first), placed by the shared-world `layout`
   * (each key → x/y/scale within the fixed area). The host computes the layout so the
   * compositor stays free of any area/placement policy. */
  applyScenes(items: RenderItem[], layout: WorldLayout): void;
  /** The creature's current ON-SCREEN anchor (its live walking position + render scale), or
   * null if it has no placed slot yet. Hosts read this so name labels and coin flights track
   * the pet as it strolls between zones, instead of snapping to its destination spot. */
  livePosition(key: string): { x: number; y: number; scale: number } | null;
  destroy(): void;
}

export interface CreatureView {
  species: Species;
  status: LivenessStatus;
  /** Short-term usage signal — drives the mining (active) vs resting (idle) animation. */
  activity: ActivityStatus;
  /** Attention signal — drives the ?/! bubble on the status layer. Omitted ⇒ "none". */
  waiting?: WaitingKind;
  /** Live job (from the agent's current tool) — picks the work room + animation while active.
   * Omitted/"none" ⇒ fall back to the pet's default seed action. */
  action?: PetAction;
  /** Knocked out after a failed turn (StopFailure) → collapsed (death pose) at camp. */
  failed?: boolean;
  alive: boolean;
  /** equipped cosmetic ids → resolved to body/head/aura layers. */
  equipped: string[];
  /** Per-cosmetic-id PRESTIGE recolour (engine.equippedTints): a worn piece on its Nth ramp loop
   * is tinted by its cycle. Keyed by cosmetic id; absent ⇒ the piece uses `tint` (or none). The
   * same art id repeats across cycles, so this is the ONLY signal that a piece prestiged. */
  equippedTints?: Record<string, number>;
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
export type ZoneId = "mine" | "lumber" | "camp" | "pond" | "rest";

/** Zones that have a scene prop (rest = bare pad; pond = water only, the rod is animated). */
const ZONES_WITH_PROP: ReadonlySet<ZoneId> = new Set<ZoneId>(["mine", "lumber", "camp"]);

/**
 * The work animation an ACTIVE pet shows: driven by its live job (the agent's current tool)
 * when known, else its stable per-pet seed action. shell→mine, edit→chop, read/web→fish.
 * Pure.
 */
function activeAnimation(view: CreatureView): AnimationName {
  switch (view.action) {
    case "shell":
      return "mine"; // running commands → swing the pickaxe
    case "edit":
      return "slice"; // writing code → chop wood
    case "read":
      return "fishing"; // reading / searching files (the common case) → cast a line at the pond
    case "web":
      return "fishing"; // browsing the web → cast a line at the pond
    default:
      return workingAnimation(view.seed); // "none"/unknown → the pet's default job
  }
}

/** Pick a pet's diorama zone from its liveness + live job. Pure. A working pet stands in the
 * room matching what the agent is doing right now (so it walks between rooms as tools change). */
export function zoneForView(view: CreatureView): ZoneId {
  if (!view.alive || view.status === "dead" || view.status === "fainted") return "rest";
  if (view.failed) return "camp"; // knocked out after a failed turn — collapsed at camp
  if (view.activity === "active") {
    switch (activeAnimation(view)) {
      case "mine":
        return "mine";
      case "slice":
        return "lumber"; // the Slice swing is a wood-chop — pair it with a tree, not an anvil
      case "fishing":
        return "pond"; // reading/searching & web both cast a line at the pond
    }
  }
  // Idle: nobody is working, so everyone just rests at camp (no fishing-at-the-pond busywork).
  return "camp";
}

/** Map liveness + activity → the base creature animation. Pure. */
function statusToAnimation(view: CreatureView): AnimationName {
  if (!view.alive || view.status === "dead") return "death";
  if (view.status === "fainted") return "death"; // the brief swoon before death — same down pose
  if (view.failed) return "death"; // turn errored out → collapsed (recovers / gets up on next turn)
  if (view.activity === "active") return activeAnimation(view); // producing → its current job
  // Idle: nobody is working — the pet just stands at rest (no fishing/idle busywork).
  return "idle";
}

/**
 * The status-layer overlay above a pet. Priority: a live, not-working pet that wants the
 * human shows an attention bubble (alert `!` > question `?`); otherwise a drained pet shows
 * its low-energy overlay. A downed pet (fainted/dead) or a busy (active) pet shows nothing
 * for `waiting` — it isn't asking you anything right now. Pure.
 */
function statusOverlay(view: CreatureView): string | null {
  const downed = !view.alive || view.status === "dead" || view.status === "fainted";
  if (!downed && view.activity !== "active") {
    if (view.waiting === "alert") return "status.alert";
    if (view.waiting === "question") return "status.question";
  }
  return view.status === "drained" ? "status.drained" : null;
}

/**
 * Decide which cosmetic id (if any) occupies a given layer, by id prefix. The engine's
 * resolveEquipped emits ids like "armor.plate" / "helm.greathelm" / "weapon.steel"; each maps
 * to an LPC sheet of the same key (see sprites.ts LPC_SHEETS). Pure.
 */
function cosmeticForLayer(layer: Layer, equipped: string[]): string | null {
  const prefix: Partial<Record<Layer, string>> = { legs: "legs.", body: "armor.", head: "helm.", weapon: "weapon.", aura: "aura." };
  const p = prefix[layer];
  return p ? (equipped.find((id) => id.startsWith(p)) ?? null) : null;
}

/** A worn-gear layer: its cosmetic sprite + the tint to draw it with — the piece's PRESTIGE
 * recolour when it has one (engine.equippedTints), else the creature's own `tint` (or none). Pure. */
function gearLayer(layer: Layer, view: CreatureView, animation: AnimationName): LayerView {
  const sprite = cosmeticForLayer(layer, view.equipped);
  const tint = sprite ? (view.equippedTints?.[sprite] ?? view.tint) : view.tint;
  return { sprite, animation, tint };
}

/**
 * A stable string identity for a view's RENDERED content. Hosts use this to avoid
 * re-pushing (and restarting animations on) ticks that didn't change anything visible.
 */
export function viewSignature(view: CreatureView): string {
  // equippedTints is part of the signature because a prestige recolor changes the render WITHOUT
  // changing the equipped ids (the same art id repeats across cycles).
  const tints = view.equippedTints ? Object.entries(view.equippedTints).map(([k, v]) => `${k}:${v}`).sort().join(",") : "-";
  return [view.species, view.status, view.activity, view.waiting ?? "none", view.action ?? "none", view.failed ?? false, view.alive, view.equipped.join(","), tints, view.tint ?? "-", view.seed ?? "-"].join("|");
}

/** The little worker body (Body_A) — the only one in the art pack with a full ACTION set:
 * mine (Crush), gather (Collect), chop (Slice), plus fish/farm/fight/haul. Every session
 * PET uses it so its work actually animates. */
const WORKER_BODY = "hero";

/** The PLAYER's base is the LPC paper-doll body (sprites/lpc/body) — a front-facing idle hero
 * onto which the armor/helm/weapon LPC layers stack, frame-aligned (see sprites.ts LPC_SHEETS). */
const PLAYER_BODY = "lpc.body";

/** Build the renderer-agnostic Scene from a creature view. Pure — easy to unit test. */
export function buildScene(view: CreatureView): Scene {
  const baseAnim = statusToAnimation(view);
  const zone = zoneForView(view);
  // The player is the LPC paper-doll hero (gear stacks on it); a pet is the little worker body
  // that can actually mine/collect/etc.
  const baseSprite = view.isPlayer ? PLAYER_BODY : WORKER_BODY;
  return {
    // The diorama: a floor pad, and a station/prop matching what this pet is doing. These
    // are NOT tinted (the per-pet recolour applies to the creature only).
    ground: { sprite: `ground.${zone}`, animation: "idle" },
    scene: { sprite: ZONES_WITH_PROP.has(zone) ? `scene.${zone}` : null, animation: "idle" },
    // The LPC player body / a pet's worker body — recoloured per creature via `tint` (the
    // player passes none, so its skin + gear keep natural colours).
    base: { sprite: baseSprite, animation: baseAnim, tint: view.tint },
    // legs (pants) draw over the bare body, under the torso armor.
    legs: gearLayer("legs", view, baseAnim),
    // armor (torso) + helm (head) — LPC layers for the player; each carries its piece's prestige
    // recolour (or the creature's own tint).
    body: gearLayer("body", view, baseAnim),
    head: gearLayer("head", view, baseAnim),
    // The held blade — distinct per-tier art, recoloured on prestige loops.
    weapon: gearLayer("weapon", view, baseAnim),
    aura: gearLayer("aura", view, "idle"),
    // The status layer shows the attention bubble (?/!) or a low-energy overlay.
    status: { sprite: statusOverlay(view), animation: "idle" },
  };
}

/** Thin orchestrator: holds a renderer, pushes scenes built from creature views. */
export class Compositor {
  constructor(private readonly renderer: Renderer) {}

  /** Render the whole menagerie in order (player first, then pets), placed by the shared-world
   * `layout`. Each creature carries its stable `key` so the renderer can keep per-pet animation
   * state across reordering and removal/return. */
  showAll(creatures: { key: string; view: CreatureView }[], layout: WorldLayout): void {
    this.renderer.applyScenes(
      creatures.map(({ key, view }) => ({ key, scene: buildScene(view) })),
      layout,
    );
  }

  /** The live on-screen anchor of a creature (delegates to the renderer) — see Renderer.livePosition. */
  livePosition(key: string): { x: number; y: number; scale: number } | null {
    return this.renderer.livePosition(key);
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
