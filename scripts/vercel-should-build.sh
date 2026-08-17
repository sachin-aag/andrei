#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = proceed with build.
#
# One GitHub repo, three Vercel projects (andrei-v2 = MJ, andrei-demo = customer
# demo, andrei-convergent = Convergent pilot). Trunk is `main`. Set
# ANDREI_VERCEL_DEPLOY_SCOPE on each project so PR previews never create Neon
# branches on the wrong database.
# See docs/whitelabel-vercel-deploy.md (customer deploys).

set -euo pipefail

if [ "${VERCEL:-}" != "1" ]; then
  exit 1
fi

ref="${VERCEL_GIT_COMMIT_REF:-}"
scope="${ANDREI_VERCEL_DEPLOY_SCOPE:-}"

# Demo builds the trunk plus preview branches. feat/whitelabel is listed so a
# leftover push to the old fork cannot fall through to MJ Neon.
is_demo_line_branch() {
  case "$ref" in
    main) return 0 ;;
    feat/whitelabel) return 0 ;;
    cursor/*) return 0 ;;
    demo/*) return 0 ;;
    *) return 1 ;;
  esac
}

# MJ production builds `main` only. Catch-all branches must not create preview
# DBs on the Andrei V2 Neon project.
is_mj_line_branch() {
  case "$ref" in
    main) return 0 ;;
    *) return 1 ;;
  esac
}

# Convergent builds the trunk plus convergent/* preview branches. Catch-all
# branches must not create preview DBs on the Convergent Neon project.
is_convergent_line_branch() {
  case "$ref" in
    main) return 0 ;;
    convergent/*) return 0 ;;
    *) return 1 ;;
  esac
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
    if is_demo_line_branch; then
      echo "andrei-demo: building demo-line branch ${ref}"
      exit 1
    fi
    echo "andrei-demo: skipping branch ${ref} (not demo line)"
    exit 0
    ;;
  mj)
    if is_mj_line_branch; then
      echo "andrei-v2: building MJ-line branch ${ref}"
      exit 1
    fi
    echo "andrei-v2: skipping branch ${ref} (not main — no MJ Neon preview DB)"
    exit 0
    ;;
  convergent)
    if is_convergent_line_branch; then
      echo "andrei-convergent: building convergent-line branch ${ref}"
      exit 1
    fi
    echo "andrei-convergent: skipping branch ${ref} (not convergent line — no Convergent Neon preview DB)"
    exit 0
    ;;
  "")
    # Fail-safe: without an explicit scope, never build. Protects Andrei V2 /
    # MJ Neon if ANDREI_VERCEL_DEPLOY_SCOPE is missing on andrei-v2.
    # andrei-demo MUST set ANDREI_VERCEL_DEPLOY_SCOPE=demo or its PRs will be skipped here.
    echo "WARNING: ANDREI_VERCEL_DEPLOY_SCOPE unset; skipping ${ref} (set scope=demo on andrei-demo, scope=mj on andrei-v2, scope=convergent on andrei-convergent)"
    exit 0
    ;;
  *)
    echo "WARNING: unknown ANDREI_VERCEL_DEPLOY_SCOPE=${scope}; skipping ${ref}"
    exit 0
    ;;
esac
