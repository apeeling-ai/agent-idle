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

import { AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, Texture, TilingSprite } from "pixi.js";
import type { AnimationName, Layer, RenderItem, Renderer } from "./compositor";
import { CELL_PX as CELL, LABEL_PX, LAYER_ORDER } from "./compositor";

// Grid row pitch: the sprite cell plus the label strip beneath it (sprite occupies the
// top CELL×CELL of each tile; the strip below is left transparent for the HTML label).
const ROW_H = CELL + LABEL_PX;
import {
  CHARACTER_SHEETS,
  resolveAnimation,
  SCENE_SHEETS,
  sheetUrl,
  sliceFrames,
  type SpriteSheetSet,
} from "./sprites";
// On-screen sprite height. A multiple of both 32 and 64 so every sheet scales by an
// integer factor → crisp pixel art regardless of native frame size.
const SPRITE_PX = 64;

// The contact line within a cell where feet, shadow, and scene props all meet, so the pet
// stands ON the floor instead of floating above its shadow.
const GROUND_Y = CELL * 0.72;
// The worker body plants its feet at a CONSTANT line in EVERY animation — measured: the
// bottom-most opaque pixel is row 47/64 (idle, run, mine, slice, collect, … all identical).
// So one fraction keeps a pet perfectly still when it switches between standing and working
// (the earlier per-pose guesses made chopping jump). 48/64 = 0.75.
const WORKER_FEET_FRAC = 0.75;

// The PLAYER uses an armoured NPC body that fills its frame — feet at the very bottom
// (measured 1.0) — and reads bulkier, so render it a touch smaller with its own feet line.
const PLAYER_SCALE = 0.72;
const PLAYER_FEET_FRAC = 1.0;

type FrameCache = Map<AnimationName, Texture[]>;

/** The layers that make up the CREATURE itself (vs the diorama floor/prop). Only these
 * move during a spawn-walk — the ground pad + prop wait at the destination tile. */
const CREATURE_LAYERS = ["base", "body", "head", "aura", "status"] as const satisfies readonly Layer[];

/** Spawn-walk duration: a new pet appears at the player (top) and runs down to its tile. */
const ENTER_MS = 700;

/** Smoothstep easing (ease-in-out), t in 0..1. Pure. */
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

/** A spawn-walk in progress: the creature layers slide from the player's cell down to this
 * slot's tile while the body runs. `baseAnim/Tint/Key` remember the REAL base layer so it
 * can be restored (we force "run" during transit). */
interface Enter {
  dist: number;
  t: number;
  baseAnim: AnimationName;
  baseTint: number | undefined;
  baseKey: string | null;
}

/** One creature's layer stack, parented under a positioned slot container. */
interface Slot {
  container: Container;
  layerContainers: Map<Layer, Container>;
  layerSprites: Map<Layer, AnimatedSprite | null>;
  /** Last GAME animation applied per layer, so the renderer can detect a death → alive
   * transition and play the revive (get-up) in between. null = layer was empty. */
  layerAnim: Map<Layer, AnimationName | null>;
  /** Last sprite KEY applied per layer. The ground/scene layers keep one animation
   * ("idle") but change sprite per zone, so the steady-state short-circuit must also
   * notice a key change (mine pad → camp pad) to swap the art. null = layer was empty. */
  layerKey: Map<Layer, string | null>;
  /** The ground floor, rendered as a REPEATING tile pad (not a single stretched square)
   * so it reads as a real floor surface. Lives in the `ground` layer container. */
  groundTile: TilingSprite | null;
  /** A soft contact shadow under the pet's feet, so it sits IN the scene instead of
   * floating on the floor square. Drawn once; parented above the ground, below the prop. */
  shadow: Graphics | null;
  /** True for the account avatar (rendered smaller, with its own feet line). */
  isPlayer: boolean;
  /** Active spawn-walk (the pet running in from the player's cell), or null. */
  enter: Enter | null;
  /** Set at creation for a brand-new pet (not the player, not a returning-dead one) so its
   * first layout starts a spawn-walk. Cleared once the walk begins. */
  pendingEnter: boolean;
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
  /** False until the first menagerie is laid out, so pets present on load just appear; only
   * pets that spawn AFTER boot do the run-in-from-the-top walk. */
  private booted = false;

