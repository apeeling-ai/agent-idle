#!/usr/bin/env bash
#
# `pnpm dev:cloud` — run the dev stack against a CLOUD Convex dev deployment instead of the local
# 0.0.0.0 backend `pnpm dev` uses. Cloud is served over HTTPS at a public *.convex.cloud URL, so a
# physical phone (or any device) can reach it — no LAN IP, firewall, cleartext-ATS, or origin hacks.
#
# `pnpm dev` stays literally unchanged (plain `convex dev` against .env.local = local). Because the
# Convex CLI insists on writing the *active* deployment to .env.local (it ignores --env-file for
# writes), this script keeps the cloud deployment in .env.cloud.local and, for the duration of the
# run, swaps it into .env.local — then RESTORES local on exit (trap). First run auto-provisions the
# cloud deployment (needs `npx convex login`).
#
# Phone vs cloud: build the iOS app at the same URL (no ATS hack needed — HTTPS):
#   VITE_CONVEX_URL="$(scripts/print-cloud-convex-url.sh)" \
#     pnpm --filter @agent-idle/app exec tauri ios build --export-method debugging
set -euo pipefail
cd "$(dirname "$0")/.."

CLOUD_ENV=.env.cloud.local
LOCAL_ENV=.env.local

# Snapshot .env.local (local) up front and restore it on ANY exit — both convex provisioning and
# `convex dev` rewrite .env.local, so this guarantees `pnpm dev` is local again afterwards.
LOCAL_BACKUP=$(mktemp)
cp "$LOCAL_ENV" "$LOCAL_BACKUP"
CONVEX_URL_FILE="$HOME/.agent-idle/convex-url"
cleanup() {
  [ -f "$LOCAL_BACKUP" ] && cp "$LOCAL_BACKUP" "$LOCAL_ENV" && rm -f "$LOCAL_BACKUP" && echo "↩ .env.local restored to local"
  # Drop the daemon's cloud-target override so plain `pnpm dev` / auto-spawned daemons go local again.
  rm -f "$CONVEX_URL_FILE" 2>/dev/null && echo "↩ daemon Convex target reset to local"
}
trap cleanup EXIT INT TERM

# One-time provision: create/point a CLOUD dev deployment and capture it into $CLOUD_ENV.
if ! grep -qE '^CONVEX_DEPLOYMENT=dev:' "$CLOUD_ENV" 2>/dev/null; then
  echo "▶ Provisioning cloud dev deployment (needs \`npx convex login\`)…"
  META=$(grep -E '^CONVEX_DEPLOYMENT=' "$LOCAL_ENV" | head -1 || true)
  TEAM=$(printf '%s\n' "$META" | sed -nE 's/.*#[[:space:]]*team:[[:space:]]*([^,]+),.*/\1/p' | xargs || true)
  PROJECT=$(printf '%s\n' "$META" | sed -nE 's/.*project:[[:space:]]*([^[:space:]]+).*/\1/p' | xargs || true)
  args=(dev --once --configure existing --dev-deployment cloud --codegen disable --typecheck disable)
  [ -n "$TEAM" ] && args+=(--team "$TEAM")
  [ -n "$PROJECT" ] && args+=(--project "$PROJECT")
  convex "${args[@]}"            # writes the cloud deployment into .env.local
  cp "$LOCAL_ENV" "$CLOUD_ENV"   # capture cloud config
  cp "$LOCAL_BACKUP" "$LOCAL_ENV" # restore local immediately
fi

CLOUD_URL=$(grep -E '^CONVEX_URL=' "$CLOUD_ENV" | head -1 | sed -E 's/^[^=]+=//' | tr -d '"')
[ -n "${CLOUD_URL:-}" ] || { echo "✗ No CONVEX_URL in $CLOUD_ENV — delete it and re-run to re-provision."; exit 1; }

# Activate cloud for this run (restored to local on exit by the trap above).
cp "$CLOUD_ENV" "$LOCAL_ENV"
# Persist the cloud target so a hook-AUTO-SPAWNED daemon (no inherited env) also posts to cloud,
# not just the daemon we start here. Removed on exit by cleanup().
mkdir -p "$(dirname "$CONVEX_URL_FILE")"
printf '%s\n' "$CLOUD_URL" > "$CONVEX_URL_FILE"
echo "▶ Cloud Convex: $CLOUD_URL"
echo "  (.env.local temporarily points at cloud; restored to local when you stop dev:cloud)"

pnpm --filter @agent-idle/engine build

VITE_CONVEX_URL="$CLOUD_URL" CONVEX_URL="$CLOUD_URL" \
  concurrently -k -n convex,turbo,daemon -c blue,green,magenta \
    "convex dev" \
    "turbo run dev" \
    "pnpm --filter @agent-idle/cli dev:daemon"
