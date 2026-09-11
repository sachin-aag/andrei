#!/usr/bin/env bash
set -euo pipefail

cd /workspace

corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
