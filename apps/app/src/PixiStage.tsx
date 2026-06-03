/**
 * React host for the Pixi renderer. Bridges React ↔ the renderer seam: it creates one
 * PixiRenderer + Compositor, and pushes a new CreatureView whenever props change.
 *
 * This component is the only React-aware piece near rendering; the Compositor and
 * renderer themselves stay framework- and Tauri-agnostic so render/ can be extracted.
 */

import { useEffect, useRef, useState } from "react";
import { Compositor, type CreatureView } from "./render/compositor";
import { PixiRenderer } from "./render/renderer-pixi";

export function PixiStage({ view }: { view: CreatureView }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let local: Compositor | null = null;

    void (async () => {
      const host = hostRef.current;
      if (!host) return;
      const renderer = await PixiRenderer.create(host);
      if (disposed) {
        renderer.destroy();
        return;
      }
      local = new Compositor(renderer);
      compositorRef.current = local;
      setReady(true);
    })();

    return () => {
      disposed = true;
      local?.destroy();
      compositorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) compositorRef.current?.show(view);
  }, [ready, view]);

  return <div ref={hostRef} className="pixi-host" />;
}
