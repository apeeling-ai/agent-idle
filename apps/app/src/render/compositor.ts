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

import type { Species } from "@agent-idle/engine";
import type { LivenessStatus } from "@agent-idle/engine";

/** Bottom → top. Equipped cosmetics slot into body/head/aura. */
export const LAYER_ORDER = ["base", "body", "head", "aura", "status"] as const;
export type Layer = (typeof LAYER_ORDER)[number];

/** Named animations the renderer must be able to play (NPC packs ship idle/run/death). */
export type AnimationName = "idle" | "run" | "walk" | "hit" | "collect" | "death";

/** What a single layer should display this frame. `sprite: null` hides the layer. */
export interface LayerView {
  /** Sprite key the renderer resolves to a sheet (e.g. "knight", "helm.bronze"). null = empty. */
  sprite: string | null;
  animation: AnimationName;
  /** 0..1, drives e.g. a hunger tint on the status layer. */
  intensity?: number;
}

export type Scene = Record<Layer, LayerView>;

/** Minimal renderer contract. Implemented by renderer-pixi.ts. */
export interface Renderer {
  /** Apply a full scene (the compositor diffs nothing; renderer may). */
  apply(scene: Scene): void;
  destroy(): void;
}

export interface CreatureView {
  species: Species;
  status: LivenessStatus;
  alive: boolean;
  /** equipped cosmetic ids → resolved to body/head/aura layers. */
  equipped: string[];
}

/** Map liveness status → the base creature animation. Pure. */
function statusToAnimation(view: CreatureView): AnimationName {
  if (!view.alive || view.status === "dead") return "death";
  if (view.status === "fainted") return "death"; // visually slumped; recoverable in normal mode
  // healthy/hungry/starving idle by default; the app swaps to run/hit on interaction.
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

/** Build the renderer-agnostic Scene from a creature view. Pure — easy to unit test. */
export function buildScene(view: CreatureView): Scene {
  const baseAnim = statusToAnimation(view);
  return {
    base: { sprite: view.species, animation: baseAnim },
    body: { sprite: cosmeticForLayer("body", view.equipped), animation: baseAnim },
    head: { sprite: cosmeticForLayer("head", view.equipped), animation: baseAnim },
    aura: { sprite: cosmeticForLayer("aura", view.equipped), animation: "idle" },
    // The status layer shows mood overlays (e.g. "confused" after a junk prompt).
    status: { sprite: view.status === "starving" ? "status.hungry" : null, animation: "idle" },
  };
}

/** Thin orchestrator: holds a renderer, pushes scenes built from creature views. */
export class Compositor {
  constructor(private readonly renderer: Renderer) {}

  show(view: CreatureView): void {
    this.renderer.apply(buildScene(view));
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
