/**
 * Cron registration. EMPTY by default — the system has NO scheduled per-entity tick;
 * liveness is derived lazily by engine.decay.
 *
 * The only optional job is `sweepStale` (maintenance.ts), for effects nobody is
 * watching. Enable it deliberately by uncommenting below — keep it daily and
 * stale-only.
 */

import { cronJobs } from "convex/server";

const crons = cronJobs();

// import { internal } from "./_generated/api";
// crons.daily("sweepStale", { hourUTC: 7, minuteUTC: 0 }, internal.maintenance.sweepStale, {});

export default crons;
