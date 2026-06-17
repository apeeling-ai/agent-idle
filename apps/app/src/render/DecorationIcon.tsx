/**
 * Custom season-trophy sprites. One hand-authored pixel-art SVG per decoration `kind` (the engine
 * catalogue in @agent-idle/engine decorations.ts), shared by the cabin overlay, the leaderboard
 * reward preview, and the rewards popup so a season's trophy looks identical everywhere. SVG (not
 * raster) keeps them crisp at any world scale and needs no asset-bake step.
 *
 * Drawn on a 16×16 grid in a flat, few-colours pixel style to sit beside the diorama's pixel art.
 */

import type { ReactElement } from "react";

type IconFn = () => ReactElement;

const ICONS: Record<string, IconFn> = {
  // 🏮 paper lantern — red body, glowing core, wood caps.
  lantern: () => (
    <>
      <rect x="6" y="1.5" width="4" height="1.5" rx="0.4" fill="#8a5a2b" />
      <rect x="7.4" y="0.3" width="1.2" height="1.4" fill="#caa15a" />
      <rect x="3.5" y="3" width="9" height="10" rx="4.5" fill="#d6342c" />
      <rect x="3.5" y="3" width="9" height="10" rx="4.5" fill="#a51f1a" opacity="0.0" />
      <rect x="7.4" y="3" width="1.3" height="10" fill="#ff9b86" opacity="0.85" />
      <rect x="5.2" y="6.5" width="5.6" height="3" rx="1.5" fill="#ffd36b" opacity="0.55" />
      <rect x="6" y="13" width="4" height="1.6" rx="0.4" fill="#8a5a2b" />
      <rect x="7.3" y="14.4" width="1.4" height="1.4" fill="#caa15a" />
    </>
  ),
  // 🌸 cherry blossom — five pink petals, gold centre.
  blossom: () => (
    <>
      <circle cx="8" cy="4" r="2.6" fill="#ffb7d5" />
      <circle cx="12" cy="6.6" r="2.6" fill="#ffb7d5" />
      <circle cx="10.4" cy="11" r="2.6" fill="#ffb7d5" />
      <circle cx="5.6" cy="11" r="2.6" fill="#ffb7d5" />
      <circle cx="4" cy="6.6" r="2.6" fill="#ffb7d5" />
      <circle cx="8" cy="7.6" r="1.7" fill="#ffd36b" />
    </>
  ),
  // 🌻 sunflower — yellow ray petals, brown disc.
  sunflower: () => (
    <>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <rect
            key={i}
            x={7}
            y={1.4}
            width={2}
            height={4}
            rx={1}
            fill="#f7c948"
            transform={`rotate(${(a * 180) / Math.PI} 8 8)`}
          />
        );
      })}
      <circle cx="8" cy="8" r="3.1" fill="#7a4a1e" />
    </>
  ),
  // 🍁 maple leaf — three orange lobes on a stem.
  maple: () => (
    <>
      <polygon points="8,1.5 10.5,6 14,6.5 11,9 12,13.5 8,11 4,13.5 5,9 2,6.5 5.5,6" fill="#e8702a" />
      <rect x="7.5" y="10.5" width="1" height="4" fill="#9c5a23" />
    </>
  ),
  // 🎃 jack-o'-lantern — orange gourd, green stem, carved face.
  pumpkin: () => (
    <>
      <rect x="7.4" y="1.6" width="1.4" height="2.4" fill="#5f8a3a" />
      <ellipse cx="8" cy="9.5" rx="6" ry="5" fill="#e8772a" />
      <ellipse cx="8" cy="9.5" rx="2" ry="5" fill="#f59445" opacity="0.6" />
      <polygon points="5,8 6.8,8 5.9,9.6" fill="#3a230f" />
      <polygon points="11,8 9.2,8 10.1,9.6" fill="#3a230f" />
      <polygon points="5.4,11.4 10.6,11.4 9.4,12.8 8,12 6.6,12.8" fill="#3a230f" />
    </>
  ),
  // ❄️ snowflake — white six-spoke crystal.
  snowflake: () => (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <rect
          key={i}
          x="7.4"
          y="1.5"
          width="1.2"
          height="13"
          rx="0.6"
          fill="#dbeeff"
          transform={`rotate(${i * 60} 8 8)`}
        />
      ))}
      <circle cx="8" cy="8" r="1.6" fill="#bfe2f5" />
    </>
  ),
  // 🎄 evergreen — three green tiers, brown trunk, gold star.
  evergreen: () => (
    <>
      <polygon points="8,1 11,5.5 5,5.5" fill="#2f8f4e" />
      <polygon points="8,4 12,9 4,9" fill="#2f8f4e" />
      <polygon points="8,7 13,12.5 3,12.5" fill="#2f8f4e" />
      <rect x="7.2" y="12.5" width="1.6" height="2.4" fill="#7a4a1e" />
      <circle cx="8" cy="1.4" r="1.1" fill="#ffd36b" />
    </>
  ),
  // ⭐ gold star.
  star: () => (
    <polygon
      points="8,1 9.9,6 15,6 10.8,9.2 12.4,14 8,11 3.6,14 5.2,9.2 1,6 6.1,6"
      fill="#ffd34d"
      stroke="#e0a92e"
      strokeWidth="0.5"
    />
  ),
  // 🌷 tulip — red cup on a green stem with leaves.
  tulip: () => (
    <>
      <rect x="7.5" y="7" width="1" height="7.5" fill="#3f8f3a" />
      <path d="M4.5 10 Q7.5 9 7.8 12 Q5 12 4.5 10 Z" fill="#3f8f3a" />
      <path d="M11.5 10 Q8.5 9 8.2 12 Q11 12 11.5 10 Z" fill="#3f8f3a" />
      <path d="M4.5 5.5 Q4.5 2.5 6 2.8 Q7 1.2 8 2.8 Q9 1.2 10 2.8 Q11.5 2.5 11.5 5.5 Q11.5 8.5 8 8.5 Q4.5 8.5 4.5 5.5 Z" fill="#e0433f" />
      <path d="M8 2.5 L8 8.4" stroke="#b8322f" strokeWidth="0.6" />
    </>
  ),
  // 🍄 toadstool — red spotted cap, cream stem.
  toadstool: () => (
    <>
      <rect x="6.2" y="8.5" width="3.6" height="5.5" rx="1.4" fill="#f0e6cf" />
      <path d="M2.5 9 Q2.5 3 8 3 Q13.5 3 13.5 9 Z" fill="#d6342c" />
      <circle cx="6" cy="6" r="1" fill="#fff" />
      <circle cx="10" cy="6.4" r="0.9" fill="#fff" />
      <circle cx="8" cy="4.6" r="0.7" fill="#fff" />
    </>
  ),
};

