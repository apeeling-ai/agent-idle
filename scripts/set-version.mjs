// Inject a release version (from the git tag) into the Tauri app manifests.
// Ephemeral — run in CI on the runner; not meant to be committed.
//
// Usage: node scripts/set-version.mjs v0.2.0

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const version = (process.env.VERSION ?? process.argv[2] ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Expected a semver tag like v0.2.0, got: "${process.argv[2] ?? process.env.VERSION}"`);
  process.exit(1);
}

// tauri.conf.json — the bundle version tauri reads.
const confPath = resolve(repoRoot, "apps/app/src-tauri/tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

// Cargo.toml — keep the crate version in lockstep.
const cargoPath = resolve(repoRoot, "apps/app/src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
let replaced = false;
const nextCargo = cargo.replace(/^version = "[^"]*"/m, () => {
  replaced = true;
  return `version = "${version}"`;
});
if (!replaced) {
  console.error("Could not find a [package] version line in Cargo.toml");
  process.exit(1);
}
writeFileSync(cargoPath, nextCargo);

console.log(`Set Tauri app version → ${version}`);
