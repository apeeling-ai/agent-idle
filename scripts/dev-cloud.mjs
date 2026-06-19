#!/usr/bin/env node
/**
 * `pnpm dev:cloud` — run the dev stack against a CLOUD Convex dev deployment instead of the
 * local backend `pnpm dev` uses. Cloud is served over HTTPS at a public *.convex.cloud URL, so
 * a physical phone (or any device) can reach it. Cross-platform Node port of the original
 * `dev-cloud.sh` (which depended on bash/mktemp/sed/trap/$HOME and broke on native Windows).
 *
 * The Convex CLI insists on writing the *active* deployment to `.env.local` (it ignores
 * --env-file for writes), so we keep the cloud deployment in `.env.cloud.local` and, for the
 * duration of the run, swap it into `.env.local` — then RESTORE on exit. First run
 * auto-provisions the cloud deployment (needs `npx convex login`).
 *
 * Robustness vs. the bash original: the local snapshot is a PERSISTENT file
 * (`.env.devcloud-backup.local`, gitignored), and we restore from it not only on exit/SIGINT/
 * SIGTERM/uncaughtException but also at STARTUP — so a previous crash that left `.env.local`
 * pointed at cloud self-heals on the next run instead of silently poisoning `pnpm dev`.
 *
 * `AGENT_IDLE_DEVCLOUD_SELFTEST=1` exercises the snapshot→activate→restore round-trip without
 * touching Convex or launching the stack (used by the cross-platform verification).
 */
import { existsSync, copyFileSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = !!process.env.AGENT_IDLE_DEVCLOUD_SELFTEST;

// Real run targets the repo + `~/.agent-idle`. The self-test runs entirely in an isolated
// sandbox so it can never touch the live `.env.local` or the daemon's convex-url override.
let LOCAL_ENV, CLOUD_ENV, BACKUP, CONVEX_URL_FILE;
if (SELFTEST) {
  const sb = join(tmpdir(), "agent-idle-devcloud-selftest");
  mkdirSync(sb, { recursive: true });
  LOCAL_ENV = join(sb, ".env.local");
  CLOUD_ENV = join(sb, ".env.cloud.local");
  BACKUP = join(sb, ".env.devcloud-backup.local");
  CONVEX_URL_FILE = join(sb, "convex-url");
  rmSync(BACKUP, { force: true });
  writeFileSync(LOCAL_ENV, "CONVEX_DEPLOYMENT=local:seed # team: t, project: p\nCONVEX_URL=http://127.0.0.1:3210\n");
} else {
  LOCAL_ENV = join(repoRoot, ".env.local");
  CLOUD_ENV = join(repoRoot, ".env.cloud.local");
  BACKUP = join(repoRoot, ".env.devcloud-backup.local"); // gitignored by `.env.*.local`
  CONVEX_URL_FILE = join(homedir(), ".agent-idle", "convex-url");
}

let child = null;
let cleanedUp = false;

/** Restore local config + drop the daemon's cloud override. Sync-only (runs in `exit`). */
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    if (existsSync(BACKUP)) {
      copyFileSync(BACKUP, LOCAL_ENV);
      rmSync(BACKUP, { force: true });
      console.log("↩ .env.local restored to its pre-dev:cloud state");
    }
  } catch (e) {
    console.warn(`cleanup: could not restore .env.local: ${e?.message ?? e}`);
  }
  try {
    if (existsSync(CONVEX_URL_FILE)) {
      rmSync(CONVEX_URL_FILE, { force: true });
      console.log("↩ daemon Convex target reset to local");
    }
  } catch {
    /* best effort */
  }
}

