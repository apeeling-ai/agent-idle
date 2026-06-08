/**
 * DEV-ONLY asset & component gallery. Open with `?gallery` in the Vite dev server
 * (see main.tsx) — needs no Convex/auth. A "pick & choose" browser for every body,
 * animation, zone, sound, tint, state and cosmetic in the project.
 *
 * Self-contained: it renders from gallery/data.ts via the gallery's own CSS sprite
 * renderer (gallery/Sprite.tsx), so it never touches the game's compositor/renderer and
 * can show assets the game doesn't currently wire up (walk/carry/watering, mobs, spare
 * props, the pond/fishing assets). The one shared piece is the real SoundPlayer.
 */

import { useMemo, useRef, useState } from "react";
import { SoundPlayer } from "./render/sound";
import { AnimSprite, CropSprite, Diorama } from "./gallery/Sprite";
import {
  BODIES,
  COSMETICS,
  LIVENESS,
  MORE_GROUNDS,
  MORE_PROPS,
  SOUNDS,
  TINTS,
  ZONE_ANIM,
  ZONES,
  type Anim,
} from "./gallery/data";
import "./DevGallery.css";

const SECTIONS = [
  ["combine", "Pick & choose"],
  ["bodies", "Bodies & animations"],
  ["zones", "Zones"],
  ["spare", "Spare assets"],
  ["sounds", "Sounds"],
  ["palette", "Palette"],
  ["states", "States"],
  ["cosmetics", "Cosmetics"],
] as const;

/** Integer pixel scale that renders a frame of `frameH` near a 64·zoom target height, so
 * 32px NPC frames and 64px hero frames read at a comparable size. */
function dispScale(frameH: number, zoom: number): number {
  return Math.max(1, Math.round((64 * zoom) / frameH));
}

