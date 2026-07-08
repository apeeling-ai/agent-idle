/**
 * Cron registration. Near-empty by design — the system has NO scheduled per-entity tick;
 * liveness is derived lazily by engine.decay.
 *
 * `pruneEventLedger` is the one standing job: a daily, paginated, self-rescheduling
 * retention pass over the append-only event ledger (maintenance.ts) so storage doesn't
 * compound forever. The other optional job is `sweepStale`, for effects nobody is
 * watching — enable it deliberately by uncommenting below; keep it daily and stale-only.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("pruneEventLedger", { hourUTC: 6, minuteUTC: 30 }, internal.maintenance.pruneEventLedger, {});

// Keep the ephemeral device-auth codes table near-empty (10-min TTL codes). Cheap hygiene, and it
// keeps stale rows from blocking a future schema change to the table (see CLAUDE.md).
crons.interval("purgeExpiredDeviceCodes", { minutes: 15 }, internal.deviceAuth.purgeExpiredDeviceCodes, {});

// crons.daily("sweepStale", { hourUTC: 7, minuteUTC: 0 }, internal.maintenance.sweepStale, {});

export default crons;
