#!/usr/bin/env node
// Engine purity guardrail (CI). Fails the build if packages/engine imports any
// DOM, Node, or network API. The engine MUST be a pure, headless TS reducer so
// it can be imported identically by Convex mutations, the CLI daemon, and the app.
//
// This is intentionally a dumb static scan (no AST) — it greps source for the
// forbidden surfaces. Keep it conservative: it should never pass bad code, and
// false positives are easy to fix by not using the API.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENGINE_SRC = join(ROOT, "packages", "engine", "src");

// Test files run in Node and are allowed to use Node APIs; they are not shipped
// as part of the engine's pure surface.
const isExcluded = (path) =>
  /\.test\.ts$/.test(path) || /\.spec\.ts$/.test(path) || path.endsWith(".d.ts");

const FORBIDDEN = [
  // Node builtins (bare or node: prefixed)
  { re: /\bfrom\s+["'](node:)?(fs|path|os|crypto|http|https|net|child_process|process|stream|util|events|worker_threads)["']/, label: "Node builtin import" },
  { re: /\brequire\s*\(\s*["'](node:)?[a-z_]+["']\s*\)/, label: "CommonJS require()" },
  // Network
  { re: /\bfetch\s*\(/, label: "fetch()" },
  { re: /\b(XMLHttpRequest|WebSocket|EventSource)\b/, label: "browser network API" },
  // Global ambient objects from Node / DOM
  { re: /\b(document|window|localStorage|navigator|globalThis\.process)\b/, label: "DOM/global access" },
  { re: /\bprocess\.(env|argv|cwd|exit|platform)\b/, label: "process access" },
];

// Blank out comments (keeping line count intact) so doc-comments that merely
// *mention* forbidden APIs ("no fetch", "no DOM") don't trip the scanner.
function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (full.endsWith(".ts")) {
      yield full;
    }
  }
}

const violations = [];
let scanned = 0;

for (const file of walk(ENGINE_SRC)) {
  if (isExcluded(file)) continue;
  scanned++;
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    for (const { re, label } of FORBIDDEN) {
      if (re.test(line)) {
        violations.push(`${relative(ROOT, file)}:${i + 1}  [${label}]  ${line.trim()}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("✗ Engine purity check FAILED. packages/engine must be pure TS");
  console.error("  (no DOM, no Node, no network). Offending lines:\n");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}

console.log(`✓ Engine purity OK — scanned ${scanned} source file(s), no DOM/Node/network usage.`);
