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

import { AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { AnimationName, Layer, RenderItem, Renderer } from "./compositor";
import { LAYER_ORDER, hashSeed } from "./compositor";
import { WORLD_AREA, HUB_FRAC, type WorldLayout, type ZonePlacement } from "./layout";
import {
  CHARACTER_SHEETS,
  LPC_SHEETS,
  resolveAnimation,
  SCENE_SHEETS,
  sheetUrl,
  sliceFrames,
  type SpriteSheetSet,
  STATUS_SHEETS,
  WORLD_SCENE_SHEETS,
} from "./sprites";
// On-screen sprite height. A multiple of both 32 and 64 so every sheet scales by an
// integer factor → crisp pixel art regardless of native frame size. Matches BASE_SPRITE in
// layout.ts (the layout sizes its placement footprint to this).
const SPRITE_PX = 64;

// Status bubble (?/!) art is a 32-px frame whose tail/pointer tip sits at x≈9 — left of centre.
// We anchor the bubble on that tip so the pointer lands over the pet's head (see placeSprite).
const STATUS_FRAME_PX = 32;
const STATUS_TAIL_TIP_X = 9;

// The shared world: ONE pre-baked grass-map backdrop (terrain + nature + zone props baked in),
// the animated campfire at camp, and the pets that walk between zones. The toggles let the
// world fall back to bare creatures on transparency.
const SHOW_BACKDROP = true;
const SHOW_STATIONS = true;
/** The full pre-baked scene image, drawn as the world backdrop (see bake-world-scene.py). */
const SCENE_KEY = "world.scene";
/** The cabin, baked on its own transparent layer, drawn as a FOREGROUND overlay (above pets,
 * below the player) so a pet walking up behind the house is occluded by it. */
const HOUSE_KEY = "world.house";

/** Explicit z-order within `root` (sortableChildren). Pets sit between the campfire and the house
 * overlay; the player renders ABOVE the house so it stands in front of its own porch. */
const Z_BACKDROP = 0;
const Z_STATIONS = 10;
const Z_PET = 20;
const Z_HOUSE = 30;
const Z_PLAYER = 40;

/** The body layers that swap to a walk cycle while a pet is travelling between zones (the
 * aura/status/scene layers keep their own animation). */
const LOCOMOTION_LAYERS: readonly Layer[] = ["base", "body", "head"];

/** Constant walking speed in px/frame (scaled by ticker.deltaTime), so a travelling pet strolls at
 * a STEADY pace down the roads instead of the old ease-out lerp that zipped most of the way in a
 * few frames (it read as a teleport). Lower = slower. */
const WALK_SPEED = 1.0;
/** Gentle easing for a pet's render scale (only changes if its zone scale changes). */
const SCALE_LERP = 0.14;
/** Arrival threshold (px). */
const ARRIVE_EPS = 1.5;

/** The central path hub in area px — all baked roads radiate from it (matches HUB in
 * bake-world-scene.py). Pets walk current → hub → destination so they follow the roads. */
const HUB = { x: WORLD_AREA.width * HUB_FRAC.x, y: WORLD_AREA.height * HUB_FRAC.y };
/** A per-pet jittered hub waypoint, so several pets routing through the junction at once don't all
 * stack on the exact same pixel. Deterministic per key (same hash the layout uses). */
function hubWaypoint(key: string): { x: number; y: number } {
  const h = hashSeed(key);
  return { x: HUB.x + ((h & 0xff) / 255 - 0.5) * 18, y: HUB.y + (((h >>> 8) & 0xff) / 255 - 0.5) * 14 };
}

/** The one LIVE prop drawn over the baked scene: the flickering campfire at the camp zone
 * (everything else — boulders, trees, grave cairn — is baked into world.scene). */
const CAMP_PROP = "scene.camp";
const FIRE_PX = 44; // on-screen campfire height
/** Corner radius for the rounded world. Applied as a Pixi mask (CSS border-radius doesn't clip
 * a WebGL canvas reliably in the Tauri webview). */
const WORLD_RADIUS = 16;
/** Prop offset from a zone's pet-cluster center — MUST match PROP_DX/PROP_DY in
 * scripts/bake-world-scene.py so the live campfire lands where the baked props do. */
const PROP_DX = 34;
const PROP_DY = 30;

type FrameCache = Map<AnimationName, Texture[]>;

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
  /** Where this pet is walking to (its zone's spot) and the scale it renders at. The ticker
   * walks the container along `path` toward this each frame; on arrival the body layers swap from
   * the walk cycle back to the action animation. */
  tx: number;
  ty: number;
  ts: number;
  /** Remaining road waypoints to walk through, in order (e.g. [hub, spot]); empty when standing
   * still. The pet moves at a constant speed toward path[0], popping each as it arrives. */
  path: { x: number; y: number }[];
  /** Has the slot been positioned yet? The first placement SNAPS (no walk-in from the origin);
   * later zone changes glide. */
  placed: boolean;
  /** True while travelling — body layers show the walk cycle until arrival. */
  moving: boolean;
  /** Facing sign (+1 right / -1 left), flipped to face the direction of travel. */
  facing: number;
  /** The facing the pet settles into when stopped in its zone (toward its prop), so a miner
   * faces the boulder rather than keeping whatever direction it last walked. */
  restFace: number;
  /** The action animation each body layer should show once stopped, so the ticker can restore
   * it on arrival (during travel those layers are overridden to the walk cycle). */
  restAnim: Map<Layer, { sprite: string | null; animation: AnimationName; tint?: number }>;
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
  /** The pre-baked grass-map scene, drawn full-bleed behind every slot. */
  private backdrop: Sprite | null = null;
  /** The live props over the scene (the campfire). Built once; the zone set is fixed. */
  private stations: Container | null = null;
  /** The cabin overlay, drawn above the pets and below the player (foreground occlusion). */
  private houseOverlay: Sprite | null = null;
  /** Rounded-rect mask that clips the whole world to rounded corners. */
  private roundMask: Graphics | null = null;

  private constructor(private readonly app: Application) {
    this.root = new Container();
    // Depth is by explicit zIndex (backdrop < stations < pets < house < player), not add order,
    // so the house overlay can sit between the pets and the player regardless of spawn order.
    this.root.sortableChildren = true;
    app.stage.addChild(this.root);
    // Clip everything (scene + pets) to rounded corners so the world reads as a polished diorama.
    this.roundMask = new Graphics();
    app.stage.addChild(this.roundMask);
    this.root.mask = this.roundMask;
    // Drive the walk: each frame, advance every pet along its road path (see stepWalk).
    this.app.ticker.add((ticker) => this.stepWalk(ticker.deltaTime));
  }

  /** Async factory: boots Pixi, preloads the character sheets, mounts the canvas. */
  static async create(parent: HTMLElement): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      width: WORLD_AREA.width,
      height: WORLD_AREA.height,
      backgroundAlpha: 0, // transparent — ambient over the desktop (outside the backdrop)
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
    for (const [key, set] of Object.entries({ ...CHARACTER_SHEETS, ...LPC_SHEETS, ...SCENE_SHEETS, ...STATUS_SHEETS, ...WORLD_SCENE_SHEETS })) {
      this.cache.set(key, await loadSet(set));
    }
    // LPC_SHEETS provides the player's body + armor/helm/weapon cosmetic layers (keyed by
    // cosmetic id, e.g. "armor.plate"). An equipped id with no sheet (e.g. aura.* — no art
    // yet) simply leaves its layer empty.
  }

  /** Render every creature into the shared, fixed-size world: a tiled floor, a permanent
   * station per action zone, and the pets — each given its zone spot as a walk TARGET (the
   * ticker eases it there). The slot's spot is a pure function of its key + zone (see
   * worldLayout), so a pet only moves when its zone actually changes, never on activity-only
   * ticks or when neighbours come and go. */
  applyScenes(items: RenderItem[], layout: WorldLayout): void {
    const { width, height } = layout.area;
    if (this.app.renderer.width !== width || this.app.renderer.height !== height) {
      this.app.renderer.resize(width, height);
    }
    this.roundMask?.clear().roundRect(0, 0, width, height, WORLD_RADIUS).fill(0xffffff);
    this.ensureBackdrop(width, height);
    this.ensureStations(layout.zones);
    this.ensureHouseOverlay(width, height);

    // Drop slots whose creature is gone (remembering dead ones so they revive on return).
    const present = new Set(items.map((it) => it.key));
    for (const key of [...this.slots.keys()]) {
      if (!present.has(key)) this.removeSlot(key);
    }

    for (const [index, it] of items.entries()) {
      const slot = this.getOrCreateSlot(it.key);
      // Player is always first (compositor renders "player first"). It renders ABOVE the house
      // overlay so it stands in front of its porch; every pet renders below the house.
      slot.container.zIndex = index === 0 ? Z_PLAYER : Z_PET;
      const p = layout.positions.get(it.key);
      if (p) {
        if (!slot.placed) {
          // First appearance: snap to the spot (no slide in from the origin), facing its prop.
          slot.tx = p.x;
          slot.ty = p.y;
          slot.ts = p.scale;
          slot.restFace = p.face;
          slot.facing = p.face;
          slot.container.position.set(p.x, p.y);
          slot.container.scale.set(slot.facing * p.scale, p.scale);
          slot.placed = true;
          slot.moving = false;
          slot.path = [];
        } else {
          // Existing pet: re-route ONLY when its destination actually changes (a zone change) — so
          // an in-progress walk isn't restarted every tick. It walks the ROADS: current → hub →
          // spot, since the baked paths are hub-and-spoke. (The player, index 0, never changes its
          // spot, so it just stays put.)
          const targetMoved = Math.hypot(p.x - slot.tx, p.y - slot.ty) > ARRIVE_EPS;
          slot.tx = p.x;
          slot.ty = p.y;
          slot.ts = p.scale;
          slot.restFace = p.face; // face the prop once settled in this zone
          if (targetMoved) {
            slot.moving = true;
            slot.path = index === 0 ? [{ x: p.x, y: p.y }] : [hubWaypoint(it.key), { x: p.x, y: p.y }];
          }
        }
      }
      for (const layer of LAYER_ORDER) {
        // `ground` is the shared backdrop and `scene` is now per-ZONE stations (ensureStations),
        // not per-agent — skip both per-slot layers. (The Scene still carries them as dead data.)
        if (layer === "ground" || layer === "scene") continue;
        const view = it.scene[layer];
        if (LOCOMOTION_LAYERS.includes(layer)) {
          // Remember the action animation so the ticker can restore it on arrival; show the
          // walk cycle (run) while travelling.
          slot.restAnim.set(layer, { sprite: view.sprite, animation: view.animation, tint: view.tint });
          const anim = slot.moving ? "run" : view.animation;
          this.applyLayer(slot, layer, view.sprite, anim, view.tint);
        } else {
          this.applyLayer(slot, layer, view.sprite, view.animation, view.tint);
        }
      }
    }
  }

  /** Walk every travelling pet along its road path at a constant speed each frame. On reaching a
   * waypoint, advance to the next; on reaching the last, settle and swap the body layers from the
   * walk cycle back to the action animation. Pure transform work — no game state. */
  private stepWalk(delta: number): void {
    const step = WALK_SPEED * delta; // px to advance this frame — a steady stroll, not a glide
    for (const slot of this.slots.values()) {
      if (!slot.placed) continue;
      const c = slot.container;
      if (slot.path.length > 0) {
        const wp = slot.path[0];
        const dx = wp.x - c.x;
        const dy = wp.y - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist > step) {
          // step a fixed distance toward the current waypoint
          c.x += (dx / dist) * step;
          c.y += (dy / dist) * step;
          if (dx < -0.5) slot.facing = -1;
          else if (dx > 0.5) slot.facing = 1;
        } else {
          // reached this waypoint: snap onto it and advance to the next leg of the road
          c.x = wp.x;
          c.y = wp.y;
          slot.path.shift();
          if (slot.path.length === 0 && slot.moving) {
            // arrived at the final spot: settle, face the prop, restore the action animation
            slot.moving = false;
            slot.facing = slot.restFace;
            for (const layer of LOCOMOTION_LAYERS) {
              const rest = slot.restAnim.get(layer);
              if (rest) this.applyLayer(slot, layer, rest.sprite, rest.animation, rest.tint);
            }
          }
        }
      }
      // Ease scale toward target, carrying the facing sign on x so the pet mirrors when walking left.
      const mag = c.scale.y + (slot.ts - c.scale.y) * SCALE_LERP;
      c.scale.set(slot.facing * mag, mag);
      // Counter the facing-flip on the status layer so the ?/! bubble never renders mirrored
      // (and keeps a consistent side regardless of which way the pet faces).
      const statusC = slot.layerContainers.get("status");
      if (statusC) statusC.scale.x = slot.facing;
    }
  }

  /** Create (once) / resize the pre-baked scene that fills the world behind every slot. */
  private ensureBackdrop(width: number, height: number): void {
    if (!SHOW_BACKDROP) return;
    if (!this.backdrop) {
      const texture = this.cache.get(SCENE_KEY)?.get("idle")?.[0];
      if (!texture) return; // scene not loaded — leave the world transparent
      this.backdrop = new Sprite(texture);
      this.backdrop.zIndex = Z_BACKDROP; // behind all slots
      this.root.addChild(this.backdrop);
    }
    this.backdrop.width = width;
    this.backdrop.height = height;
  }

  /** Create (once) the cabin overlay — the baked house on its own transparent layer, drawn
   * full-bleed above the pets (Z_HOUSE) and below the player (Z_PLAYER) so pets behind the
   * cabin are occluded by it. Full-canvas (matches WORLD_AREA) and 1:1 with the backdrop. */
  private ensureHouseOverlay(width: number, height: number): void {
    if (!this.houseOverlay) {
      const texture = this.cache.get(HOUSE_KEY)?.get("idle")?.[0];
      if (!texture) return; // house art not loaded — skip the overlay (pets just don't occlude)
      this.houseOverlay = new Sprite(texture);
      this.houseOverlay.zIndex = Z_HOUSE;
      this.root.addChild(this.houseOverlay);
    }
    this.houseOverlay.width = width;
    this.houseOverlay.height = height;
  }

  /** Lay down the always-present action ZONES (a soft terrain patch + station prop per zone)
   * ONCE, above the baked scene and below the pets. Everything else (boulders, trees, the grave
   * cairn, terrain) is baked into world.scene; only the campfire needs to animate. */
  private ensureStations(zones: ZonePlacement[]): void {
    if (!SHOW_STATIONS || this.stations) return;
    const layer = new Container();
    layer.zIndex = Z_STATIONS; // above the backdrop, below every pet slot
    this.root.addChild(layer);
    this.stations = layer;
    const camp = zones.find((z) => z.id === "camp");
    if (!camp) return;
    const frames = this.cache.get(CAMP_PROP)?.get("idle");
    if (!frames || frames.length === 0) return;
    const fire = new AnimatedSprite(frames);
    fire.animationSpeed = 0.12;
    fire.anchor.set(0.5, 1); // stands ON the terrain
    fire.scale.set(FIRE_PX / frames[0].height);
    // To the right of the camp pets, base at their feet — matching the baker's PROP_DX/PROP_DY.
    fire.position.set(camp.x + PROP_DX, camp.y + PROP_DY);
    fire.play();
    layer.addChild(fire);
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
    const slot: Slot = {
      container,
      layerContainers,
      layerSprites,
      layerAnim,
      layerKey,
      tx: 0,
      ty: 0,
      ts: 1,
      path: [],
      placed: false,
      moving: false,
      facing: 1,
      restFace: 1,
      restAnim: new Map(),
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
    placeSprite(sprite, frames, layer);

    if (reviving) {
      // When the get-up finishes, swap to the requested living animation and loop it.
      const liveFrames = sheet!.get(animation);
      const s = sprite;
      s.onComplete = () => {
        s.onComplete = undefined;
        if (!liveFrames || liveFrames.length === 0) return;
        s.textures = liveFrames;
        s.loop = true;
        placeSprite(s, liveFrames, layer);
        s.gotoAndPlay(0);
      };
    } else {
      sprite.onComplete = undefined;
    }

    sprite.gotoAndPlay(0);
    slot.layerAnim.set(layer, animation);
    slot.layerKey.set(layer, spriteKey);
  }

  /** The pet's current ON-SCREEN anchor — its live walking position and eased render scale (the
   * facing-flip sign on scale.x is stripped). null until the slot has been placed. The React host
   * reads this every frame so name labels and coin flights follow the pet as it strolls, rather
   * than pinning to its destination spot. */
  livePosition(key: string): { x: number; y: number; scale: number } | null {
    const slot = this.slots.get(key);
    if (!slot || !slot.placed) return null;
    return { x: slot.container.position.x, y: slot.container.position.y, scale: Math.abs(slot.container.scale.y) };
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: false });
  }
}

