/**
 * PixiJS (2D) implementation of the compositor's `Renderer`. This is the ONLY file
 * allowed to import Pixi. It draws the layers; it has no opinion about game state and
 * never imports the engine's logic or any Tauri API.
 *
 * ONE Application renders the whole menagerie: the player and every session pet are
 * "slots" laid out in a row inside a single canvas. (One Pixi Application per creature
 * means one WebGL context per creature, which the browser caps / fails silently — so a
 * single canvas is both correct and robust.)
 */

import { AnimatedSprite, Application, Assets, Container, Rectangle, Texture } from "pixi.js";
import type { AnimationName, Layer, RenderItem, Renderer } from "./compositor";
import { CELL_PX as CELL, LABEL_PX, LAYER_ORDER } from "./compositor";

// Grid row pitch: the sprite cell plus the label strip beneath it (sprite occupies the
// top CELL×CELL of each tile; the strip below is left transparent for the HTML label).
const ROW_H = CELL + LABEL_PX;
import {
  CHARACTER_SHEETS,
  resolveAnimation,
  sheetUrl,
  sliceFrames,
  type SpriteSheetSet,
} from "./sprites";
// On-screen sprite height. A multiple of both 32 and 64 so every sheet scales by an
// integer factor → crisp pixel art regardless of native frame size.
const SPRITE_PX = 64;

type FrameCache = Map<AnimationName, Texture[]>;

/** One creature's layer stack, parented under a positioned slot container. */
interface Slot {
  container: Container;
  layerContainers: Map<Layer, Container>;
  layerSprites: Map<Layer, AnimatedSprite | null>;
  /** Last GAME animation applied per layer, so the renderer can detect a death → alive
   * transition and play the revive (get-up) in between. null = layer was empty. */
  layerAnim: Map<Layer, AnimationName | null>;
}

export class PixiRenderer implements Renderer {
  /** Creature key → its layer stack. Keyed (not positional) so a pet keeps its sprites and
   * animation state when the menagerie reorders. */
  private readonly slots = new Map<string, Slot>();
  /** Last per-layer animation for keys whose slot was removed WHILE DEAD, so a returning
   * session plays the revive (get-up) instead of popping in. Only dead keys are kept, so
   * it stays small (and is dropped the moment the key returns). */
  private readonly deadMemory = new Map<string, Map<Layer, AnimationName | null>>();
  /** spriteKey (e.g. "hero") → animation → sliced frame textures. */
  private readonly cache = new Map<string, FrameCache>();
  private readonly root: Container;

  private constructor(private readonly app: Application) {
    this.root = new Container();
    app.stage.addChild(this.root);
  }

