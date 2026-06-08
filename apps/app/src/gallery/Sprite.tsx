/**
 * Self-contained sprite renderer for the dev gallery — NO Pixi, NO game compositor.
 * Animates a sheet by stepping `background-position` on a pixel-scaled <div> from a single
 * shared requestAnimationFrame ticker (cheap even with dozens of sprites on screen). It is
 * a faithful CSS recreation of how the in-game compositor slices/scales the same frames, so
 * the gallery stays decoupled from the game render path while looking the same.
 */

import { useEffect, useRef } from "react";
import type { Anim, Crop } from "./data";
import { assetUrl } from "./data";

type Sub = (now: number) => void;
const subs = new Set<Sub>();
let rafId = 0;
function loop(now: number) {
  for (const s of subs) s(now);
  rafId = requestAnimationFrame(loop);
}
function subscribe(fn: Sub): () => void {
  subs.add(fn);
  if (!rafId) rafId = requestAnimationFrame(loop);
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

export interface SpriteProps {
  sheet: string;
  frameW: number;
  frameH: number;
  x?: number;
  y?: number;
  frames?: number;
  fps?: number;
  /** Integer-ish pixel scale. */
  scale?: number;
  paused?: boolean;
  title?: string;
}

/** One animated (or static, when frames<=1) sprite, scaled crisply. */
export function Sprite({ sheet, frameW, frameH, x = 0, y = 0, frames = 1, fps = 6, scale = 2, paused = false, title }: SpriteProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let idx = 0;
    let last = 0;
    const apply = () => {
      const el = ref.current;
      if (el) el.style.backgroundPosition = `${-(x + idx * frameW)}px ${-y}px`;
    };
    apply();
    if (frames <= 1 || paused) return;
    return subscribe((now) => {
      if (now - last >= 1000 / fps) {
        idx = (idx + 1) % frames;
        last = now;
        apply();
      }
    });
  }, [sheet, frameW, frameH, x, y, frames, fps, paused]);

  return (
    <div title={title} style={{ width: frameW * scale, height: frameH * scale, overflow: "hidden", position: "relative" }}>
      <div
        ref={ref}
        style={{
          width: frameW,
          height: frameH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          backgroundImage: `url(${assetUrl(sheet)})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `${-x}px ${-y}px`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

/** Render an Anim at a given display zoom. */
export function AnimSprite({ anim, scale, paused }: { anim: Anim; scale: number; paused: boolean }) {
  return <Sprite sheet={anim.sheet} frameW={anim.frameW} frameH={anim.frameH} frames={anim.frames} fps={anim.fps} scale={scale} paused={paused} title={anim.name} />;
}

/** Render a static/animated atlas crop at a given display zoom. */
export function CropSprite({ crop, scale, paused }: { crop: Crop; scale: number; paused: boolean }) {
  return <Sprite sheet={crop.sheet} frameW={crop.w} frameH={crop.h} x={crop.x} y={crop.y} frames={crop.frames ?? 1} fps={crop.fps ?? 6} scale={scale} paused={paused} />;
}

/**
 * A composited little scene: ground pad (back) + scene prop + a body on top — the same
 * stacking order the game compositor uses (ground → scene → base). Sized to a square stage.
 */
export function Diorama({
  ground,
  prop,
  body,
  stage = 168,
  paused = false,
}: {
  ground?: Crop | null;
  prop?: Crop | null;
  body?: Anim | null;
  stage?: number;
  paused?: boolean;
}) {
  return (
    <div className="diorama" style={{ position: "relative", width: stage, height: stage }}>
      {ground &&
        (() => {
          const s = (stage * 0.96) / ground.w;
          return (
            <div style={{ position: "absolute", left: (stage - ground.w * s) / 2, top: stage * 0.6 - (ground.h * s) / 2, zIndex: 0 }}>
              <CropSprite crop={ground} scale={s} paused={paused} />
            </div>
          );
        })()}
      {prop &&
        (() => {
          const s = (stage * 0.42) / prop.h;
          return (
            <div style={{ position: "absolute", left: stage * 0.6, top: stage * 0.86 - prop.h * s, zIndex: 1 }}>
              <CropSprite crop={prop} scale={s} paused={paused} />
            </div>
          );
        })()}
      {body &&
        (() => {
          const s = (stage * 0.52) / body.frameH;
          return (
            <div style={{ position: "absolute", left: (stage - body.frameW * s) / 2, top: stage * 0.9 - body.frameH * s, zIndex: 2 }}>
              <AnimSprite anim={body} scale={s} paused={paused} />
            </div>
          );
        })()}
    </div>
  );
}
