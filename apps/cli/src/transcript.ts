/**
 * Read token usage from an agent transcript at the Stop event. Both Claude Code and Codex
 * write JSONL, but the shapes differ, so the parser branches on the agent.
 *
 * Stop fires once per finished turn and the engine ADDS each report (`tokensFed += tokens`),
 * so we return THIS TURN's tokens (a delta). The computation is stateless — it re-derives
 * the turn from the transcript each time — so a daemon restart can't corrupt the total.
 *
 * We count the FULL token throughput: input + output + cache-read + cache-creation. In
 * Claude Code the whole conversation is re-read from cache every turn, so cache reads are
 * the bulk of real usage; counting only input+output undercounts by orders of magnitude.
 *
 * PRIVACY: we read ONLY numeric usage here — never message content. Nothing from the
 * transcript text is stored or transmitted.
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

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface ClaudeEntry {
  type?: string;
  message?: { content?: unknown; usage?: ClaudeUsage };
}

/** Full token throughput for one assistant API call (incl. cache). */
function usageTotal(u: ClaudeUsage): number {
  return (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

/**
 * A real human PROMPT (the start of a turn) vs a tool_result (a same-turn continuation).
 * Both arrive as `type: "user"`; only tool_results carry a `tool_result` content block.
 */
function isPrompt(e: ClaudeEntry): boolean {
  if (e.type !== "user") return false;
  const c = e.message?.content;
  if (typeof c === "string") return true;
  if (Array.isArray(c)) return !c.some((x) => typeof x === "object" && x !== null && (x as { type?: string }).type === "tool_result");
  return false;
}

/**
 * Claude Code: sum the LAST turn's assistant usage (incl. cache). The turn is everything
 * after the last real prompt — the assistant's reply plus all its tool-loop API calls.
 */
function claudeTokens(text: string): number {
  const entries: ClaudeEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line) as ClaudeEntry);
    } catch {
      /* skip malformed line */
    }
  }
  let start = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && isPrompt(e)) {
      start = i;
      break;
    }
  }
  let tokens = 0;
  for (let i = start; i < entries.length; i++) {
    const u = entries[i]?.message?.usage;
    if (u) tokens += usageTotal(u);
  }
  return tokens;
}

/**
 * Codex rollout JSONL: a `token_count` event carries cumulative `total_token_usage` and a
 * per-turn `last_token_usage`. We prefer `last_token_usage` (this turn's cost), reading
 * from whichever the last such event exposes. The usage block may sit directly under
 * `payload` or under `payload.info`, so we look in both. Codex's `input_tokens` already
 * includes cached tokens (OpenAI counts cache inside input, unlike Claude), so input+output
 * already covers throughput; we prefer an explicit `total_tokens` when present.
 */
function codexTokens(text: string): number {
  interface Usage {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  }
  const sum = (u: Usage | undefined): number => (u ? (u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0)) : 0);
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