  /** Async factory: boots Pixi, preloads the character sheets, mounts the canvas. */
  static async create(parent: HTMLElement): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      width: CELL,
      height: CELL,
      backgroundAlpha: 0, // transparent — ambient over the desktop
      antialias: false,
    });
    parent.appendChild(app.canvas);

    const renderer = new PixiRenderer(app);
    await renderer.preload();
    return renderer;
  }

  private async preload(): Promise<void> {
    for (const [character, set] of Object.entries(CHARACTER_SHEETS)) {
      this.cache.set(character, await loadSet(set));
    }
    // TODO: preload cosmetic sheets (helm.*/armor.*/aura.*) once art exists. Until
    // then, unknown sprite keys simply leave their layer empty.
  }

  /** Render every creature in a `columns`-wide grid (columns chosen by the host from the
   * live window width). Wraps to as many rows as needed; height grows, width fits. */
  applyScenes(items: RenderItem[], columns: number): void {
    const n = Math.max(1, items.length);
    const cols = Math.max(1, columns);
    const rows = Math.ceil(n / cols);
    const w = cols * CELL;
    const h = rows * ROW_H;
    if (this.app.renderer.width !== w || this.app.renderer.height !== h) {
      this.app.renderer.resize(w, h);
    }

    // Drop slots whose creature is gone (remembering dead ones so they revive on return).
    const present = new Set(items.map((it) => it.key));
    for (const key of [...this.slots.keys()]) {
      if (!present.has(key)) this.removeSlot(key);
    }

    items.forEach((it, i) => {
      const slot = this.getOrCreateSlot(it.key);
      slot.container.x = (i % cols) * CELL;
      slot.container.y = Math.floor(i / cols) * ROW_H;
      for (const layer of LAYER_ORDER) {
        const view = it.scene[layer];
        this.applyLayer(slot, layer, view.sprite, view.animation, view.tint);
      }
    });
  }

  private getOrCreateSlot(key: string): Slot {
    const existing = this.slots.get(key);
    if (existing) return existing;

    const container = new Container();
    this.root.addChild(container);
    const layerContainers = new Map<Layer, Container>();
    const layerSprites = new Map<Layer, AnimatedSprite | null>();
    const layerAnim = new Map<Layer, AnimationName | null>();
    // If this key is RETURNING from death (was removed while dead), seed its last-animation
    // memory so applyLayer detects the death → alive transition and plays the get-up.
    const remembered = this.deadMemory.get(key);
    this.deadMemory.delete(key);
    for (const layer of LAYER_ORDER) {
      const c = new Container();
      container.addChild(c);
      layerContainers.set(layer, c);
      layerSprites.set(layer, null);
      layerAnim.set(layer, remembered?.get(layer) ?? null);
    }
    const slot: Slot = { container, layerContainers, layerSprites, layerAnim };
    this.slots.set(key, slot);
    return slot;
  }

  private removeSlot(key: string): void {
    const slot = this.slots.get(key);
    if (!slot) return;
    this.slots.delete(key);
    // Remember it ONLY if it left while dead, so a revived session gets up on return;
    // otherwise forget it entirely to keep the map small.
    if (slot.layerAnim.get("base") === "death") {
      this.deadMemory.set(key, slot.layerAnim);
    } else {
      this.deadMemory.delete(key);
    }
    this.root.removeChild(slot.container);
    slot.container.destroy({ children: true });
  }

  private applyLayer(
    slot: Slot,
    layer: Layer,
    spriteKey: string | null,
    animation: AnimationName,
    tint?: number,
  ): void {
    const container = slot.layerContainers.get(layer)!;
    const sheet = spriteKey ? this.cache.get(spriteKey) : undefined;

    // Revive: the game wants a living animation but this layer was showing death. Play
    // the death frames in REVERSE once (the pet gets back up), then advance into the
    // requested animation. Detected here because the renderer is the only stateful piece
    // that remembers what each layer was last showing; the compositor stays pure.
    const prevAnim = slot.layerAnim.get(layer);
    const reviving = prevAnim === "death" && animation !== "death" && !!sheet?.get("revive");
    const playAnim: AnimationName = reviving ? "revive" : animation;
    const frames = sheet?.get(playAnim);

    // Tear down the existing sprite if the layer is now empty or has no art.
    const existing = slot.layerSprites.get(layer);
    if (!frames || frames.length === 0) {
      if (existing) {
        container.removeChild(existing);
        existing.destroy();
        slot.layerSprites.set(layer, null);
      }
      slot.layerAnim.set(layer, null);
      return;
    }

    // Steady state: the same animation is already playing → just refresh the tint and
    // leave it running. WITHOUT this, any single pet's change would re-push every scene
    // and restart all 100+ sprites' animations in lockstep each frame.
    if (existing && prevAnim === animation && !reviving) {
      existing.tint = tint ?? 0xffffff;
      return;
    }

    // Death and revive play once (death holds the pet on the floor; revive ends standing,
    // then hands off to the living loop below); everything else loops.
    const loop = playAnim !== "death" && playAnim !== "revive";
    let sprite = existing;
    if (!sprite) {
      sprite = new AnimatedSprite(frames);
      sprite.animationSpeed = 0.15;
      container.addChild(sprite);
      slot.layerSprites.set(layer, sprite);
    }
    sprite.textures = frames;
    sprite.tint = tint ?? 0xffffff;
    sprite.loop = loop;
    placeSprite(sprite, frames);

    if (reviving) {
      // When the get-up finishes, swap to the requested living animation and loop it.
      const liveFrames = sheet!.get(animation);
      const s = sprite;
      s.onComplete = () => {
        s.onComplete = undefined;
        if (!liveFrames || liveFrames.length === 0) return;
        s.textures = liveFrames;
        s.loop = true;
        placeSprite(s, liveFrames);
        s.gotoAndPlay(0);
      };
    } else {
      sprite.onComplete = undefined;
    }

    sprite.gotoAndPlay(0);
    slot.layerAnim.set(layer, animation);
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: false });
  }
}

/**
 * Center a sprite in its cell and scale it so its native frame maps to SPRITE_PX,
 * regardless of the sheet's frame size (idle 32px vs run/mine 64px render the same).
 */
function placeSprite(sprite: AnimatedSprite, frames: Texture[]): void {
  const frameHeight = frames[0]?.height || SPRITE_PX;
  sprite.anchor.set(0.5);
  sprite.scale.set(SPRITE_PX / frameHeight);
  sprite.position.set(CELL / 2, CELL / 2);
}

/** Load every animation of a set into sliced frame textures. */
async function loadSet(set: SpriteSheetSet): Promise<FrameCache> {
  const cache: FrameCache = new Map();
  const names = Object.keys(set.animations) as AnimationName[];
  for (const name of names) {
    const spec = resolveAnimation(set, name);
    const sheet: Texture = await Assets.load(sheetUrl(spec.sheet));
    sheet.source.scaleMode = "nearest"; // crisp pixel art
    const frames = sliceFrames(sheet.width, spec).map(
      (f) => new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }),
    );
    cache.set(name, frames);
  }
  // No revive sheet ships in the pack: synthesize it as the death animation reversed
  // (lying down → standing). Pure-data manifests can't do this — Textures are renderer-only.
  const death = cache.get("death");
  if (death && death.length > 0 && !cache.has("revive")) {
    cache.set("revive", [...death].reverse());
  }
  return cache;
}
