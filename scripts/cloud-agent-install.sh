#!/usr/bin/env bash
set -euo pipefail

cd /workspace

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    docker.io postgresql-client
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-client
fi

corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
