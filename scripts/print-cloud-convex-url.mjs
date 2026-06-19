#!/usr/bin/env node
/**
 * Print the cloud dev deployment's Convex URL (from `.env.cloud.local`), e.g. to build the
 * iOS app at the same URL:
 *   VITE_CONVEX_URL="$(node scripts/print-cloud-convex-url.mjs)" \
 *     pnpm --filter @agent-idle/app exec tauri ios build --export-method debugging
 * Cross-platform Node port of print-cloud-convex-url.sh (which used sed/tr). Prints nothing
 * (exit 0) if the file or key is absent.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const file = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), ".env.cloud.local");
try {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^(?:VITE_)?CONVEX_URL=(.*)$/);
    if (m) {
      process.stdout.write(`${m[1].replace(/^["']|["']$/g, "").trim()}\n`);
      break;
    }
  }
} catch {
  /* no cloud env yet — print nothing */
}
