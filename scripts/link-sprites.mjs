#!/usr/bin/env node
/**
 * Ensure `apps/app/public/sprites` resolves to the repo's `sprites/` pack on every OS.
 *
 * Git stores that path as a symlink (mode 120000 → "../../../sprites"). On macOS/Linux the
 * clone produces a real symlink and everything works. On a Windows clone with
 * `core.symlinks=false` (the default), git writes a *regular text file* containing the path
 * string instead — so Vite/Tauri can't find the sprite sheets and the creature won't render.
 *
 * This script idempotently repairs that: if the path already resolves to a directory it does
 * nothing (the macOS symlink case, or an already-created junction); otherwise it replaces the
 * stray file/broken link with a Windows **junction** (no admin needed) or a Unix dir symlink.
 *
 * It is wired as `postinstall` and guards `build`/`dev:web`. It MUST never break the install,
 * so every failure is swallowed and the process always exits 0.
 */
import { existsSync, lstatSync, statSync, rmSync, unlinkSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(repoRoot, "sprites");
const link = join(repoRoot, "apps", "app", "public", "sprites");

/** True if `p` (following links/junctions) is an existing directory. */
function resolvesToDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** True if anything at all exists at `p`, including a broken symlink. */
function pathPresent(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

try {
  if (!resolvesToDir(target)) {
    console.warn(`[link-sprites] sprites pack not found at ${target}; skipping (non-fatal).`);
    process.exit(0);
  }
  if (resolvesToDir(link)) {
    // Already correct: native symlink (macOS) or an existing junction (Windows). No-op.
    process.exit(0);
  }
  // Remove whatever is in the way: a stray text file (Windows checkout) or a broken link.
  if (pathPresent(link)) {
    try {
      unlinkSync(link); // works for files, symlinks, and Windows junctions
    } catch {
      try {
        rmSync(link, { recursive: true, force: true });
      } catch {
        /* fall through to symlink attempt */
      }
    }
  }
  const type = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(target, link, type);
  console.log(`[link-sprites] linked apps/app/public/sprites -> sprites/ (${type}).`);
} catch (err) {
  console.warn(`[link-sprites] could not create sprites link (non-fatal): ${err?.message ?? err}`);
}
process.exit(0);
