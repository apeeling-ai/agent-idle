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
import { CELL_PX, Compositor, type CreatureView, viewSignature } from "./render/compositor";
import { PixiRenderer } from "./render/renderer-pixi";

export interface Creature {
  key: string;
  view: CreatureView;
  name: string;
  /** Optional second line under the name (e.g. status / "working"). */
  sub?: string;
}

export function PixiStage({ creatures }: { creatures: Creature[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const [ready, setReady] = useState(false);

  // Latest creatures, read by the draw effect without making it a dependency.
  const creaturesRef = useRef(creatures);
  creaturesRef.current = creatures;
  const sig = creatures.map((c) => `${c.key}:${viewSignature(c.view)}`).join("|");

  useEffect(() => {
    let disposed = false;
    let local: Compositor | null = null;

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
    };
  }, []);

  // Push the whole menagerie when any creature's rendered content changes.
  useEffect(() => {
    if (ready) compositorRef.current?.showAll(creaturesRef.current.map((c) => c.view));
  }, [ready, sig]);

  return (
    <div className="stage">
      <div ref={hostRef} className="pixi-host" />
      <div className="labels">
        {creatures.map((c) => (
          <div className="label" key={c.key} style={{ width: CELL_PX }}>
            <span className="label__name">{c.name}</span>
            {c.sub ? <span className="label__sub">{c.sub}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
