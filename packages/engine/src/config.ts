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
 * Liveness is DERIVED, never stored: `energy` drains linearly from its value at
 * `lastUpdated` (the time of the last usage). Status is read off the current energy;
 * the terminal rung is reached purely by an elapsed-time threshold past the point
 * energy hits zero. No background tick is required — see decay.ts.
 */
export const DECAY = {
  /** Fraction of energy (0..1) lost per hour with no usage. 1/16h ≈ full→empty in 16h. */
  energyLostPerHour: 1 / 16,

  /** Energy ladder thresholds (inclusive lower bounds), high → low. */
  thresholds: {
    /** >= lively → "lively" */
    lively: 0.66,
    /** >= weary  → "weary" */
    weary: 0.33,
    /** > 0       → "drained" */
    // (drained is anything above 0 but below `weary`)
  },

  /**
   * Once energy reaches 0 the pet is "fainted" (recoverable). After this many
   * additional hours at zero it crosses the TERMINAL rung. In normal mode the
   * terminal rung is still a (deep) faint; in hardcore mode it is death.
   */
  terminalGraceHours: 24,
} as const;

/**
 * Activity model — the "is this session working right now" signal that drives the
 * mining vs idle animation. Distinct from the energy ladder above (the slow survival
 * meter). It is NOT a decaying window: a pet works from a turn-start event until the
 * matching turn-end (Stop) event, so it goes idle the instant Claude stops.
 */
export const ACTIVITY = {
  /**
   * Safety cap. If a turn-end never arrives (e.g. the daemon died mid-turn), a pet stops
   * "working" this long after the start regardless, rather than mining forever.
   */
  workTimeoutMs: 15 * 60_000,
  /** Energy (0..1) a lightweight turn-start ping restores. */
  pingEnergy: 0.05,
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

/** Terminal-rung behaviour by mode (D1). */
export type Mode = "normal" | "hardcore";

export const MODE: Record<Mode, { terminalIsDeath: boolean }> = {
  /** Default. Terminal rung is a recoverable deep faint — feed to revive. */
  normal: { terminalIsDeath: false },
  /** Hardcore. Terminal rung is permanent death — no revival. */
  hardcore: { terminalIsDeath: true },
} as const;

export type ScoringWeights = typeof SCORING.weights;
