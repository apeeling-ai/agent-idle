/**
 * Read token usage from an agent transcript at the Stop event. Both Claude Code and Codex
 * write JSONL, but the shapes differ, so the parser branches on the agent.
 *
 * PRIVACY: we read ONLY numeric usage here — never message content. Nothing from the
 * transcript text is stored or transmitted.
 *
 * STUB-ish: this is an approximation (last-turn usage). TODO: attribute tokens per
 * turn precisely, and derive linesAuthored from tool-edit records.
 */

import { existsSync, readFileSync } from "node:fs";
import type { Agent } from "./config.js";

export function readTokenUsage(path: string | undefined, agent: Agent): { tokens: number } {
  if (!path || !existsSync(path)) return { tokens: 0 };
  try {
    const text = readFileSync(path, "utf8");
    return { tokens: agent === "codex" ? codexTokens(text) : claudeTokens(text) };
  } catch {
    return { tokens: 0 };
  }
}

/** Claude Code: assistant entries carry `message.usage`; take the final turn's usage. */
function claudeTokens(text: string): number {
  let tokens = 0;
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { message?: { usage?: { input_tokens?: number; output_tokens?: number } } };
      const usage = obj.message?.usage;
      if (usage) tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
    } catch {
      /* skip malformed line */
    }
  }
  return tokens;
}

/**
 * Codex rollout JSONL: a `token_count` event carries cumulative `total_token_usage` and a
 * per-turn `last_token_usage`. We prefer `last_token_usage` (this turn's cost), reading
 * from whichever the last such event exposes. The usage block may sit directly under
 * `payload` or under `payload.info`, so we look in both. input+output only, to mirror the
 * Claude path (cache/reasoning excluded).
 */
function codexTokens(text: string): number {
  interface Usage {
    input_tokens?: number;
    output_tokens?: number;
  }
  const sum = (u: Usage | undefined): number => (u ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) : 0);
  let tokens = 0;
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as {
        payload?: {
          type?: string;
          last_token_usage?: Usage;
          total_token_usage?: Usage;
          info?: { last_token_usage?: Usage; total_token_usage?: Usage };
        };
      };
      const p = obj.payload;
      if (p?.type !== "token_count") continue;
      const last = p.last_token_usage ?? p.info?.last_token_usage;
      const total = p.total_token_usage ?? p.info?.total_token_usage;
      tokens = last ? sum(last) : sum(total);
    } catch {
      /* skip malformed line */
    }
  }
  return tokens;
}
