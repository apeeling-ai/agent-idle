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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Compositor, type CreatureView, type ZoneId, viewSignature, zoneForView } from "./render/compositor";
import { BASE_SPRITE, HOUSE_BOX, WORLD_AREA, worldLayout, ZONE_INFO } from "./render/layout";
import { PixiRenderer } from "./render/renderer-pixi";
import { SoundPlayer } from "./render/sound";

/** Above this many creatures, suppress per-pet labels (the player's always shows) — scattered
 * small agents would otherwise overlap into an unreadable pile. */
const PET_LABEL_LIMIT = 8;
const PET_PICKER_MAX_H = 220;

export interface Creature {
  key: string;
  /** The Claude Code session id backing this pet. Player has none. */
  sessionId?: string;
  view: CreatureView;
  name: string;
  /** Optional prestige badge (e.g. "Lv 12") shown as a chip above the name. Player only. */
  badge?: string;
  /** Optional second line under the name (e.g. status / "working"). */
  sub?: string;
  /** Local working directory name for this pet's agent session. */
  directoryName?: string;
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

interface PetPicker {
  keys: string[];
  x: number;
  y: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function actionLabel(view: CreatureView): string {
  if (view.failed) return "recovering from a failed turn";
  if (!view.alive || view.status === "dead" || view.status === "fainted") return "resting until recovery";
  if (view.activity !== "active") return view.waiting ? "waiting for input" : "resting between turns";
  switch (view.action) {
    case "shell":
      return "running shell commands";
    case "edit":
      return "writing and editing code";
    case "read":
      return "reading and searching files";
    case "web":
      return "browsing the web";
    default:
      return "working";
  }
}

function statusLabel(view: CreatureView): string {
  if (view.failed) return "failed turn";
  if (!view.alive) return "recovering";
  return view.status;
}

function waitingLabel(view: CreatureView): string | null {
  if (view.activity === "active" || !view.waiting) return null;
  return view.waiting === "alert" ? "needs attention" : "has a question";
}

export function PixiStage({
  creatures,
  onOpenHome,
  onKillPet,
  muted = false,
}: {
  creatures: Creature[];
  /** Clicking the cabin (player's home) calls this — App opens the player menu. */
  onOpenHome?: () => void;
  /** Sends a pet to the graveyard; App owns the Convex mutation. */
  onKillPet?: (sessionId: string) => Promise<void> | void;
  /** When true, the SoundPlayer is silenced (controlled by App's mute toggle). */
  muted?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const soundRef = useRef<SoundPlayer | null>(null);
  // Last seen activity per creature key, so we can detect the active → idle edge ("done
  // working") and ding once. Survives re-renders without retriggering effects.
  const prevActivityRef = useRef(new Map<string, CreatureView["activity"]>());
  const [ready, setReady] = useState(false);
  // Which room the cursor is over → its description shows in a fixed caption (never clipped).
  const [hoveredZone, setHoveredZone] = useState<ZoneId | null>(null);
  // Whether the cursor is over the cabin (clickable → opens the stats dashboard).
  const [hoveredHouse, setHoveredHouse] = useState(false);
  const [selectedPetKey, setSelectedPetKey] = useState<string | null>(null);
  const [petPicker, setPetPicker] = useState<PetPicker | null>(null);
  const [killingSessionId, setKillingSessionId] = useState<string | null>(null);
  // Uniform scale that fits the fixed-coordinate world (WORLD_AREA) into whatever size the
  // resizable window gives the stage. The Pixi canvas AND every HTML overlay live in WORLD_AREA
  // px inside `.grid`, so scaling `.grid` as one unit keeps them all pixel-aligned at any size
  // (no per-element math, no renderer reflow — pixel art stays crisp via image-rendering).
  const [worldScale, setWorldScale] = useState(1);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      setWorldScale(Math.min(w / WORLD_AREA.width, h / WORLD_AREA.height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const selectedPet = selectedPetKey ? creatures.find((c, i) => i > 0 && c.key === selectedPetKey) : undefined;
  const selectedPetPosition = selectedPet ? layout.positions.get(selectedPet.key) : undefined;
  const selectedPetZone = selectedPet ? zoneForView(selectedPet.view) : undefined;
  const pickerPets = petPicker
    ? petPicker.keys
        .map((key) => creatures.find((c, i) => i > 0 && c.key === key))
        .filter((c): c is Creature => Boolean(c))
    : [];
  const petsNear = (key: string): Creature[] => {
    const origin = layout.positions.get(key);
    if (!origin) return [];
    return creatures.filter((c, i) => {
      if (i === 0) return false;
      const p = layout.positions.get(c.key);
      return p ? Math.hypot(p.x - origin.x, p.y - origin.y) <= BASE_SPRITE * 0.7 : false;
    });
  };
  const openPet = (pet: Creature) => {
    const p = layout.positions.get(pet.key);
    if (!p) return;
    const group = petsNear(pet.key);
    if (group.length > 1) {
      setSelectedPetKey(null);
      setPetPicker({ keys: group.map((c) => c.key), x: p.x, y: p.y });
      return;
    }
    setPetPicker(null);
    setSelectedPetKey((cur) => (cur === pet.key ? null : pet.key));
  };

  useEffect(() => {
    if (selectedPetKey && !creatures.some((c, i) => i > 0 && c.key === selectedPetKey)) {
      setSelectedPetKey(null);
    }
    if (petPicker && pickerPets.length === 0) {
      setPetPicker(null);
    }
  }, [creatures, selectedPetKey, petPicker, pickerPets.length]);

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

  // Keep the SoundPlayer in sync with App's mute toggle. Runs after the mount effect (which
  // creates soundRef synchronously), so the ref is set on first run too.
  useEffect(() => {
    soundRef.current?.setMuted(muted);
  }, [muted]);

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
    <div className="stage" ref={stageRef}>
      <div
        className="grid"
        style={{ width: WORLD_AREA.width, height: WORLD_AREA.height, transform: `scale(${worldScale})` }}
      >
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
                {isPlayer ? (
                  // Player shows ONLY its prestige level — no name, no token total.
                  c.badge ? <span className="label__badge">{c.badge}</span> : null
                ) : (
                  <span className="label__name">{c.name}</span>
                )}
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
          {/* Clickable cabin (player's home) → opens the stats dashboard. */}
          {(() => {
            const hx = HOUSE_BOX.x * WORLD_AREA.width;
            const hy = HOUSE_BOX.y * WORLD_AREA.height;
            const left = Math.max(0, hx - (HOUSE_BOX.w * WORLD_AREA.width) / 2);
            const top = Math.max(0, hy - (HOUSE_BOX.h * WORLD_AREA.height) / 2);
            const width = Math.min(WORLD_AREA.width, hx + (HOUSE_BOX.w * WORLD_AREA.width) / 2) - left;
            const height = Math.min(WORLD_AREA.height, hy + (HOUSE_BOX.h * WORLD_AREA.height) / 2) - top;
            return (
              <div
                className="house-hit"
                style={{ left, top, width, height }}
                onMouseEnter={() => setHoveredHouse(true)}
                onMouseLeave={() => setHoveredHouse(false)}
                onClick={onOpenHome}
              />
            );
          })()}
          {/* One caption pinned inside the diorama — shows the hovered room's (or cabin's) blurb,
              so it can never be clipped by the stage's rounded overflow no matter what's hovered. */}
          {hoveredHouse ? (
            <div className="zone-caption">
              <span className="zone-caption__title">Your Cabin</span>
              <span className="zone-caption__desc">Click to open your player menu.</span>
            </div>
          ) : hoveredZone && ZONE_INFO[hoveredZone] ? (
            <div className="zone-caption">
              <span className="zone-caption__title">{ZONE_INFO[hoveredZone].title}</span>
              <span className="zone-caption__desc">{ZONE_INFO[hoveredZone].desc}</span>
            </div>
          ) : null}
        </div>
        <div className="pet-hits">
          {creatures.map((c, i) => {
            if (i === 0) return null;
            const p = layout.positions.get(c.key);
            if (!p) return null;
            const size = BASE_SPRITE * p.scale;
            return (
              <div
                aria-label={`Show details for ${c.name}`}
                className={selectedPetKey === c.key ? "pet-hit pet-hit--selected" : "pet-hit"}
                key={c.key}
                role="button"
                tabIndex={0}
                style={{
                  left: p.x - size / 2,
                  top: p.y - size / 2,
                  width: size,
                  height: size,
                  zIndex: selectedPetKey === c.key ? 800 : Math.round(p.y),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  openPet(c);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  openPet(c);
                }}
              />
            );
          })}
          {petPicker && pickerPets.length > 1 ? (
            <div
              className="pet-picker"
              style={{
                left: Math.min(Math.max(petPicker.x - 86, 8), WORLD_AREA.width - 180),
                top: Math.min(Math.max(petPicker.y - 84, 8), WORLD_AREA.height - PET_PICKER_MAX_H - 8),
                maxHeight: PET_PICKER_MAX_H,
              }}
            >
              <div className="pet-picker__head">
                <div className="pet-picker__title">Choose pet</div>
                <button
                  type="button"
                  className="pet-picker__close"
                  aria-label="Close pet chooser"
                  onClick={() => setPetPicker(null)}
                >
                  x
                </button>
              </div>
              <div className="pet-picker__list">
                {pickerPets.map((pet) => (
                  <button
                    type="button"
                    className="pet-picker__btn"
                    key={pet.key}
                    onClick={() => {
                      setPetPicker(null);
                      setSelectedPetKey(pet.key);
                    }}
                  >
                    <span>{pet.name}</span>
                    <small>{actionLabel(pet.view)}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {selectedPet && selectedPetPosition && selectedPetZone ? (
            <div
              className="pet-card"
              style={{
                left: Math.min(Math.max(selectedPetPosition.x - 95, 8), WORLD_AREA.width - 198),
                top: Math.min(Math.max(selectedPetPosition.y - 118, 8), WORLD_AREA.height - 132),
              }}
            >
              <div className="pet-card__head">
                <div>
                  <div className="pet-card__name">{selectedPet.name}</div>
                  <div className="pet-card__activity">{actionLabel(selectedPet.view)}</div>
                </div>
                <button
                  type="button"
                  className="pet-card__close"
                  aria-label="Close pet details"
                  onClick={() => setSelectedPetKey(null)}
                >
                  x
                </button>
              </div>
              <dl className="pet-card__stats">
                <div>
                  <dt>Status</dt>
                  <dd>{statusLabel(selectedPet.view)}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{ZONE_INFO[selectedPetZone].title}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>{formatTokens(selectedPet.tokens ?? 0)}</dd>
                </div>
              </dl>
              {waitingLabel(selectedPet.view) ? <div className="pet-card__note">{waitingLabel(selectedPet.view)}</div> : null}
              {selectedPet.directoryName ? (
                <div className="pet-card__directory">
                  <span>Directory</span>
                  {selectedPet.directoryName}
                </div>
              ) : null}
              {selectedPet.sessionId && onKillPet ? (
                <button
                  type="button"
                  className="pet-card__kill"
                  disabled={killingSessionId === selectedPet.sessionId}
                  onClick={() => {
                    const sessionId = selectedPet.sessionId;
                    if (!sessionId) return;
                    setKillingSessionId(sessionId);
                    Promise.resolve(onKillPet(sessionId))
                      .then(() => setSelectedPetKey(null))
                      .catch((err) => console.error("[agent-idle] failed to kill pet", err))
                      .finally(() => setKillingSessionId(null));
                  }}
                >
                  {killingSessionId === selectedPet.sessionId ? "Sending..." : "Kill pet"}
                </button>
              ) : null}
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
