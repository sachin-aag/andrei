#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = proceed with build.
#
# One GitHub repo, two Vercel projects (andrei-v2 = MJ, andrei-demo = customer demo).
# Set ANDREI_VERCEL_DEPLOY_SCOPE on each project so branches only build where intended.
# See docs/whitelabel-vercel-deploy.md § "Deploy scope (branch routing)".

set -euo pipefail

if [ "${VERCEL:-}" != "1" ]; then
  exit 1
fi

ref="${VERCEL_GIT_COMMIT_REF:-}"
scope="${ANDREI_VERCEL_DEPLOY_SCOPE:-}"

is_demo_line_branch() {
  case "$ref" in
    feat/whitelabel) return 0 ;;
    cursor/*) return 0 ;;
    demo/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_mj_line_branch() {
  case "$ref" in
    main) return 0 ;;
    feat/whitelabel) return 1 ;;
    cursor/*) return 1 ;;
    demo/*) return 1 ;;
    *) return 0 ;;
  esac
}

case "$scope" in
  demo)
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
    echo "andrei-v2: skipping branch ${ref} (demo line)"
    exit 0
    ;;
esac

# Legacy: production-only demo (skips PR branches including cursor/*). Prefer ANDREI_VERCEL_DEPLOY_SCOPE=demo.
if [ "${ANDREI_DEMO_PRODUCTION_ONLY:-}" = "true" ]; then
  production_branch="${ANDREI_DEMO_PRODUCTION_BRANCH:-feat/whitelabel}"
  if [ "$ref" != "$production_branch" ]; then
    echo "andrei-demo: skipping branch ${ref} (production branch: ${production_branch})"
    exit 0
  fi
fi

exit 1