/** A generic gift fallback for any kind not (yet) in the catalogue. */
function FallbackIcon() {
  return (
    <>
      <rect x="3" y="6" width="10" height="8" rx="1" fill="#c08a4a" />
      <rect x="3" y="6" width="10" height="2.4" fill="#a06a2e" />
      <rect x="7" y="6" width="2" height="8" fill="#ffd36b" />
      <path d="M5 5 Q8 1 8 5 Q8 1 11 5 Z" fill="#ffd36b" />
    </>
  );
}

/** A season trophy sprite. `kind` is the engine decoration kind; unknown kinds get a gift box. */
export function DecorationIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  const Draw = ICONS[kind];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-hidden
      style={{ display: "block", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
    >
      {Draw ? <Draw /> : <FallbackIcon />}
    </svg>
  );
}

const MEDAL_FILL: Record<number, { ring: string; disc: string }> = {
  1: { ring: "#e0a92e", disc: "#ffd34d" },
  2: { ring: "#9aa7af", disc: "#d6dee3" },
  3: { ring: "#9c6b3a", disc: "#cd863f" },
};

/** A podium medallion for a top-3 finish (place 1/2/3). */
export function MedalIcon({ place, size = 12 }: { place: number; size?: number }) {
  const c = MEDAL_FILL[place] ?? MEDAL_FILL[3];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-hidden style={{ display: "block" }}>
      <polygon points="5,1 7.5,7 5.5,8.5 3,2.5" fill="#c8443a" />
      <polygon points="11,1 8.5,7 10.5,8.5 13,2.5" fill="#c8443a" />
      <circle cx="8" cy="10.5" r="4.5" fill={c.ring} />
      <circle cx="8" cy="10.5" r="3.2" fill={c.disc} />
      <text x="8" y="12.3" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#6a4a14">
        {place}
      </text>
    </svg>
  );
}

/** The placement-tiered season PRIZE: the season's ornament mounted on a gold/silver/bronze
 * medallion. This is what makes 1st/2nd/3rd distinct — same season theme, escalating tier — so the
 * podium rewards never read as "everyone wins the same flower". */
export function PrizeIcon({ kind, place, size = 28 }: { kind: string; place: number; size?: number }) {
  const tier = MEDAL_FILL[place] ?? MEDAL_FILL[3];
  const inner = Math.round(size * 0.5);
  const glow = place === 1 ? "drop-shadow(0 0 3px rgba(255,211,77,0.6))" : "none";
  return (
    <span
      role="img"
      aria-hidden
      style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        style={{ display: "block", filter: `drop-shadow(0 1px 1px rgba(0,0,0,0.4)) ${glow}` }}
      >
        <polygon points="4.2,0 6.7,5.5 4.4,7 2,1" fill="#c8443a" />
        <polygon points="11.8,0 9.3,5.5 11.6,7 14,1" fill="#c8443a" />
        <circle cx="8" cy="9.6" r="6.3" fill={tier.ring} />
        <circle cx="8" cy="9.6" r="5" fill={tier.disc} />
        <circle cx="8" cy="9.6" r="5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
      </svg>
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "60%",
          transform: "translate(-50%, -50%)",
          width: inner,
          height: inner,
          lineHeight: 0,
        }}
      >
        <DecorationIcon kind={kind} size={inner} />
      </span>
    </span>
  );
}

/** A gold trophy cup — the header sprite for the rewards surfaces (replaces the 🏆 emoji). */
export function TrophyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-hidden
      style={{ display: "block", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }}
    >
      <path d="M4 6 a4 4 0 0 0 -2.4 -1.2 a1.6 1.6 0 0 1 0 -2.4 H4 Z" fill="#e0a92e" />
      <path d="M12 6 a4 4 0 0 1 2.4 -1.2 a1.6 1.6 0 0 0 0 -2.4 H12 Z" fill="#e0a92e" />
      <path d="M4 2 h8 v3.2 a4 4 0 0 1 -8 0 Z" fill="#ffd34d" />
      <path d="M6 6.6 a2 1.4 0 0 0 4 0 Z" fill="#e0a92e" opacity="0.6" />
      <rect x="7.2" y="8.4" width="1.6" height="2.6" fill="#e0a92e" />
      <rect x="5" y="11" width="6" height="1.7" rx="0.6" fill="#caa15a" />
      <rect x="4.2" y="12.6" width="7.6" height="1.8" rx="0.7" fill="#b8923f" />
    </svg>
  );
}