  private constructor(private readonly app: Application) {
    this.root = new Container();
    app.stage.addChild(this.root);
    // Drive spawn-walks each frame (cheap: only iterates slots, acts on entering ones).
    this.app.ticker.add(() => this.tickEnters());
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
    // Character bodies AND the diorama ground/scene art share one cache — keys are
    // namespaced (e.g. "knight" vs "ground.mine") so they never collide.
    for (const [key, set] of Object.entries({ ...CHARACTER_SHEETS, ...SCENE_SHEETS })) {
      this.cache.set(key, await loadSet(set));
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
      slot.isPlayer = it.isPlayer ?? false;
      const targetY = Math.floor(i / cols) * ROW_H;
      slot.container.x = (i % cols) * CELL;
      slot.container.y = targetY;

      // Kick off the spawn-walk: place the creature layers up at the player's cell (top)
      // and let the ticker run them down to this tile. The floor pad + prop stay put.
      const base = it.scene.base;
      if (slot.pendingEnter && targetY > 0) {
        slot.pendingEnter = false;
        slot.enter = { dist: targetY, t: 0, baseAnim: base.animation, baseTint: base.tint, baseKey: base.sprite };
        for (const layer of CREATURE_LAYERS) {
          const c = slot.layerContainers.get(layer);
          if (c) c.y = -targetY;
        }
        if (slot.shadow) slot.shadow.y = -targetY;
      } else {
        slot.pendingEnter = false;
      }

      for (const layer of LAYER_ORDER) {
        const view = it.scene[layer];
        // While walking in, the body RUNS (overriding idle/work). Remember the real base
        // animation so tickEnters can restore it once the pet arrives.
        let anim = view.animation;
        if (slot.enter && layer === "base") {
          slot.enter.baseAnim = view.animation;
          slot.enter.baseTint = view.tint;
          slot.enter.baseKey = view.sprite;
          anim = "run";
        }
        this.applyLayer(slot, layer, view.sprite, anim, view.tint);
      }
    });
    this.booted = true;
  }

  /** Advance any in-progress spawn-walks: slide the creature layers (and shadow) down from
   * the player's cell to this slot's tile, then restore the real base animation. */
  private tickEnters(): void {
    const dt = this.app.ticker.deltaMS;
    for (const slot of this.slots.values()) {
      const e = slot.enter;
      if (!e) continue;
      e.t = Math.min(1, e.t + dt / ENTER_MS);
      const off = -e.dist * (1 - easeInOut(e.t));
      for (const layer of CREATURE_LAYERS) {
        const c = slot.layerContainers.get(layer);
        if (c) c.y = off;
      }
      if (slot.shadow) slot.shadow.y = off;
      if (e.t >= 1) {
        for (const layer of CREATURE_LAYERS) {
          const c = slot.layerContainers.get(layer);
          if (c) c.y = 0;
        }
        if (slot.shadow) slot.shadow.y = 0;
        slot.enter = null;
        // Arrived: swap the running body back to its real animation (idle / work).
        this.applyLayer(slot, "base", e.baseKey, e.baseAnim, e.baseTint);
      }
    }
  }

  private getOrCreateSlot(key: string): Slot {
    const existing = this.slots.get(key);
    if (existing) return existing;

    const container = new Container();
    this.root.addChild(container);
    const layerContainers = new Map<Layer, Container>();
    const layerSprites = new Map<Layer, AnimatedSprite | null>();
    const layerAnim = new Map<Layer, AnimationName | null>();
    const layerKey = new Map<Layer, string | null>();
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
      layerKey.set(layer, null);
    }
    // A soft contact shadow under the feet. Parented directly to the slot container at
    // index 1 — above the ground container (layer 0) so it lands ON the floor, but below
    // the scene prop and the pet body, so they occlude it naturally. Drawn once.
    const shadow = new Graphics();
    shadow.ellipse(CELL / 2, GROUND_Y, CELL * 0.26, CELL * 0.085).fill({ color: 0x000000, alpha: 0.2 });
    shadow.ellipse(CELL / 2, GROUND_Y, CELL * 0.16, CELL * 0.05).fill({ color: 0x000000, alpha: 0.18 });
    container.addChildAt(shadow, 1);

    // A pet that spawns after boot (not the player, not returning from death) runs in from
    // the player's cell. The player and revived pets just appear in place.
    const pendingEnter = this.booted && key !== "player" && !remembered;

    const slot: Slot = {
      container,
      layerContainers,
      layerSprites,
      layerAnim,
      layerKey,
      groundTile: null,
      shadow,
      isPlayer: false,
      enter: null,
      pendingEnter,
    };
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
    // The ground is a repeating tile pad, not an animated sprite — handle it on its own path.
    if (layer === "ground") {
      this.applyGround(slot, spriteKey);
      return;
    }
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
      slot.layerKey.set(layer, null);
      return;
    }

    // Steady state: the same sprite + animation is already playing → just refresh the tint
    // and leave it running. WITHOUT this, any single pet's change would re-push every scene
    // and restart all 100+ sprites' animations in lockstep each frame. The key check also
    // catches a zone swap on the ground/scene layers (same "idle" animation, new art).
    const prevKey = slot.layerKey.get(layer);
    if (existing && prevKey === spriteKey && prevAnim === animation && !reviving) {
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
    placeSprite(sprite, frames, layer, slot.isPlayer);

    if (reviving) {
      // When the get-up finishes, swap to the requested living animation and loop it.
      const liveFrames = sheet!.get(animation);
      const s = sprite;
      s.onComplete = () => {
        s.onComplete = undefined;
        if (!liveFrames || liveFrames.length === 0) return;
        s.textures = liveFrames;
        s.loop = true;
        placeSprite(s, liveFrames, layer, slot.isPlayer);
        s.gotoAndPlay(0);
      };
    } else {
      sprite.onComplete = undefined;
    }

    sprite.gotoAndPlay(0);
    slot.layerAnim.set(layer, animation);
    slot.layerKey.set(layer, spriteKey);
  }

  /**
   * The floor pad: a REPEATING tile (TilingSprite) filling a wide, short platform under the
   * pet, rather than one tile stretched to a square. Reads as an actual floor surface, and
   * swaps texture (no rebuild) when the pet's zone changes. Lives in the ground container.
   */
  private applyGround(slot: Slot, spriteKey: string | null): void {
    const container = slot.layerContainers.get("ground")!;
    const tex = spriteKey ? this.cache.get(spriteKey)?.get("idle")?.[0] : undefined;

    if (!tex) {
      if (slot.groundTile) {
        container.removeChild(slot.groundTile);
        slot.groundTile.destroy();
        slot.groundTile = null;
      }
      slot.layerKey.set("ground", null);
      return;
    }

    if (slot.groundTile && slot.layerKey.get("ground") === spriteKey) return; // same floor

    // A near-square floor footprint (the ORIGINAL size), tiled. Positioned like the original
    // single-tile pad — centred on CELL*0.66 — so the contact line (feet/shadow) sits in its
    // lower half and props stand naturally on it. Tiles render near native size for crispness.
    const PAD_W = CELL * 0.96;
    const PAD_H = CELL * 0.92;
    const tileScale = (CELL * 0.5) / (tex.width || 48);

    if (!slot.groundTile) {
      const tile = new TilingSprite({ texture: tex, width: PAD_W, height: PAD_H });
      tile.x = (CELL - PAD_W) / 2;
      tile.y = CELL * 0.66 - PAD_H / 2; // match the original floor's vertical placement
      tile.tileScale.set(tileScale);
      container.addChild(tile);
      slot.groundTile = tile;
    } else {
      slot.groundTile.texture = tex;
      slot.groundTile.tileScale.set(tileScale);
    }
    slot.layerKey.set("ground", spriteKey);
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: false });
  }
}

