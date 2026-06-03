/**
 * PixiJS (2D) implementation of the compositor's `Renderer`. This is the ONLY file
 * allowed to import Pixi. It draws the layers; it has no opinion about game state and
 * never imports the engine's logic or any Tauri API.
 */

import { AnimatedSprite, Application, Assets, Container, Rectangle, Texture } from "pixi.js";
import type { AnimationName, Layer, Renderer, Scene } from "./compositor";
import { LAYER_ORDER } from "./compositor";
import {
  SPECIES_SHEETS,
  resolveAnimation,
  sheetUrl,
  sliceFrames,
  type SpriteSheetSet,
} from "./sprites";

const PIXEL_SCALE = 6; // 32px sprite → 192px on screen, crisp

type FrameCache = Map<AnimationName, Texture[]>;

export class PixiRenderer implements Renderer {
  private readonly layerSprites = new Map<Layer, AnimatedSprite | null>();
  private readonly layerContainers = new Map<Layer, Container>();
  /** spriteKey (e.g. "knight") → animation → sliced frame textures. */
  private readonly cache = new Map<string, FrameCache>();

  private constructor(private readonly app: Application) {}

  /** Async factory: boots Pixi, preloads the species sheets, mounts the canvas. */
  static async create(parent: HTMLElement): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      width: 256,
      height: 256,
      backgroundAlpha: 0, // transparent — ambient pet over the desktop
      antialias: false,
    });
    parent.appendChild(app.canvas);

    const renderer = new PixiRenderer(app);

    const stage = new Container();
    stage.scale.set(PIXEL_SCALE);
    app.stage.addChild(stage);
    for (const layer of LAYER_ORDER) {
      const c = new Container();
      stage.addChild(c);
      renderer.layerContainers.set(layer, c);
      renderer.layerSprites.set(layer, null);
    }

    await renderer.preload();
    return renderer;
  }

  private async preload(): Promise<void> {
    for (const [species, set] of Object.entries(SPECIES_SHEETS)) {
      this.cache.set(species, await loadSet(set));
    }
    // TODO: preload cosmetic sheets (helm.*/armor.*/aura.*) once art exists. Until
    // then, unknown sprite keys simply leave their layer empty.
  }

  apply(scene: Scene): void {
    for (const layer of LAYER_ORDER) {
      this.applyLayer(layer, scene[layer].sprite, scene[layer].animation);
    }
  }

  private applyLayer(layer: Layer, spriteKey: string | null, animation: AnimationName): void {
    const container = this.layerContainers.get(layer)!;
    const frames = spriteKey ? this.cache.get(spriteKey)?.get(animation) : undefined;

    // Tear down the existing sprite if the layer is now empty or has no art.
    const existing = this.layerSprites.get(layer);
    if (!frames || frames.length === 0) {
      if (existing) {
        container.removeChild(existing);
        existing.destroy();
        this.layerSprites.set(layer, null);
      }
      return;
    }

    if (existing) {
      existing.textures = frames;
      existing.gotoAndPlay(0);
    } else {
      const sprite = new AnimatedSprite(frames);
      sprite.animationSpeed = 0.15;
      sprite.play();
      container.addChild(sprite);
      this.layerSprites.set(layer, sprite);
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: false });
  }
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
