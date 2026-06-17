/**
 * Season trophies — the decoration a player earns for every 2-week season they take part in, hung
 * on their cabin once that season has ended.
 *
 * Like world coordinates and liveness, this is DERIVED, never stored: the same season index maps
 * to the same decoration on every machine, so the authority needs no award table and no end-of-
 * season job. A season is "won" simply because the current season index (engine.seasonIndexOf)
 * has advanced past it. The catalogue cycles, so consecutive seasons always look different; after
 * a full lap of the catalogue it repeats.
 */

export interface SeasonDecoration {
  /** Stable id — analytics + a future sprite-asset key. */
  kind: string;
  /** The ornament shown on the cabin and in the UI. */
  glyph: string;
  /** Human-readable name, e.g. for a tooltip ("Season 7 · Maple Leaf"). */
  label: string;
}

/** The rotating catalogue. Order matters — it's the per-season sequence (season 0 → index 0).
 * Keep entries visually distinct so adjacent seasons never look the same. */
export const SEASON_DECORATIONS: readonly SeasonDecoration[] = [
  { kind: "lantern", glyph: "🏮", label: "Paper Lantern" },
  { kind: "blossom", glyph: "🌸", label: "Cherry Blossom" },
  { kind: "sunflower", glyph: "🌻", label: "Sunflower" },
  { kind: "maple", glyph: "🍁", label: "Maple Leaf" },
  { kind: "pumpkin", glyph: "🎃", label: "Jack-o'-Lantern" },
  { kind: "snowflake", glyph: "❄️", label: "Snowflake" },
  { kind: "evergreen", glyph: "🎄", label: "Evergreen" },
  { kind: "star", glyph: "⭐", label: "Gold Star" },
  { kind: "tulip", glyph: "🌷", label: "Tulip" },
  { kind: "toadstool", glyph: "🍄", label: "Toadstool" },
] as const;

/** The decoration earned for a given season index. Cycles through the catalogue and is safe for
 * any integer (the modulo is normalised so negative indices never throw). */
export function decorationForSeason(season: number): SeasonDecoration {
  const n = SEASON_DECORATIONS.length;
  const idx = ((Math.trunc(season) % n) + n) % n; // normalised into [0, n) — always in range
  return SEASON_DECORATIONS[idx] as SeasonDecoration;
}

/** A podium medal — the badge a top-3 season finish earns, layered on the season's trophy. */
export interface PodiumMedal {
  /** Final rank this medal is for (1, 2, 3). */
  place: number;
  glyph: string;
  label: string;
}

/** The three podium medals, best → worst. Anyone outside the top 3 earns no medal. */
export const PODIUM: readonly PodiumMedal[] = [
  { place: 1, glyph: "🥇", label: "Gold" },
  { place: 2, glyph: "🥈", label: "Silver" },
  { place: 3, glyph: "🥉", label: "Bronze" },
];

/** The medal for a final rank, or null if the rank is off the podium (4th+). */
export function podiumFor(rank: number): PodiumMedal | null {
  return PODIUM.find((p) => p.place === rank) ?? null;
}
