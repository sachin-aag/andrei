#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = proceed with build.
# See docs/whitelabel-vercel-deploy.md (andrei-demo production-only mode).

set -euo pipefail

if [ "${VERCEL:-}" != "1" ]; then
  exit 1
fi

if [ "${ANDREI_DEMO_PRODUCTION_ONLY:-}" = "true" ]; then
  production_branch="${ANDREI_DEMO_PRODUCTION_BRANCH:-feat/whitelabel}"
  if [ "${VERCEL_GIT_COMMIT_REF:-}" != "$production_branch" ]; then
    echo "andrei-demo: skipping build for branch ${VERCEL_GIT_COMMIT_REF} (production branch: ${production_branch})"
    exit 0
  fi
fi

exit 1
