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

import { AnimatedSprite, Application, Assets, Container, Graphics, loadTextures, Rectangle, Sprite, Texture } from "pixi.js";
import type { AnimationName, Layer, RenderItem, Renderer, RenderOptions, ThreadLink } from "./compositor";
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
/** The subagent threads draw just below the pets so helper/parent bodies render on top of them. */
const Z_THREAD = 15;
const Z_PET = 20;
const Z_HOUSE = 30;
const Z_PLAYER = 40;
/** Poof sparkles draw above everyone so the magical exit reads clearly. */
const Z_POOF = 50;

/** The glowing subagent thread: a campfire-amber line with a soft wider glow underneath. */
const THREAD_GLOW = 0xffb86b;
const THREAD_CORE = 0xffe3a3;
/** Poof: a short outward sparkle burst when a helper finishes delivering. */
const POOF_PARTS = 8;
const POOF_LIFE = 28; // frames (~0.45s at 60fps), advanced by ticker delta so it's clock-free

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

/** One live poof burst: outward-drifting sparkle dots that fade over POOF_LIFE frames. */
interface Poof {
  container: Container;
  parts: { g: Graphics; vx: number; vy: number }[];
  life: number;
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
  /** First-appearance one-shot is playing on the base layer. */
  spawning: boolean;
}

