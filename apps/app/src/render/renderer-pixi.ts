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
import type { AnimationName, Layer, Renderer, Scene } from "./compositor";
import { CELL_PX as CELL, LAYER_ORDER } from "./compositor";
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
}

export class PixiRenderer implements Renderer {
  private readonly slots: Slot[] = [];
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

  /** Render every creature in order. Slots are added/removed to match the count. */
  applyScenes(scenes: Scene[]): void {
    const width = Math.max(1, scenes.length) * CELL;
    this.app.renderer.resize(width, CELL);

    while (this.slots.length < scenes.length) this.addSlot();
    while (this.slots.length > scenes.length) this.removeSlot();

    scenes.forEach((scene, i) => {
      const slot = this.slots[i];
      slot.container.x = i * CELL;
      for (const layer of LAYER_ORDER) {
        this.applyLayer(slot, layer, scene[layer].sprite, scene[layer].animation, scene[layer].tint);
      }
    });
  }

  private addSlot(): void {
    const container = new Container();
    this.root.addChild(container);
    const layerContainers = new Map<Layer, Container>();
    const layerSprites = new Map<Layer, AnimatedSprite | null>();
    for (const layer of LAYER_ORDER) {
      const c = new Container();
      container.addChild(c);
      layerContainers.set(layer, c);
      layerSprites.set(layer, null);
    }
    this.slots.push({ container, layerContainers, layerSprites });
  }

  private removeSlot(): void {
    const slot = this.slots.pop();
    if (!slot) return;
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
    const frames = spriteKey ? this.cache.get(spriteKey)?.get(animation) : undefined;

    // Tear down the existing sprite if the layer is now empty or has no art.
    const existing = slot.layerSprites.get(layer);
    if (!frames || frames.length === 0) {
      if (existing) {
        container.removeChild(existing);
        existing.destroy();
        slot.layerSprites.set(layer, null);
      }
      return;
    }

    if (existing) {
      existing.textures = frames;
      existing.tint = tint ?? 0xffffff;
      placeSprite(existing, frames);
      existing.gotoAndPlay(0);
    } else {
      const sprite = new AnimatedSprite(frames);
      sprite.animationSpeed = 0.15;
      sprite.tint = tint ?? 0xffffff;
      placeSprite(sprite, frames);
      sprite.play();
      container.addChild(sprite);
      slot.layerSprites.set(layer, sprite);
    }
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
  return cache;
}
