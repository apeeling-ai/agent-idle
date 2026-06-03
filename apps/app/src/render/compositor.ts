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
import { CHARACTER } from "./sprites";

/** On-screen px width/height of one creature cell. Shared by the renderer (canvas
 * sizing) and the React host (aligning HTML name labels under each creature). */
export const CELL_PX = 96;

/** Distinct pet colours. One shared body, recoloured per pet so they read apart. */
const PALETTE = [
  0xff6b6b, 0xffd166, 0x06d6a0, 0x4dabf7, 0xb197fc, 0xffa94d, 0xf783ac, 0x63e6be,
];

/** Deterministic tint for a pet from a seed (its id). Pure. */
export function tintForSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETTE[(h >>> 0) % PALETTE.length];
}

/** Bottom → top. Equipped cosmetics slot into body/head/aura. */
export const LAYER_ORDER = ["base", "body", "head", "aura", "status"] as const;
export type Layer = (typeof LAYER_ORDER)[number];

/** Named animations the renderer must be able to play. `mine` is the working swing (Crush). */
export type AnimationName = "idle" | "run" | "walk" | "mine" | "hit" | "collect" | "death";

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

/** Minimal renderer contract. Implemented by renderer-pixi.ts. */
export interface Renderer {
  /** Apply one scene per creature, in order (player first, then pets). */
  applyScenes(scenes: Scene[]): void;
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
}

/** Map liveness + activity → the base creature animation. Pure. */
function statusToAnimation(view: CreatureView): AnimationName {
  if (!view.alive || view.status === "dead") return "death";
  if (view.status === "fainted") return "death"; // visually slumped; recoverable in normal mode
  // Session being used right now → swing the pickaxe (mining); otherwise rest.
  return view.activity === "active" ? "mine" : "idle";
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
  return [view.species, view.status, view.activity, view.alive, view.equipped.join(","), view.tint ?? "-"].join("|");
}

/** Build the renderer-agnostic Scene from a creature view. Pure — easy to unit test. */
export function buildScene(view: CreatureView): Scene {
  const baseAnim = statusToAnimation(view);
  return {
    // One shared character body (the only one in the pack that can mine), recoloured
    // per creature via `tint`. `species` stays in the data for future overlays.
    base: { sprite: CHARACTER, animation: baseAnim, tint: view.tint },
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

  /** Render the whole menagerie in order (player first, then pets). */
  showAll(views: CreatureView[]): void {
    this.renderer.applyScenes(views.map(buildScene));
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
