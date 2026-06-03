/**
 * Read token usage from a Claude Code transcript at the Stop event. The transcript is
 * JSONL; assistant entries carry `message.usage`. We take the final turn's usage.
 *
 * PRIVACY: we read ONLY numeric usage here — never message content. Nothing from the
 * transcript text is stored or transmitted.
 *
 * STUB-ish: this is an approximation (last-turn usage). TODO: attribute tokens per
 * turn precisely, and derive linesAuthored from tool-edit records.
 */

import { existsSync, readFileSync } from "node:fs";

export function readTokenUsage(path: string | undefined): { tokens: number } {
  if (!path || !existsSync(path)) return { tokens: 0 };
  try {
    let tokens = 0;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const obj = JSON.parse(line) as { message?: { usage?: { input_tokens?: number; output_tokens?: number } } };
        const usage = obj.message?.usage;
        if (usage) tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      } catch {
        /* skip malformed line */
      }
    }
    return { tokens };
  } catch {
    return { tokens: 0 };
  }
}
