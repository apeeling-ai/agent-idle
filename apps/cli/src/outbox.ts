/**
 * Durable on-disk outbox (append-only JSONL). Events are enqueued here the moment they
 * are signed, so they survive daemon restarts and offline periods. The flusher posts
 * them to Convex with retry; each carries an idempotent clientEventId so re-delivery is
 * safe (the server dedups).
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureDir, OUTBOX_PATH } from "./config.js";

/**
 * The exact argument object posted to convex `ingestEvent`. No accountId or signature —
 * the caller is authenticated via the Convex Auth token the daemon sets on the client.
 */
export interface IngestArgs {
  type: "feed" | "pet";
  source: string;
  payload: unknown;
  clientEventId: string;
  clientAt: number;
}

export function enqueue(item: IngestArgs): void {
  ensureDir(OUTBOX_PATH);
  appendFileSync(OUTBOX_PATH, JSON.stringify(item) + "\n");
}

export function readOutbox(): IngestArgs[] {
  if (!existsSync(OUTBOX_PATH)) return [];
  return readFileSync(OUTBOX_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as IngestArgs);
}

export function writeOutbox(items: IngestArgs[]): void {
  ensureDir(OUTBOX_PATH);
  writeFileSync(OUTBOX_PATH, items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""));
}
