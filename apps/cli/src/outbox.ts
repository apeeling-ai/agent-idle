/**
 * Durable on-disk outbox (append-only JSONL). Events are enqueued here the moment they
 * are signed, so they survive daemon restarts and offline periods. The flusher posts
 * them to Convex with retry; each carries an idempotent clientEventId so re-delivery is
 * safe (the server dedups).
 */

import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureDir, OUTBOX_PATH } from "./config.js";

/** Owner-only: the outbox holds only numeric events, but it rides next to the auth token in
 * ~/.agent-idle, so keep it 0600 for consistency. Best-effort on pre-existing files. */
function tighten(): void {
  try {
    chmodSync(OUTBOX_PATH, 0o600);
  } catch {
    /* not created yet / best effort */
  }
}

/**
 * The exact argument object posted to convex `ingestEvent`. No accountId or signature —
 * the caller is authenticated via the Convex Auth token the daemon sets on the client.
 */
export interface IngestArgs {
  type: "register" | "activity";
  /** The Claude Code session this event belongs to (one pet per session). */
  sessionId: string;
  source: string;
  payload: unknown;
  clientEventId: string;
  clientAt: number;
}

export function enqueue(item: IngestArgs): void {
  ensureDir(OUTBOX_PATH, 0o700);
  appendFileSync(OUTBOX_PATH, JSON.stringify(item) + "\n", { mode: 0o600 });
  tighten();
}

export function readOutbox(): IngestArgs[] {
  if (!existsSync(OUTBOX_PATH)) return [];
  // Parse per-line and SKIP any unparseable line. A crash mid-append (or any corruption) can
  // leave a partial line; without this a single bad line would throw on every flush and `status`
  // call, silently wedging all event delivery forever.
  return readFileSync(OUTBOX_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as IngestArgs];
      } catch {
        return [];
      }
    });
}

export function writeOutbox(items: IngestArgs[]): void {
  ensureDir(OUTBOX_PATH, 0o700);
  writeFileSync(OUTBOX_PATH, items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""), {
    mode: 0o600,
  });
  tighten();
}
