---
iteration: 2
max_iterations: 15
completion_promise: "COMPLETE"
---

Run `pnpm test:e2e` (or chromium-only for speed when iterating). Fix any failing E2E tests. Repeat until all E2E tests pass across setup + chromium + firefox + webkit projects. Update test helpers/selectors to match real UI; do not weaken assertions without cause.
