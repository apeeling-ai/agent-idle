/**
 * React host for the Pixi renderer. Bridges React ↔ the renderer seam: it creates ONE
 * PixiRenderer + Compositor for the whole menagerie and pushes the full creature list
 * whenever any creature's rendered content changes (diffed via viewSignature, so the
 * per-second clock tick doesn't restart animations).
 *
 * Names are HTML labels in a row aligned to the canvas cells (CELL_PX each) rather than
 * drawn in Pixi. This component is the only React-aware piece near rendering; the
 * Compositor and renderer stay framework- and Tauri-agnostic so render/ can be extracted.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Compositor, type CreatureView, type ZoneId, viewSignature, zoneForView } from "./render/compositor";
import { BASE_SPRITE, WORLD_AREA, worldLayout, ZONE_INFO } from "./render/layout";
import { PixiRenderer } from "./render/renderer-pixi";
import { SoundPlayer } from "./render/sound";

/** Above this many creatures, suppress per-pet labels (the player's always shows) — scattered
 * small agents would otherwise overlap into an unreadable pile. */
const PET_LABEL_LIMIT = 8;

export interface Creature {
  key: string;
  view: CreatureView;
  name: string;
  /** Optional second line under the name (e.g. status / "working"). */
  sub?: string;
  /** Optional third line — the local repo · topic hint for a pet. */
  sub2?: string;
  /** Cumulative tokens this creature has earned. An INCREASE flies a coin to the player. */
  tokens?: number;
}

