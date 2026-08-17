#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = proceed with build.
#
# One GitHub repo, three Vercel projects. All use this script. Customer identity
# is ANDREI_CUSTOMER on the project, not the git branch.
# Keep Neon preview branching OFF on andrei-v2 and andrei-convergent.
# See docs/whitelabel-vercel-deploy.md.

set -euo pipefail

if [ "${VERCEL:-}" != "1" ]; then
  exit 1
fi

ref="${VERCEL_GIT_COMMIT_REF:-}"

case "$ref" in
  main | cursor/* | demo/* | convergent/*)
    echo "building ${ref}"
    exit 1
    ;;
  *)
    echo "skipping ${ref}"
    exit 0
    ;;
esac
