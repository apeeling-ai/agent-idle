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
  /**
   * Fraction of energy (0..1) lost per hour with no usage. 6/h ⇒ full→empty in ~10 min,
   * so an idle session-pet visibly weakens (lively→weary→drained→fainted) and dies on a
   * timescale you can actually watch. DEV-fast — raise it for a longer, gentler game.
   */
  energyLostPerHour: 6,

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
   * Once energy reaches 0 the pet is "fainted" (recoverable). After this many additional
   * hours at zero it crosses the TERMINAL rung (death in hardcore, deep faint in normal).
   * 0.1h ≈ 6 min, so death lands ~16 min into an idle session. DEV-fast — tune up.
   */
  terminalGraceHours: 0.1,

  /**
   * After the terminal rung, how many MORE hours before the pet is REMOVED from the
   * menagerie entirely (despawned). A dead pet lingers only this long before it is "gone":
   * filtered from reads and eligible for the sweep to hard-delete. Kept short so dead pets
   * don't pile up on screen — it stays revivable the whole time by using the session.
   * 0.1h ≈ 6 min. DEV-fast — tune up for a longer "dead but recoverable" window.
   */
  removalGraceHours: 0.1,
} as const;

/**
 * Activity model — the "is this session working right now" signal that drives the
 * mining vs idle animation. Distinct from the energy ladder above (the slow survival
 * meter). It is NOT a decaying window: a pet works from a turn-start event until the
 * matching turn-end (Stop) event, so it goes idle the instant Claude stops.
 */
export const ACTIVITY = {
  /**
   * How long after its last "working" signal a pet keeps mining (applied at READ time,
   * so changing this takes effect immediately for every pet — no stored windows to go
   * stale). The sensor renews the signal via tool-use hooks during a turn, so it keeps
   * mining; when work stops (turn end, OR a Ctrl-C interrupt where no end hook fires) the
   * renewals stop and the pet lapses to idle within this window.
   *
   * TRADE-OFF (hooks can't see "still running" vs "interrupted" during a silent tool):
   * bigger = a long single tool won't blink to idle, but a Ctrl-C lingers longer.
   */
  workTimeoutMs: 60_000,
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

/**
 * Pet mode, carried on each entity. Death is ALWAYS recoverable — a session can be revived
 * by using it again at any rung up to removal — so mode no longer changes liveness; there
 * is no permanent-death path. Kept for the stored field and future per-mode tuning (e.g. a
 * harsher decay rate for hardcore), not for an unrevivable terminal state.
 */
export type Mode = "normal" | "hardcore";

export type ScoringWeights = typeof SCORING.weights;