/** A coin in flight from a pet's cell to the player's cell (canvas-pixel coords). */
interface Flyer {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export function PixiStage({ creatures }: { creatures: Creature[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const soundRef = useRef<SoundPlayer | null>(null);
  // Last seen activity per creature key, so we can detect the active → idle edge ("done
  // working") and ding once. Survives re-renders without retriggering effects.
  const prevActivityRef = useRef(new Map<string, CreatureView["activity"]>());
  const [ready, setReady] = useState(false);
  // Which room the cursor is over → its description shows in a fixed caption (never clipped).
  const [hoveredZone, setHoveredZone] = useState<ZoneId | null>(null);

  // All creatures share ONE bounded world of action zones: the player (index 0) oversees from
  // its home spot, and each pet stands in the zone matching what it's doing. A pet's spot is a
  // pure function of its id + zone (see worldLayout) — stable across activity-only ticks and
  // identical on every machine — so the layout only changes when a creature joins/leaves or
  // CHANGES ZONE (then the renderer walks it). Single source of truth for slot placement,
  // labels, and coin flights.
  const layoutSig = creatures.map((c, i) => `${c.key}:${i === 0 ? "home" : zoneForView(c.view)}`).join("|");
  const layout = useMemo(
    () => worldLayout(creatures.map((c) => ({ key: c.key, zone: zoneForView(c.view) })), WORLD_AREA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutSig],
  );
  const showPetLabels = creatures.length <= PET_LABEL_LIMIT;

  // Coins in flight (pet → player) when a pet earns tokens.
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const prevTokensRef = useRef(new Map<string, number>());
  const flyerIdRef = useRef(0);
  const startedRef = useRef(new Set<number>());
  const removeFlyer = (id: number) => {
    startedRef.current.delete(id);
    setFlyers((fs) => fs.filter((f) => f.id !== id));
  };

  // Latest creatures, read by the draw effect without making it a dependency.
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;
  const sig = creatures.map((c) => `${c.key}:${viewSignature(c.view)}`).join("|");

  useEffect(() => {
    let disposed = false;
    let local: Compositor | null = null;
    soundRef.current = new SoundPlayer();

    void (async () => {
      const host = hostRef.current;
      if (!host) return;
      try {
        const renderer = await PixiRenderer.create(host);
        if (disposed) {
          renderer.destroy();
          return;
        }
        local = new Compositor(renderer);
        compositorRef.current = local;
        setReady(true);
      } catch (err) {
        console.error("[agent-idle] renderer failed to start", err);
      }
    })();

    return () => {
      disposed = true;
      local?.destroy();
      compositorRef.current = null;
      soundRef.current?.destroy();
      soundRef.current = null;
    };
  }, []);

  // Push the whole menagerie when any creature's rendered content changes, and ding for
  // each creature that just transitioned active → idle (finished a working session).
  useEffect(() => {
    if (!ready) return;
    const current = creaturesRef.current;
    compositorRef.current?.showAll(
      current.map((c) => ({ key: c.key, view: c.view })),
      layout,
    );

    const prev = prevActivityRef.current;
    const seen = new Set<string>();
    for (const c of current) {
      seen.add(c.key);
      const was = prev.get(c.key);
      if (was === "active" && c.view.activity === "idle" && c.view.alive) {
        soundRef.current?.play("workDone");
      }
      prev.set(c.key, c.view.activity);
    }
    // Forget creatures that left so a returning key starts fresh (no stale "active").
    for (const key of [...prev.keys()]) if (!seen.has(key)) prev.delete(key);
  }, [ready, sig, layout]);

  // Detect per-pet token increases → launch a coin from that pet's cell to the player's
  // cell (index 0). Baseline-skip unseen keys so an initial load / fresh pet doesn't burst.
  const tokensSig = creatures.map((c) => `${c.key}:${c.tokens ?? 0}`).join("|");
  useEffect(() => {
    const current = creaturesRef.current;
    const prev = prevTokensRef.current;
    const seen = new Set<string>();
    const COIN = 14;
    const player = current[0] ? layout.positions.get(current[0].key) : undefined;
    current.forEach((c, i) => {
      seen.add(c.key);
      const t = c.tokens ?? 0;
      const was = prev.get(c.key);
      prev.set(c.key, t);
      if (i === 0 || was === undefined || t <= was) return; // player / baseline / no gain
      const from = layout.positions.get(c.key);
      if (!from || !player) return;
      soundRef.current?.play("coin"); // cha-ching as the coin leaves toward the player
      setFlyers((fs) => [
        ...fs,
        {
          id: ++flyerIdRef.current,
          fromX: from.x - COIN / 2,
          fromY: from.y - COIN / 2,
          toX: player.x - COIN / 2,
          toY: player.y - COIN / 2,
        },
      ]);
    });
    for (const key of [...prev.keys()]) if (!seen.has(key)) prev.delete(key);
  }, [tokensSig, layout]);

  return (
    <div className="stage">
      <div className="grid">
        <div ref={hostRef} className="pixi-host" />
        <div className="labels">
          {creatures.map((c, i) => {
            const isPlayer = i === 0;
            // The player's label always shows; pet labels only when the world isn't crowded.
            if (!isPlayer && !showPetLabels) return null;
            const p = layout.positions.get(c.key);
            if (!p) return null;
            return (
              <div
                className="label"
                key={c.key}
                style={{
                  left: p.x,
                  top: p.y + (BASE_SPRITE * p.scale) / 2, // just below the agent's feet
                  transform: "translateX(-50%)", // centered under the anchor
                }}
              >
                <span className="label__name">{c.name}</span>
                {isPlayer && c.sub ? <span className="label__sub">{c.sub}</span> : null}
                {isPlayer && c.sub2 ? <span className="label__where">{c.sub2}</span> : null}
              </div>
            );
          })}
        </div>
        <div className="zones">
          {layout.zones.map((z) => {
            if (!ZONE_INFO[z.id]) return null;
            // Clamp the box to the world bounds so its rounded highlight is never sliced off by
            // the stage's overflow:hidden (the pond hugs the left edge).
            const left = Math.max(0, z.x - z.w / 2);
            const top = Math.max(0, z.y - z.h / 2);
            const width = Math.min(WORLD_AREA.width, z.x + z.w / 2) - left;
            const height = Math.min(WORLD_AREA.height, z.y + z.h / 2) - top;
            return (
              <div
                className="zone-hit"
                key={z.id}
                style={{ left, top, width, height }}
                onMouseEnter={() => setHoveredZone(z.id)}
                onMouseLeave={() => setHoveredZone((cur) => (cur === z.id ? null : cur))}
              />
            );
          })}
          {/* One caption pinned inside the diorama — shows the hovered room's blurb, so it can
              never be clipped by the stage's rounded overflow no matter which room is hovered. */}
          {hoveredZone && ZONE_INFO[hoveredZone] ? (
            <div className="zone-caption">
              <span className="zone-caption__title">{ZONE_INFO[hoveredZone].title}</span>
              <span className="zone-caption__desc">{ZONE_INFO[hoveredZone].desc}</span>
            </div>
          ) : null}
        </div>
        <div className="coins">
          {flyers.map((f) => (
            <div
              key={f.id}
              className="coin"
              ref={(el) => {
                if (!el || startedRef.current.has(f.id)) return;
                startedRef.current.add(f.id);
                const anim = el.animate(
                  [
                    { transform: `translate(${f.fromX}px, ${f.fromY}px) scale(0.7)`, opacity: 0, offset: 0 },
                    { transform: `translate(${f.fromX}px, ${f.fromY}px) scale(1)`, opacity: 1, offset: 0.2 },
                    { transform: `translate(${f.toX}px, ${f.toY}px) scale(0.5)`, opacity: 0, offset: 1 },
                  ],
                  { duration: 800, easing: "ease-in" },
                );
                anim.finished.then(() => removeFlyer(f.id)).catch(() => removeFlyer(f.id));
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