process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(sig, () => {
    try {
      child?.kill();
    } catch {
      /* ignore */
    }
    process.exit(130); // triggers the `exit` handler → cleanup()
  });
}
process.on("uncaughtException", (err) => {
  console.error(err);
  process.exit(1); // → cleanup()
});

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const safeRead = (f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
};
/** First matching `KEY=value` (quotes stripped) from an env file. */
function readEnvValue(file, key) {
  const line = safeRead(file).split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim() : "";
}
/** Pull the `# team: X, project: Y` hint Convex writes after CONVEX_DEPLOYMENT. */
function parseTeamProject(file) {
  const line = safeRead(file).split(/\r?\n/).find((l) => l.startsWith("CONVEX_DEPLOYMENT=")) ?? "";
  return {
    team: (line.match(/#\s*team:\s*([^,]+)/)?.[1] ?? "").trim(),
    project: (line.match(/project:\s*(\S+)/)?.[1] ?? "").trim(),
  };
}
/** Run a command string through the platform shell, inheriting stdio. */
function runShell(cmd, env = process.env) {
  return spawnSync(cmd, { cwd: repoRoot, stdio: "inherit", shell: true, env });
}

// --- 1. Self-heal + snapshot local config ----------------------------------
if (existsSync(BACKUP)) {
  // A previous run didn't clean up (crash/kill). BACKUP holds the true local config — restore it.
  try {
    copyFileSync(BACKUP, LOCAL_ENV);
    console.log("↩ recovered .env.local from an interrupted previous dev:cloud run");
  } catch {
    /* fall through */
  }
} else {
  if (!existsSync(LOCAL_ENV)) {
    die(".env.local not found — run `pnpm dev` once first to create the local deployment.");
  }
  copyFileSync(LOCAL_ENV, BACKUP);
}

// --- 2. One-time provision of the cloud dev deployment ----------------------
if (!/^CONVEX_DEPLOYMENT=dev:/m.test(safeRead(CLOUD_ENV))) {
  if (!SELFTEST) {
    console.log("▶ Provisioning cloud dev deployment (needs `npx convex login`)…");
    const { team, project } = parseTeamProject(LOCAL_ENV);
    let cmd =
      "npx --no-install convex dev --once --configure existing --dev-deployment cloud --codegen disable --typecheck disable";
    if (team) cmd += ` --team "${team}"`;
    if (project) cmd += ` --project "${project}"`;
    if (runShell(cmd).status !== 0) die("cloud provisioning failed");
    copyFileSync(LOCAL_ENV, CLOUD_ENV); // capture cloud config
    copyFileSync(BACKUP, LOCAL_ENV); // restore local immediately
  }
}

// --- 3. Activate cloud for this run -----------------------------------------
const cloudUrl = readEnvValue(CLOUD_ENV, "CONVEX_URL") || (SELFTEST ? "https://selftest.example" : "");
if (!cloudUrl) die(`no CONVEX_URL in ${CLOUD_ENV} — delete it and re-run to re-provision.`);

if (SELFTEST) {
  writeFileSync(LOCAL_ENV, `# DEVCLOUD-SELFTEST-ACTIVE\nCONVEX_URL=${cloudUrl}\n`);
} else {
  copyFileSync(CLOUD_ENV, LOCAL_ENV);
}
mkdirSync(dirname(CONVEX_URL_FILE), { recursive: true });
writeFileSync(CONVEX_URL_FILE, `${cloudUrl}\n`);
console.log(`▶ Cloud Convex: ${cloudUrl}`);
console.log("  (.env.local temporarily points at cloud; restored when you stop dev:cloud)");

if (SELFTEST) {
  console.log("SELFTEST: activation done — exiting to trigger cleanup.");
  process.exit(0); // → cleanup() restores .env.local from BACKUP
}

// --- 4. Build the engine, then run the stack against cloud ------------------
if (runShell("pnpm --filter @agent-idle/engine build").status !== 0) die("engine build failed");

const env = { ...process.env, VITE_CONVEX_URL: cloudUrl, CONVEX_URL: cloudUrl };
const stack =
  'concurrently -k -n convex,turbo,daemon -c blue,green,magenta "convex dev" "turbo run dev" "pnpm --filter @agent-idle/cli dev:daemon"';
child = spawn(stack, { cwd: repoRoot, stdio: "inherit", shell: true, env });
child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
