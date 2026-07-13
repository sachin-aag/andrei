#!/usr/bin/env bash
# Copy Vertex / WIF env vars from andrei-v2 production → andrei-demo production.
# Requires: vercel CLI logged in, access to both projects.
#
# Note: GOOGLE_VERTEX_PROJECT and GCP_WIF_AUDIENCE may be Vercel "Sensitive" vars
# (not readable via CLI). If this script fails, paste those two manually from the
# andrei-v2 dashboard or GCP console (Workload Identity Federation provider page).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

vercel link -p andrei-v2 -y >/dev/null

vercel env run -e production -- bash -s <<'INNER'
set -euo pipefail

for required in GOOGLE_VERTEX_LOCATION GCP_SERVICE_ACCOUNT_EMAIL; do
  if [[ -z "${!required:-}" ]]; then
    echo "error: $required missing from andrei-v2 production" >&2
    exit 1
  fi
done

PROJECT="${GOOGLE_VERTEX_PROJECT:-}"
if [[ -z "$PROJECT" ]]; then
  PROJECT="${GCP_SERVICE_ACCOUNT_EMAIL#*@}"
  PROJECT="${PROJECT%.iam.gserviceaccount.com}"
fi

WIF="${GCP_WIF_AUDIENCE:-}"
if [[ -z "$PROJECT" || -z "$WIF" ]]; then
  echo "error: GOOGLE_VERTEX_PROJECT and/or GCP_WIF_AUDIENCE not available via CLI." >&2
  echo "  These may be Sensitive env vars on andrei-v2. Copy them manually in the Vercel UI:" >&2
  echo "  andrei-v2 → Settings → Environment Variables → Production" >&2
  echo "  GCP_WIF_AUDIENCE is also on the GCP WIF provider details page." >&2
  exit 1
fi

vercel link -p andrei-demo -y >/dev/null

for var in GOOGLE_VERTEX_PROJECT GOOGLE_VERTEX_LOCATION GCP_SERVICE_ACCOUNT_EMAIL GCP_WIF_AUDIENCE; do
  case "$var" in
    GOOGLE_VERTEX_PROJECT) value="$PROJECT" ;;
    GOOGLE_VERTEX_LOCATION) value="$GOOGLE_VERTEX_LOCATION" ;;
    GCP_SERVICE_ACCOUNT_EMAIL) value="$GCP_SERVICE_ACCOUNT_EMAIL" ;;
    GCP_WIF_AUDIENCE) value="$WIF" ;;
  esac
  vercel env rm "$var" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$var" production
  echo "Added $var to andrei-demo (production)"
done

vercel link -p andrei-v2 -y >/dev/null
INNER

echo ""
echo "Done. If AI Check still fails, grant andrei-demo in GCP IAM (Workload Identity User):"
echo "  principal: .../subject/owner:sachin-aags-projects:project:andrei-demo:environment:production"