/**
 * Place a sprite within its slot, whose local origin (0,0) is the agent's anchor — the slot
 * container's world x/y/scale (from the layout) does the positioning. The `ground` and `scene`
 * layers no longer reach here (the floor is the shared backdrop and props are per-zone
 * stations); creature layers center on the anchor, and the status bubble floats above the head.
 */
function placeSprite(sprite: AnimatedSprite, frames: Texture[], layer: Layer): void {
  const frameH = frames[0]?.height || SPRITE_PX;

  if (layer === "status") {
    // The attention bubble (?/!) is a speech bubble whose TAIL points down at the pet. The art's
    // tail tip sits at x≈9 of the 32-px frame (left of centre), so anchoring on the geometric
    // centre would let the tail point down-left while the bubble body drifts off to the right —
    // reading as misaligned. Anchor on the tail tip instead, so the pointer lands squarely over
    // the head and the bubble grows up-and-right from it. Its container's x-scale is set to the
    // facing sign each frame (see stepWalk) to cancel the slot's facing-flip, so it never mirrors.
    sprite.anchor.set(STATUS_TAIL_TIP_X / STATUS_FRAME_PX, 1); // tail tip, bottom edge
    sprite.scale.set((SPRITE_PX * 0.5) / frameH); // ~half the body height
    // Bottom of the bubble tucks just onto the head top (body half-height ≈ SPRITE_PX*0.5),
    // so it hugs the pet instead of floating high above it.
    sprite.position.set(0, -SPRITE_PX * 0.4);
    return;
  }

  sprite.anchor.set(0.5);
  sprite.scale.set(SPRITE_PX / frameH);
  sprite.position.set(0, 0);
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
