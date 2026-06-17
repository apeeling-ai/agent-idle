#!/usr/bin/env bash
# Print the cloud dev deployment's Convex URL (from .env.cloud.local). Handy for building the
# iOS/web app against cloud, e.g.:
#   VITE_CONVEX_URL="$(scripts/print-cloud-convex-url.sh)" pnpm --filter @agent-idle/app exec tauri ios build --export-method debugging
set -euo pipefail
cd "$(dirname "$0")/.."
grep -E '^(VITE_)?CONVEX_URL=' .env.cloud.local 2>/dev/null | head -1 | sed -E 's/^[^=]+=//' | tr -d '"'
