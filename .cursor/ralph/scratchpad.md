---
iteration: 2
max_iterations: 10
completion_promise: "E2E PASSING"
---

Fix playwright tests. Make sure to run them before pushing.

## Fixes applied
1. `e2e/report-attachments.spec.ts`: click filename via Documents panel button (avoids toast strict-mode clash).
2. Same file: assert `iframe[title="${fileName}"]` (avoids PostHog/rrweb iframe strict-mode clash).

## Verification
- report-attachments.spec.ts chromium+firefox+webkit: 7 passed
- Full `pnpm run test:e2e`: **136 passed (11.3m)**
- Pushed to origin/demo/attachments

DONE — E2E PASSING