export class PixiRenderer implements Renderer {
  /** Creature key → its layer stack. Keyed (not positional) so a pet keeps its sprites and
   * animation state when the menagerie reorders. */
  private readonly slots = new Map<string, Slot>();
  /** Last per-layer animation for keys whose slot was removed WHILE DEAD, so a returning
   * session plays the revive (get-up) instead of popping in. Only dead keys are kept, so
   * it stays small (and is dropped the moment the key returns). */
  private readonly deadMemory = new Map<string, Map<Layer, AnimationName | null>>();
  /** Creature keys that already played first-appearance spawn in this renderer. */
  private readonly spawnedKeys = new Set<string>();
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
  /** The single Graphics that draws every subagent thread, redrawn each frame from live anchors. */
  private threadsLayer: Graphics | null = null;
  /** Current helper→parent threads (set by the host; positions resolved live each frame). */
  private threadLinks: ThreadLink[] = [];
  /** Accumulated frames, for the threads' gentle alpha pulse (clock-free — driven by ticker delta). */
  private threadPhase = 0;
  /** Live poof bursts, advanced + disposed each frame. */
  private poofs: Poof[] = [];
  private renderOptions: RenderOptions = {};

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
    // The subagent threads: ONE Graphics under the pets, cleared + redrawn each frame from the
    // live anchors of each helper and its parent (so the tether tracks both as they move).
    this.threadsLayer = new Graphics();
    this.threadsLayer.zIndex = Z_THREAD;
    this.root.addChild(this.threadsLayer);
    // Drive the walk + the thread redraw + the poof bursts: all advance each frame by ticker delta.
    this.app.ticker.add((ticker) => {
      this.stepWalk(ticker.deltaTime);
      this.drawThreads(ticker.deltaTime);
      this.stepPoofs(ticker.deltaTime);
    });
  }

  /** Async factory: boots Pixi, preloads the character sheets, mounts the canvas. */
  static async create(parent: HTMLElement): Promise<PixiRenderer> {
    // Load textures on the MAIN THREAD via HTMLImageElement, not Pixi's default
    // Web-Worker + createImageBitmap path. Inside a Tauri webview the frontend is served from a
    // custom URL scheme (tauri://localhost / ios), and a worker can't fetch those — so the
    // default path silently fails and every sprite (the world backdrop, pets, player) comes up
    // blank. Main-thread image loading resolves the custom scheme fine. Negligible cost for our
    // handful of small sheets; safe on every platform.
    loadTextures.config = { preferWorkers: false, preferCreateImageBitmap: false, crossOrigin: "anonymous" };

    const app = new Application();
    await app.init({
      // Force WebGL. Pixi 8 prefers WebGPU when present, but WebGPU in a WKWebView (iOS/macOS
      // Tauri) is experimental and renders partially/incorrectly — the backdrop and filtered
      // (tinted) LPC layers come up blank while plain sprites draw. WebGL is solid everywhere.
      preference: "webgl",
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
  applyScenes(items: RenderItem[], layout: WorldLayout, options: RenderOptions = {}): void {
    this.renderOptions = options;
    const { width, height } = layout.area;
    if (this.app.renderer.width !== width || this.app.renderer.height !== height) {
      this.app.renderer.resize(width, height);
    }
    this.roundMask?.clear().roundRect(0, 0, width, height, WORLD_RADIUS).fill(0xffffff);
    if (options.backdrop === false) this.hideBackdrop();
    else this.ensureBackdrop(width, height);
    if (options.stations === false) this.hideStations();
    else this.ensureStations(layout.zones);
    if (options.house === false) this.hideHouseOverlay();
    else this.ensureHouseOverlay(width, height);

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
          slot.spawning = index > 0 && !this.spawnedKeys.has(it.key);
          if (slot.spawning) this.spawnedKeys.add(it.key);
        } else {
          // Existing pet: re-route ONLY when its destination actually changes (a zone change) — so
          // an in-progress walk isn't restarted every tick. Session pets walk the ROADS:
          // current → hub → spot, since the baked paths are hub-and-spoke. Helpers move directly
          // between their own work zone and their parent hand-off point.
          const targetMoved = Math.hypot(p.x - slot.tx, p.y - slot.ty) > ARRIVE_EPS;
          slot.tx = p.x;
          slot.ty = p.y;
          slot.ts = p.scale;
          slot.restFace = p.face; // face the prop once settled in this zone
          if (targetMoved) {
            slot.moving = true;
            slot.path = options.routeMovement === false || index === 0 || it.key.startsWith("helper:") ? [{ x: p.x, y: p.y }] : [hubWaypoint(it.key), { x: p.x, y: p.y }];
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
          const requestedAnim = slot.moving ? "run" : view.animation;
          const anim = layer === "base" && slot.spawning ? "spawn" : requestedAnim;
          this.applyLayer(slot, layer, view.sprite, anim, view.tint, anim === "spawn" ? requestedAnim : undefined);
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
    this.backdrop.visible = true;
    this.backdrop.width = width;
    this.backdrop.height = height;
  }

  private hideBackdrop(): void {
    if (this.backdrop) this.backdrop.visible = false;
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
    this.houseOverlay.visible = true;
    this.houseOverlay.width = width;
    this.houseOverlay.height = height;
  }

  private hideHouseOverlay(): void {
    if (this.houseOverlay) this.houseOverlay.visible = false;
  }

  /** Lay down the always-present action ZONES (a soft terrain patch + station prop per zone)
   * ONCE, above the baked scene and below the pets. Everything else (boulders, trees, the grave
   * cairn, terrain) is baked into world.scene; only the campfire needs to animate. */
  private ensureStations(zones: ZonePlacement[]): void {
    if (!SHOW_STATIONS) return;
    if (this.stations) {
      this.stations.visible = true;
      return;
    }
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

  private hideStations(): void {
    if (this.stations) this.stations.visible = false;
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
      c.zIndex = LAYER_ORDER.indexOf(layer);
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
      spawning: false,
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
    handoffAnimation?: AnimationName,
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

    // Death, spawn, and revive play once (death holds; spawn/revive hand off to a living loop).
    const loop = (playAnim === "death" && this.renderOptions.loopDeath === true) || (playAnim !== "death" && playAnim !== "revive" && playAnim !== "spawn");
    let sprite = existing;
    if (!sprite) {
      sprite = new AnimatedSprite(frames);
      // The player is the LPC paper-doll (its layers are the LPC_SHEETS keys); idle it 80%
      // slower than the pets so the hero reads as calm/ambient rather than twitchy.
      const isPlayerLayer = spriteKey != null && spriteKey in LPC_SHEETS;
      sprite.animationSpeed = isPlayerLayer ? 0.03 : 0.15;
      container.addChild(sprite);
      slot.layerSprites.set(layer, sprite);
    }
    sprite.textures = frames;
    sprite.tint = tint ?? 0xffffff;
    sprite.loop = loop;
    placeSprite(sprite, frames, layer);

    const completionAnimation = reviving ? animation : handoffAnimation;
    if (completionAnimation) {
      // When the one-shot finishes, swap to the requested living animation and loop it.
      const liveFrames = sheet!.get(completionAnimation);
      const s = sprite;
      s.onComplete = () => {
        s.onComplete = undefined;
        if (playAnim === "spawn") slot.spawning = false;
        if (!liveFrames || liveFrames.length === 0) return;
        s.textures = liveFrames;
        s.loop = completionAnimation !== "death";
        placeSprite(s, liveFrames, layer);
        s.gotoAndPlay(0);
        slot.layerAnim.set(layer, completionAnimation);
        slot.layerKey.set(layer, spriteKey);
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

  /** Replace the current set of subagent threads. Positions are resolved live each frame in
   * drawThreads, so this only needs calling when the SET of helpers changes (join/leave/deliver). */
  setThreads(threads: ThreadLink[]): void {
    this.threadLinks = threads;
  }

  /** Redraw every thread as a glowing, gently-drooping campfire-amber line between the live anchors
   * of a helper and its parent. A soft wide glow under a bright thin core; a slow alpha pulse. */
  private drawThreads(delta: number): void {
    const g = this.threadsLayer;
    if (!g) return;
    g.clear();
    if (this.threadLinks.length === 0) return;
    this.threadPhase += delta;
    const pulse = 0.72 + 0.28 * Math.sin(this.threadPhase * 0.12);
    for (const link of this.threadLinks) {
      const a = this.livePosition(link.fromKey);
      const b = this.livePosition(link.toKey);
      if (!a || !b) continue;
      // Anchor both ends at the body center, so the thread reads as attached to the creature
      // rather than dragging from the feet or floating above the head.
      const ax = a.x;
      const ay = a.y - SPRITE_PX * 0.5 * a.scale;
      const bx = b.x;
      const by = b.y - SPRITE_PX * 0.5 * b.scale;
      const dist = Math.hypot(bx - ax, by - ay);
      // Gentle catenary sag: the control point sits at the midpoint, pulled down proportionally.
      const sag = Math.min(30, dist * 0.2);
      const cx = (ax + bx) / 2;
      const cy = (ay + by) / 2 + sag;
      g.moveTo(ax, ay).quadraticCurveTo(cx, cy, bx, by).stroke({ width: 5, color: THREAD_GLOW, alpha: 0.16 * pulse });
      g.moveTo(ax, ay).quadraticCurveTo(cx, cy, bx, by).stroke({ width: 1.75, color: THREAD_CORE, alpha: 0.85 * pulse });
    }
  }

  /** Spawn an outward sparkle burst at (x,y), tinted with the parent's colour — a helper's magical
   * exit after it hands off its work. Pure transform/alpha animation, disposed when it fades out. */
  poof(x: number, y: number, tint: number): void {
    const container = new Container();
    container.position.set(x, y);
    container.zIndex = Z_POOF;
    this.root.addChild(container);
    const parts: Poof["parts"] = [];
    for (let i = 0; i < POOF_PARTS; i++) {
      const angle = (i / POOF_PARTS) * Math.PI * 2;
      const speed = 0.9 + (i % 3) * 0.3;
      const g = new Graphics();
      g.circle(0, 0, 2.1).fill({ color: tint });
      container.addChild(g);
      parts.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 0.35 });
    }
    this.poofs.push({ container, parts, life: 0 });
  }

  /** Advance every live poof: drift each spark outward, grow + fade it, and dispose the burst once
   * it has fully faded. Frame-rate independent via the ticker delta (no wall-clock). */
  private stepPoofs(delta: number): void {
    for (let i = this.poofs.length - 1; i >= 0; i--) {
      const p = this.poofs[i];
      p.life += delta;
      const t = p.life / POOF_LIFE;
      if (t >= 1) {
        this.root.removeChild(p.container);
        p.container.destroy({ children: true });
        this.poofs.splice(i, 1);
        continue;
      }
      for (const part of p.parts) {
        part.g.x += part.vx * delta;
        part.g.y += part.vy * delta;
        part.g.alpha = 1 - t;
        part.g.scale.set(1 + t * 0.7);
      }
    }
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
