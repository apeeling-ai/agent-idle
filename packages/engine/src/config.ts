/**
 * Single source of truth for every tunable in the engine.
 *
 * Thresholds, decay rates, scoring weights and unlock rules all live here so the
 * Convex authority, the CLI daemon and the app share *identical* math. Changing a
 * number here changes behaviour everywhere at once — which is the whole point.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TIME = {
  HOUR_MS,
  DAY_MS,
} as const;

/**
 * Decay / liveness ladder configuration.
 *
 * Liveness is DERIVED, never stored: `fullness` drains linearly from its value at
 * `lastUpdated`. Status is read off the current fullness; the terminal rung is
 * reached purely by an elapsed-time threshold past the point fullness hits zero.
 * No background tick is required — see decay.ts.
 */
export const DECAY = {
  /** Fraction of fullness (0..1) lost per hour of neglect. 1/16h ≈ full→empty in 16h. */
  fullnessLostPerHour: 1 / 16,

  /** Fullness ladder thresholds (inclusive lower bounds), high → low. */
  thresholds: {
    /** >= healthy → "healthy" */
    healthy: 0.66,
    /** >= hungry  → "hungry" */
    hungry: 0.33,
    /** > 0        → "starving" */
    // (starving is anything above 0 but below `hungry`)
  },

  /**
   * Once fullness reaches 0 the pet is "fainted" (recoverable). After this many
   * additional hours at zero it crosses the TERMINAL rung. In normal mode the
   * terminal rung is still a (deep) faint; in hardcore mode it is death.
   */
  terminalGraceHours: 24,
} as const;

/**
 * Competitive scoring weights (TrainerScore).
 *
 * DECISION SURFACED (see README "Open decisions" #1): `avgPromptQuality` is computed
 * client-side from prompt TEXT, which never leaves the machine (privacy is
 * structural). The server therefore CANNOT recompute or verify it — weighting it
 * into the competitive rank is an unbounded cheat vector.
 *
 * Default below: prompt quality drives the PET ONLY (fill / mood / status, see
 * prompt.ts + events.ts). Its competitive weight is 0 and `includePromptQualityInScore`
 * is false. Flip the flag (and set a weight) ONLY once a server-recomputable quality
 * signal exists. Do not hard-wire quality into rank.
 */
export const SCORING = {
  includePromptQualityInScore: false,
  weights: {
    tokensFed: 1 / 1000, // 1 point per 1k tokens fed
    linesAuthored: 0.5,
    avgPromptQuality: 0, // intentionally 0 — see note above
    survivalStreakDays: 25,
    zoneAchievements: 50,
  },
} as const;

/** Direct interactions (clicks) the app/CLI can emit. */
export const INTERACTION = {
  /** Fullness (0..1) a "pet" click restores — affectionate, not a real meal. */
  petFullnessBump: 0.05,
} as const;

/** Terminal-rung behaviour by mode (D1). */
export type Mode = "normal" | "hardcore";

export const MODE: Record<Mode, { terminalIsDeath: boolean }> = {
  /** Default. Terminal rung is a recoverable deep faint — feed to revive. */
  normal: { terminalIsDeath: false },
  /** Hardcore. Terminal rung is permanent death — no revival. */
  hardcore: { terminalIsDeath: true },
} as const;

export type ScoringWeights = typeof SCORING.weights;
