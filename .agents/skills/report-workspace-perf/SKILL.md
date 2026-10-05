---
name: report-workspace-perf
description: Diagnose report /edit hangs, tab freezes, and main-thread jank (ELR, large MJ reports). Use Node bench for table-ref rebuild cost, Playwright profile for browser CPU/longtasks, or Browser MCP CDP when reproducing on a live dev/preview server.
license: MIT
metadata:
  author: project
  version: "1.0.0"
---

# Report workspace performance debugging

Use this when `/edit` hangs, scrolling freezes the tab, or chat/document chrome loads but messages never paint. **Do not** infer root cause from bundle size alone — collect numbers first.

## Decision tree

| Symptom | First tool |
|--------|------------|
| Suspect `TableRefNumbersProvider` / open table suggestions | `pnpm bench:table-ref` |
| Need main-thread function names | `pnpm profile:report-edit` or Browser MCP Profiler |
| Preview-only, local dev on odd port | Set `PROFILE_BASE_URL`; ensure `ALLOW_TEST_LOGIN` on that server |
| CI regression guard (cheap) | `BENCH_TABLE_REF_BUDGET_MS=… pnpm bench:table-ref -- --json` (not wired in CI by default) |

Workspace load **stage** beacons (`[wl]` / `emitWorkspaceLoadStage`) tell you *when* things happened, not *which* React commit or function dominated CPU.

---

## 1. Node bench — table reference rebuild

Measures the same path as `TableRefNumbersProvider`: `documentContentsFromReportState` → `tableRefNumberMap` / `listInsertableTableRefs` / `liveTableRefNumbers`.

```bash
# Synthetic ELR (alternating filled/empty tables), no DB
pnpm bench:table-ref

# Sweep open insert_rows suggestions (cost scales with count)
pnpm bench:table-ref -- --sweep 0,6,12,24 --iterations 8

# Real report (needs DATABASE_URL in .env.local)
pnpm bench:table-ref -- --report-id <cuid> --iterations 5

# Machine-readable + budget fail
BENCH_TABLE_REF_BUDGET_MS=800 pnpm bench:table-ref -- --open-suggestions 12 --json
```

Read **p95 `liveTableRefNumbers`** and **overlay** ms. If overlay dominates and `openTableSuggestions` is high, fix table-ref caching / incremental overlay before more lazy-mount tweaks.

Fixture: `scripts/bench/fixtures/elr-scaling.ts` (aligned with `src/lib/suggestions/table-ref-scaling.test.ts`).

---

## 2. Playwright CPU profile

Full page load of `/reports/<id>/edit` with CDP `Profiler`, longtask observer, optional typing probe.

**Server** must expose `POST /api/test/login` (same flags as E2E `webServer` in `playwright.config.ts`):

- `ALLOW_TEST_LOGIN=true`
- `TEST_AUTH_EMAIL` set

```bash
# Default: http://127.0.0.1:3000 — stop anything else on 3000 or set PLAYWRIGHT_BASE_URL on the app
pnpm profile:report-edit -- <reportId>

# Preview / dev on another port
PROFILE_BASE_URL=https://your-preview.vercel.app pnpm profile:report-edit -- <reportId> 4 slow-preview
```

Outputs under `artifacts/profile-report-edit/`:

- `report-edit-<label>-<id>.cpuprofile` — open in Chrome DevTools → Performance → load profile
- `report-edit-<label>-<id>.txt` — timeline, longtasks, **TOP SELF TIME**, app **TOP TOTAL TIME**

Interpretation:

- **`unresponsivePolls`** — `page.evaluate` timed out (>3s); main thread blocked
- **Typing line** — cost per keystroke after mount (provider re-renders)
- **TOP TOTAL TIME** — search for `table-ref`, `document-table-number`, `ProseMirror`, `useMemo`

Throttle arg multiplies CPU slowness (`4` = 4x) to amplify hotspots on fast laptops.

---

## 3. Browser MCP playbook (Cursor)

Use when you need eyes on the page **and** a profile without running the repo script, or when debugging a port the user already has open.

### A. Smoke (not enough alone)

`browser_navigate` → login if needed → `browser_snapshot`. Confirms shell/chat chrome; **does not** attribute CPU.

### B. CDP CPU profile (preferred)

Namespace: **`user-chrome-devtools`** (or `cursor-ide-browser` + `browser_cdp` where Profiler is allowed).

1. List pages: `list_pages` / `browser_tabs` list.
2. Navigate to `/reports/<id>/edit` (authenticated).
3. **Before** navigation completes heavy work:
   - `Profiler.enable`
   - `Profiler.setSamplingInterval` `{ "interval": 500 }`
   - `Profiler.start`
4. Wait for editors / reproduce scroll or typing.
5. `Profiler.stop` → save JSON; summarize with same heuristics as `scripts/lib/cpu-profile-summary.ts` or load in DevTools.

If Profiler is denied on `cursor-ide-browser`, use `pnpm profile:report-edit` or `user-chrome-devtools`.

### C. Performance trace (lighter)

`performance_start_trace` → reproduce → `performance_stop_trace` → read insights. Good for LCP/long tasks; weaker function-level detail than `.cpuprofile`.

### D. Long tasks in-page

Via `Runtime.evaluate` after `addInitScript` (mirror `scripts/profile-report-edit.ts`):

- `PerformanceObserver` `longtask`
- 50ms interval gap detector for stalls >250ms

### E. What to report back

Copy into the PR / issue:

1. Bench: p95 live ms, open table suggestion count
2. Profile `.txt`: worst longtasks, top 5 app frames
3. Whether freeze correlates with **scroll** vs **initial load** vs **keystroke**
4. `PROFILE_BASE_URL` and customer pack (`mj` for ELR)

---

## 4. Seeding a heavy local ELR

Optional one-off (not committed): `scripts/_tmp-time-elr-load.ts` seeds dev-11-sized sections + comments, prints bundle timings, deletes unless `KEEP_REPORT=1`.

---

## 5. Code map (hot paths)

- `src/providers/table-ref-numbers.tsx` — `liveTableRefNumbers` in `useMemo` on `sections` + `comments`
- `src/lib/suggestions/document-table-number.ts` — overlay pending `edit_table` / `insert_rows`
- `src/lib/suggestions/table-ref.ts` — numbering and insertable list
- Tests: `src/lib/suggestions/table-ref-scaling.test.ts`

Fix order: **incremental overlay + stable references** before more section mount ordering.