export function DevGallery() {
  const [zoom, setZoom] = useState(2);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  // Combiner state.
  const [bodyKey, setBodyKey] = useState("hero");
  const [animName, setAnimName] = useState("mine (crush)");
  const [zoneId, setZoneId] = useState("mine");

  const sound = useRef<SoundPlayer | null>(null);
  if (!sound.current) sound.current = new SoundPlayer();
  const playSound = (cue: "workDone" | "coin") => {
    sound.current?.setMuted(muted);
    sound.current?.play(cue);
  };

  const body = BODIES.find((b) => b.key === bodyKey) ?? BODIES[0];
  const anim: Anim = body.animations.find((a) => a.name === animName) ?? body.animations[0];
  const zone = ZONES.find((z) => z.id === zoneId) ?? null;

  const groups = useMemo(
    () => ({
      worker: BODIES.filter((b) => b.group === "worker"),
      npc: BODIES.filter((b) => b.group === "npc"),
      mob: BODIES.filter((b) => b.group === "mob"),
    }),
    [],
  );

  return (
    <div className="gallery">
      <header className="gallery__top">
        <div>
          <h1>Agent Idle — Asset Gallery</h1>
          <p className="muted">
            Every body, animation, zone, sound, tint, state & cosmetic. Faithful CSS recreation of the in-game render — browse,
            don't ship. (<code>?gallery</code>, dev only.)
          </p>
        </div>
        <div className="gallery__controls">
          <label>
            Zoom
            <input type="range" min={1} max={4} step={1} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
            <b>{zoom}×</b>
          </label>
          <button className={paused ? "on" : ""} onClick={() => setPaused((p) => !p)}>
            {paused ? "▶ Play" : "⏸ Pause"}
          </button>
          <button className={muted ? "on" : ""} onClick={() => setMuted((m) => !m)}>
            {muted ? "🔇 Muted" : "🔊 Sound"}
          </button>
        </div>
        <nav className="gallery__nav">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* ---- Pick & choose ---- */}
      <section id="combine" className="card">
        <h2>Pick &amp; choose</h2>
        <p className="muted">Mix any body + animation + zone. (Tint is a per-pet GPU multiply in-game — see Palette; not applied here.)</p>
        <div className="combine">
          <div className="combine__stage">
            <Diorama ground={zone?.ground ?? null} prop={zone?.prop ?? null} body={anim} stage={220} paused={paused} />
          </div>
          <div className="combine__controls">
            <label>
              Body
              <select
                value={bodyKey}
                onChange={(e) => {
                  const b = BODIES.find((x) => x.key === e.target.value)!;
                  setBodyKey(b.key);
                  if (!b.animations.some((a) => a.name === animName)) setAnimName(b.animations[0].name);
                }}
              >
                <optgroup label="Worker">
                  {groups.worker.map((b) => (
                    <option key={b.key} value={b.key}>{b.label}</option>
                  ))}
                </optgroup>
                <optgroup label="NPC / armoured">
                  {groups.npc.map((b) => (
                    <option key={b.key} value={b.key}>{b.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Mobs">
                  {groups.mob.map((b) => (
                    <option key={b.key} value={b.key}>{b.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Animation
              <select value={anim.name} onChange={(e) => setAnimName(e.target.value)}>
                {body.animations.map((a) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Zone
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">— none —</option>
                {ZONES.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
            </label>
            <pre className="config">
{`body:      ${body.label}
animation: ${anim.name}  (${anim.frames}f @ ${anim.fps}fps)
zone:      ${zone ? zone.label : "none"}`}
            </pre>
          </div>
        </div>
      </section>

      {/* ---- Bodies & animations ---- */}
      <section id="bodies" className="card">
        <h2>Bodies &amp; animations</h2>
        <p className="muted">
          The <b>worker</b> (Body_A) has the full action set. NPC bodies (the armoured player look) and mobs ship only
          idle/run/death.
        </p>
        {BODIES.map((b) => (
          <div key={b.key} className="bodyrow">
            <div className="bodyrow__name">
              {b.label} <span className="tag">{b.group}</span>
            </div>
            <div className="tiles">
              {b.animations.map((a) => (
                <figure className="tile" key={a.name} style={{ minHeight: 64 * zoom + 28 }}>
                  <div className="tile__art">
                    <AnimSprite anim={a} scale={dispScale(a.frameH, zoom)} paused={paused} />
                  </div>
                  <figcaption>
                    {a.name}
                    <span className="muted"> · {a.frames}f</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ---- Zones ---- */}
      <section id="zones" className="card">
        <h2>Zones</h2>
        <p className="muted">Each zone = a ground pad + a scene prop, with a worker doing the matching action.</p>
        <div className="tiles">
          {ZONES.map((z) => {
            const a = BODIES[0].animations.find((x) => x.name === ZONE_ANIM[z.id]) ?? BODIES[0].animations[0];
            return (
              <figure className="tile tile--zone" key={z.id}>
                <Diorama ground={z.ground} prop={z.prop} body={a} stage={148} paused={paused} />
                <figcaption>
                  <b>{z.label}</b>
                  <span className="muted"> {z.blurb}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>

      {/* ---- Spare assets ---- */}
      <section id="spare" className="card">
        <h2>Spare assets</h2>
        <p className="muted">Clean, verified crops not yet used by a zone — the shelf for building new ones.</p>
        <h3>Grounds</h3>
        <div className="tiles">
          {MORE_GROUNDS.map((g) => (
            <figure className="tile" key={g.label}>
              <div className="tile__art">
                <CropSprite crop={g} scale={dispScale(g.h, zoom)} paused={paused} />
              </div>
              <figcaption>{g.label}</figcaption>
            </figure>
          ))}
        </div>
        <h3>Props</h3>
        <div className="tiles">
          {MORE_PROPS.map((p) => (
            <figure className="tile" key={p.label}>
              <div className="tile__art">
                <CropSprite crop={p} scale={dispScale(p.h, zoom)} paused={paused} />
              </div>
              <figcaption>
                {p.label}
                {p.frames ? <span className="muted"> · {p.frames}f</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---- Sounds ---- */}
      <section id="sounds" className="card">
        <h2>Sounds</h2>
        <div className="sounds">
          {SOUNDS.map((s) => (
            <button key={s.key} className="sound" onClick={() => playSound(s.key)} disabled={muted}>
              <span className="sound__play">▶</span>
              <span>
                <b>{s.label}</b>
                <span className="muted"> {s.desc}</span>
              </span>
            </button>
          ))}
        </div>
        {muted ? <p className="muted">Unmute (top right) to play sounds.</p> : null}
      </section>

      {/* ---- Palette ---- */}
      <section id="palette" className="card">
        <h2>Palette</h2>
        <p className="muted">Per-pet recolour tints — applied in-game as a GPU colour-multiply over the body sprite.</p>
        <div className="swatches">
          {TINTS.map((c) => (
            <div className="swatch" key={c}>
              <div className="swatch__chip" style={{ background: c }} />
              <code>{c}</code>
            </div>
          ))}
        </div>
      </section>

      {/* ---- States ---- */}
      <section id="states" className="card">
        <h2>Liveness states</h2>
        <table className="data">
          <thead>
            <tr>
              <th>status</th>
              <th>what it means / renders</th>
            </tr>
          </thead>
          <tbody>
            {LIVENESS.map((l) => (
              <tr key={l.status}>
                <td>
                  <code>{l.status}</code>
                </td>
                <td className="muted">{l.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- Cosmetics ---- */}
      <section id="cosmetics" className="card">
        <h2>Cosmetics</h2>
        <p className="muted">
          Unlock rules exist in the engine, but <b>no cosmetic art ships yet</b> — these layers render empty in-game until art
          lands. (This is the "make earned armour visible" roadmap item.)
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>id</th>
              <th>label</th>
              <th>layer</th>
              <th>unlock</th>
            </tr>
          </thead>
          <tbody>
            {COSMETICS.map((c) => (
              <tr key={c.id}>
                <td>
                  <code>{c.id}</code>
                </td>
                <td>{c.label}</td>
                <td>
                  <code>{c.layer}</code>
                </td>
                <td className="muted">{c.requires}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="muted gallery__foot">Agent Idle dev gallery · assets from the Pixel Crawler pack (Anokolisa)</footer>
    </div>
  );
}