/**
 * Place a sprite within its cell. Creature layers center their frame at SPRITE_PX height
 * (idle 32px vs run/mine 64px render the same). The diorama layers are placed to read as a
 * scene: the `scene` prop sits at the pet's feet, offset to the side so it peeks out from
 * behind the body (scene draws under base). The ground pad is handled by applyGround.
 */
function placeSprite(sprite: AnimatedSprite, frames: Texture[], layer: Layer, isPlayer: boolean): void {
  const frameH = frames[0]?.height || SPRITE_PX;

  // ground is handled by applyGround (a tiled pad), never as a plain sprite here.
  if (layer === "scene") {
    sprite.anchor.set(0.5, 1); // bottom-center: the prop stands ON the ground
    sprite.scale.set((CELL * 0.5) / frameH); // ~half-cell tall (original prop size)
    sprite.position.set(CELL * 0.7, CELL * 0.84); // to the right, sat on the floor (original)
    return;
  }

  // The player's armoured body is bulkier with feet at the frame bottom; render it a touch
  // smaller with its own feet line. Pets (worker body) share one feet line across all poses,
  // so switching idle↔working never shifts them vertically.
  const onScreenH = isPlayer ? SPRITE_PX * PLAYER_SCALE : SPRITE_PX;
  const feetFrac = isPlayer ? PLAYER_FEET_FRAC : WORKER_FEET_FRAC;
  sprite.anchor.set(0.5);
  sprite.scale.set(onScreenH / frameH);
  // Drop the sprite so its FEET (feetFrac down the frame) land on GROUND_Y, not float above.
  sprite.position.set(CELL / 2, GROUND_Y - onScreenH * (feetFrac - 0.5));
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
