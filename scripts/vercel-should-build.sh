#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = proceed with build.
#
# One GitHub repo, two Vercel projects (andrei-v2 = MJ, andrei-demo = customer demo).
# Trunk is `main`. Both projects build `main` plus PR heads (`cursor/*`, `demo/*`).
# feat/whitelabel is demo-only until that branch is deleted.
# Keep Neon "Create a branch for each preview deployment" OFF on andrei-v2.
# See docs/whitelabel-vercel-deploy.md (customer deploys).

set -euo pipefail

if [ "${VERCEL:-}" != "1" ]; then
  exit 1
fi

ref="${VERCEL_GIT_COMMIT_REF:-}"
scope="${ANDREI_VERCEL_DEPLOY_SCOPE:-}"

# Shared production + PR-into-main heads. Vercel ignoreCommand only sees the
# git ref, not the PR base, so these prefixes are the allow-list.
is_shared_line_branch() {
  case "$ref" in
    main) return 0 ;;
    cursor/*) return 0 ;;
    demo/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Leftover fork: build on demo so a push cannot fall through as "unknown".
# MJ still skips it — do not create an Andrei V2 preview from this branch.
is_legacy_whitelabel_branch() {
  [ "$ref" = "feat/whitelabel" ]
}

case "$scope" in
  demo)
    # Legacy: production-only demo (skips PR branches including cursor/*).
    # Prefer ANDREI_VERCEL_DEPLOY_SCOPE=demo without this flag.
    if [ "${ANDREI_DEMO_PRODUCTION_ONLY:-}" = "true" ]; then
      production_branch="${ANDREI_DEMO_PRODUCTION_BRANCH:-main}"
      if [ "$ref" != "$production_branch" ]; then
        echo "andrei-demo: skipping branch ${ref} (production branch: ${production_branch})"
        exit 0
      fi
    fi
    if is_shared_line_branch || is_legacy_whitelabel_branch; then
      echo "andrei-demo: building demo-line branch ${ref}"
      exit 1
    fi
    echo "andrei-demo: skipping branch ${ref} (not demo line)"
    exit 0
    ;;
  mj)
    if is_shared_line_branch; then
      echo "andrei-v2: building MJ-line branch ${ref}"
      exit 1
    fi
    echo "andrei-v2: skipping branch ${ref} (not main/cursor/*/demo/*)"
    exit 0
    ;;
  "")
    # Fail-safe: without an explicit scope, never build. Protects Andrei V2 /
    # MJ Neon if ANDREI_VERCEL_DEPLOY_SCOPE is missing on andrei-v2.
    # andrei-demo MUST set ANDREI_VERCEL_DEPLOY_SCOPE=demo or its PRs will be skipped here.
    echo "WARNING: ANDREI_VERCEL_DEPLOY_SCOPE unset; skipping ${ref} (set scope=demo on andrei-demo, scope=mj on andrei-v2)"
    exit 0
    ;;
  *)
    echo "WARNING: unknown ANDREI_VERCEL_DEPLOY_SCOPE=${scope}; skipping ${ref}"
    exit 0
    ;;
esac
