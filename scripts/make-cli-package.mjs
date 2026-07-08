// Stage a publishable `agent-idle` npm package from the bundled CLI output.
//
// We publish the scoped, public `@agent-idle/cli` (bare `agent-idle` is taken
// on npm by an unrelated owner). The installed command stays `agent-idle` via
// the bin below; users run `npx @agent-idle/cli`. The engine is inlined by tsup
// (see apps/cli/tsup.config.ts), so the manifest only declares real registry deps.
//
// Usage: VERSION=v0.2.0 node scripts/make-cli-package.mjs
//    or: node scripts/make-cli-package.mjs 0.2.0

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cliDir = resolve(repoRoot, "apps/cli");
const bundleDir = resolve(cliDir, "dist-npm");
const outDir = resolve(cliDir, "npm");

const version = (process.env.VERSION ?? process.argv[2] ?? "").replace(/^v/, "");
if (!version) {
  console.error("VERSION required (env VERSION or first arg), e.g. VERSION=v0.2.0");
  process.exit(1);
}
if (!existsSync(resolve(bundleDir, "index.js"))) {
  console.error(`Missing ${bundleDir}/index.js — run \`pnpm --filter @agent-idle/cli build:npm\` first.`);
  process.exit(1);
}

const src = JSON.parse(readFileSync(resolve(cliDir, "package.json"), "utf8"));

const manifest = {
  name: "@agent-idle/cli",
  version,
  description: src.description,
  license: src.license,
  type: "module",
  bin: { "agent-idle": "index.js" },
  files: ["index.js", "README.md"],
  engines: { node: ">=22" },
  repository: {
    type: "git",
    url: "git+https://github.com/apeeling-ai/agent-idle.git",
    directory: "apps/cli",
  },
  // Engine is inlined by tsup; only real registry deps remain external.
  dependencies: {
    convex: src.dependencies.convex,
    "@clack/prompts": src.dependencies["@clack/prompts"],
  },
  publishConfig: { access: "public" },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(resolve(bundleDir, "index.js"), resolve(outDir, "index.js"));

// Ship the CLI's OWN minimal README — never the root repo README, which
// carries internal architecture/roadmap notes we don't want on public npm.
const readme = resolve(cliDir, "README.md");
if (existsSync(readme)) cpSync(readme, resolve(outDir, "README.md"));

writeFileSync(resolve(outDir, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Staged ${manifest.name}@${version} → ${outDir}`);
