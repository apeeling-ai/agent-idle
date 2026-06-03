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

import { useEffect, useRef, useState } from "react";
import { CELL_PX, LABEL_PX, Compositor, type CreatureView, viewSignature } from "./render/compositor";
import { PixiRenderer } from "./render/renderer-pixi";
import { SoundPlayer } from "./render/sound";

export interface Creature {
  key: string;
  view: CreatureView;
  name: string;
  /** Optional second line under the name (e.g. status / "working"). */
  sub?: string;
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

  // Track the live window width so the grid is RESPONSIVE: columns = how many cells fit
  // across the window. This keeps the menagerie within the window width (no horizontal
  // clipping) and reflows when the window resizes.
  const [winW, setWinW] = useState(() => (typeof window === "undefined" ? 1024 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const cols = Math.max(1, Math.min(Math.floor(winW / CELL_PX) || 1, creatures.length));
  const rowH = CELL_PX + LABEL_PX;

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
      cols,
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
  }, [ready, sig, cols]);

  // Detect per-pet token increases → launch a coin from that pet's cell to the player's
  // cell (index 0). Baseline-skip unseen keys so an initial load / fresh pet doesn't burst.
  const tokensSig = creatures.map((c) => `${c.key}:${c.tokens ?? 0}`).join("|");
  useEffect(() => {
    const current = creaturesRef.current;
    const prev = prevTokensRef.current;
    const seen = new Set<string>();
    const COIN = 14;
    current.forEach((c, i) => {
      seen.add(c.key);
      const t = c.tokens ?? 0;
      const was = prev.get(c.key);
      prev.set(c.key, t);
      if (i === 0 || was === undefined || t <= was) return; // player / baseline / no gain
      setFlyers((fs) => [
        ...fs,
        {
          id: ++flyerIdRef.current,
          fromX: (i % cols) * CELL_PX + CELL_PX / 2 - COIN / 2,
          fromY: Math.floor(i / cols) * rowH + CELL_PX / 2 - COIN / 2,
          toX: CELL_PX / 2 - COIN / 2,
          toY: CELL_PX / 2 - COIN / 2,
        },
      ]);
    });
    for (const key of [...prev.keys()]) if (!seen.has(key)) prev.delete(key);
  }, [tokensSig, cols, rowH]);

  return (
    <div className="stage">
      <div className="grid">
        <div ref={hostRef} className="pixi-host" />
        <div className="labels">
          {creatures.map((c, i) => (
            <div
              className="label"
              key={c.key}
              style={{
                left: (i % cols) * CELL_PX,
                top: Math.floor(i / cols) * rowH + CELL_PX, // strip below the sprite
                width: CELL_PX,
                height: LABEL_PX,
              }}
            >
              <span className="label__name">{c.name}</span>
              {c.sub ? <span className="label__sub">{c.sub}</span> : null}
            </div>
          ))}
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
