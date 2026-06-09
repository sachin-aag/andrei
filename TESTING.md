# Testing guide

This project uses three layers of quality checks:

| Layer | Tool | Location | Count (approx.) |
|-------|------|----------|-----------------|
| **Unit / integration** | Vitest | `src/**/*.test.ts(x)` | ~76 files, ~345 tests |
| **End-to-end** | Playwright | `e2e/**/*.spec.ts` | 9 spec files, ~40 cases × 3 browsers |
| **Manual** | Checklist | [docs/manual-test-cases.md](docs/manual-test-cases.md) | 6 release-candidate cases |

`pnpm precommit` runs **lint + typecheck + Vitest only** (no E2E). CI runs Vitest and Playwright in separate jobs.

---

## Quick start

### Unit and component tests

```bash
pnpm test              # run all Vitest tests once
pnpm test:watch        # watch mode
pnpm test:coverage     # with v8 coverage
pnpm test -- src/lib/ai/evaluate.test.ts   # single file
```

### End-to-end tests (Playwright)

**1. One-time setup**

```bash
pnpm db:local:setup    # Docker Postgres + Drizzle schema
pnpm exec playwright install --with-deps chromium firefox webkit
```

**2. Configure `DATABASE_URL`**

Playwright loads `.env` and `.env.local` automatically (see `playwright.config.ts`). Ensure `.env.local` contains a **valid** line only — no extra shell text on the same line:

```bash
DATABASE_URL=postgresql://andrei:andrei@localhost:5432/andrei_dev
```

If Postgres is not running, setup fails with `ECONNREFUSED 127.0.0.1:5432` — start Docker with `pnpm db:local:up` (or `docker start andrei-postgres-dev`).

If seed fails with `relation "workspace_users" does not exist`, the local database schema is missing or stale. Apply it to **local** Postgres (not Neon):

```bash
pnpm db:local:up
pnpm db:local:push
```

`drizzle.config.ts` loads `.env.local` with override so `pnpm db:push` targets your local URL when it is set there. If `db:local:push` reports “No changes” but tables are still missing, confirm Docker has the schema: `docker exec andrei-postgres-dev psql -U andrei -d andrei_dev -c '\dt'` (you should see `workspace_users`).

**3. Run E2E**

```bash
pnpm test:e2e
```

Faster local iteration (Chromium only):

```bash
pnpm exec playwright test --project=chromium
```

Single spec:

```bash
pnpm exec playwright test e2e/auth.spec.ts --project=chromium
```

### Run everything

```bash
pnpm test && pnpm test:e2e
```

---

## Playwright reports and debugging

Local config uses the **list** reporter (terminal). For an HTML report:

```bash
DATABASE_URL=postgresql://andrei:andrei@localhost:5432/andrei_dev \
  pnpm exec playwright test --reporter=html

pnpm exec playwright show-report   # opens playwright-report/ in the browser
```

On failure, artifacts land in `test-results/`:

- Screenshots (`only-on-failure`)
- Videos (`retain-on-failure`)
- Traces (`on-first-retry`) — open with `pnpm exec playwright show-trace test-results/.../trace.zip`

In **GitHub Actions**, download the `playwright-results` artifact from the E2E job.

### E2E infrastructure

| Piece | Purpose |
|-------|---------|
| `e2e/auth.setup.ts` | Seeds password-login users via `POST /api/test/seed-auth-users` (runs before browser projects) |
| `e2e/helpers/auth.ts` | `loginAsEngineer`, `loginAsManager`, `loginAs*WithResponse` via `POST /api/test/login` |
| `e2e/helpers/reports.ts` | `createReport`, `deleteReport`, `seedDefineForEvaluation` |
| `playwright.config.ts` | Starts dev server with `ALLOW_TEST_LOGIN`, AI stub flags, test auth env |

**Never set `ALLOW_TEST_*` on production Vercel** — test routes return 404 when `ALLOW_TEST_LOGIN` is unset.

---

## Test-only environment variables

Documented in `.env.example` (local / CI only):

| Variable | Effect |
|----------|--------|
| `ALLOW_TEST_LOGIN=true` | Enables `POST /api/test/login` and `POST /api/test/seed-auth-users` |
| `TEST_AUTH_EMAIL` | Default engineer email for test login (default: `test.engineer@mjbiopharm.com`) |
| `ALLOW_TEST_SKIP_IMPROVE_AI_EVAL=true` | Stub criteria evaluation with `src/lib/improve-ai/fixtures/stub-evaluations.json` |
| `ALLOW_TEST_SKIP_SUGGESTIONS=true` | Stub AI suggestions with `src/lib/ai/fixtures/stub-suggestions.json` |

Playwright sets these automatically in `webServer.env`.

---

## End-to-end test catalog (Playwright)

Specs run against Chromium, Firefox, and WebKit unless you pass `--project=chromium`.

<details>
<summary><strong>auth.spec.ts</strong> — authentication and session</summary>

| Test | What it verifies |
|------|------------------|
| redirects unauthenticated users to login | `/` → `/login`, sign-in heading |
| shows error for unknown email | Unregistered email copy |
| shows password step for known email with password | `e2e.password@mjbiopharm.com` flow |
| shows error for wrong password | Invalid password message |
| logs in via test-login bypass | `loginAsEngineer()` happy path |
| shows setup password link for no-password account | `e2e.nopassword@mjbiopharm.com` |
| redirects must-change-password users | JWT flag → `/change-password` |
| forgot password page renders | `/forgot-password` form |
| logs out to login page | App shell log out |

</details>

<details>
<summary><strong>create-report.spec.ts</strong> — dashboard create flow</summary>

| Test | What it verifies |
|------|------------------|
| opens create dialog from New Report button | Dialog fields and actions |
| upload pre-fills deviation number | `e2e/fixtures/minimal-report.docx` |
| clear file resets upload | Clear button |
| shows toast when deviation number is empty | Sonner validation |
| shows toast for duplicate deviation number | Duplicate guard |
| creates blank report and navigates to editor | `/reports/[id]/edit` |
| cancel closes dialog | Dialog dismiss |
| manager does not see New Report button | Role gate |
| deletes report from dashboard | Delete confirmation + toast |

</details>

<details>
<summary><strong>report-editor.spec.ts</strong> — DMAIC editor UI</summary>

| Test | What it verifies |
|------|------------------|
| shows all DMAIC and structural sections | Define–Control + Documents / Attachments / Approvals |
| typing triggers auto-save status | Saving… → Saved |
| sidebar tabs switch panels | Placeholders, Criteria (stub eval), Comments |
| collapses and expands sidebar | Collapse / expand controls |
| approved report is read-only for engineer | No submit; `contenteditable=false` |

</details>

<details>
<summary><strong>report-workflow.spec.ts</strong> — engineer ↔ manager lifecycle (serial)</summary>

| Test | What it verifies |
|------|------------------|
| engineer submits report | Submit for Review → Submitted |
| manager sees submitted report in queue | Dashboard listing |
| manager reviews and returns feedback | Comment + Return with Feedback |
| engineer resubmits after feedback | Edit + resubmit |
| manager approves report | Approve → Approved |
| approved report is read-only for engineer | Editor locked |

</details>

<details>
<summary><strong>comments.spec.ts</strong> — review rail and API limits</summary>

| Test | What it verifies |
|------|------------------|
| manager posts section comment in review mode | Review rail composer |
| rejects comment over character limit | POST 400 at 1025 chars |
| engineer replies to manager comment | Reply thread in sidebar |

</details>

<details>
<summary><strong>docx-export.spec.ts</strong> — export download</summary>

| Test | What it verifies |
|------|------------------|
| export triggers docx download | Export DOCX link → `.docx` filename |
| export returns 404 for missing report | Bad report id |

</details>

<details>
<summary><strong>improve-ai.spec.ts</strong> — AI feedback sessions (stub eval)</summary>

| Test | What it verifies |
|------|------------------|
| shows empty state on list page | `/improve-ai` empty copy |
| creates session from existing report | UI flow → review page |
| agrees with a criterion on review page | Yes / Yes radio answers |
| completes session after reviewing all criteria | PATCH complete → Reviewed |
| uploads docx to create session | Upload & evaluate path |

</details>

<details>
<summary><strong>formula-import.spec.ts</strong> — legacy equation import (optional fixture)</summary>

Skipped when `docs/Draft Investigation (DEV-QC-26-001).docx` is missing.

| Test | What it verifies |
|------|------------------|
| imports DOCX formulas as visible inline images in the editor | WMF → math nodes, no unsupported placeholder |

</details>

---

## API route tests (Vitest)

<details>
<summary><strong>/api/reports</strong> — list and create</summary>

- Requires authentication for listing and creation
- Prevents managers from creating reports
- Rejects duplicate deviation numbers
- Checks duplicates against user-entered number, not only DOCX header
- Creates report without source DOCX when no file uploaded
- Persists uploaded source DOCX after create
- Rolls back report when source DOCX persistence fails

File: `src/app/api/reports/route.test.ts`

</details>

<details>
<summary><strong>Workflow routes</strong> — submit, approve, feedback</summary>

**Submit** (`submit/route.test.ts`): 401, 404, 403 non-author, 200 draft→submitted

**Approve** (`approve/route.test.ts`): 401, 403 non-manager, 404, 200 approved

**Feedback** (`feedback/route.test.ts`): 401, 403 non-manager, 200 → `feedback`

</details>

<details>
<summary><strong>/api/reports/[reportId]/comments</strong></summary>

**Collection** (`comments/route.test.ts`):

- GET 401; GET returns comments
- POST 401; POST 403 new thread by non-author/non-manager
- POST 200 manager insert; POST 400 over 1024 chars; POST 400 bad parent

**By id** (`comments/[commentId]/route.test.ts`):

- PATCH rejects edits on locked imported Word comments

</details>

<details>
<summary><strong>Other API routes</strong></summary>

| Route | File | Cases |
|-------|------|-------|
| `PATCH …/sections/[sectionType]` | `sections/.../route.test.ts` | 401; rejects unknown section type |
| `POST /api/site-access` | `site-access/route.test.ts` | 503 unconfigured; invalid payload; wrong password; sets cookie |
| `POST /api/auth-pw/replace-shared-password` | `auth-pw/.../route.test.ts` | 401; 403; rejects temp password reuse; updates hash |
| `POST /api/test/login` | `test/login/route.test.ts` | 404 when disabled; engineer default; manager body; `mustChangePassword` JWT |

</details>

---

## Component and hook tests (Vitest + RTL)

<details>
<summary><strong>Components</strong></summary>

**PasswordLoginForm** (`password-login-form.test.tsx`)

- Email step; continue disabled when empty
- Unknown email error
- Password step advance
- Invalid password error
- No-password → setup link
- Forgot password link

**CreateReportButton** (`create-report-button.test.tsx`)

- Opens dialog
- Toast on empty deviation number
- Cancel closes dialog

**SaveStatus** (`save-status.test.tsx`)

- Saving, error, saved (with timestamp), idle (“Up to date”)

</details>

<details>
<summary><strong>Hooks</strong></summary>

**useAutoSave** (`use-auto-save.test.tsx`)

- Skips initial value
- Debounced save on change
- Immediate flush
- No error when unmount aborts in-flight save

</details>

---

## Library unit tests (Vitest)

Grouped by subsystem. Run a folder with `pnpm test -- src/lib/import`.

<details>
<summary><strong>AI evaluation and suggestions</strong> (`src/lib/ai/`)</summary>

| File | Focus |
|------|--------|
| `evaluate.test.ts` | Prompt composition, section context, placeholder handling, schema salvage, generation settings, DEV-PR table import in prompts |
| `suggestion-gating.test.ts` | Gap criteria, ai_fix exclusion, red/yellow ordering |
| `content-hash.test.ts` | Staleness hash stability |
| `resolve-google-language-model.test.ts` | Vertex / API key / Gateway routing |
| `stub-fixtures.test.ts` | E2E stub JSON completeness and shape |

</details>

<details>
<summary><strong>DOCX import</strong> (`src/lib/import/`)</summary>

| File | Focus |
|------|--------|
| `docx-to-sections.test.ts` | Section splitting, DMAIC mapping, tables, 6M/5-Why, documents reviewed |
| `docx-rich-content.test.ts` | OOXML bold/italic/color, equations |
| `docx-comments.test.ts` | Word comment extraction and anchoring |
| `docx-table-alignment.test.ts` | Table cell alignment from OOXML |
| `html-table-parser.test.ts` | Merged cells, alignment |
| `sanitize-import-html.test.ts` | Bookmark anchor stripping |
| `extract-math-from-image.test.ts` | Vision LLM LaTeX parsing |
| `dev-pr-25008-tables.test.ts` | Real-world table regression |

</details>

<details>
<summary><strong>DOCX export</strong> (`src/lib/export/`)</summary>

| File | Focus |
|------|--------|
| `narrative-to-docx-xml.test.ts` | Tables, formatting, images, equations |
| `docx-round-trip.test.ts` | Import → export fingerprint stability |
| `docx-comments.test.ts` | Comment XML injection |
| `docx-numbering.test.ts` | List numbering |
| `docx-form-checkbox.test.ts` | Investigation tool checkboxes |
| `docx-template-labels.test.ts` | Template label formatting |
| `docx-google-docs-images.test.ts` | Google Docs image compat |
| `improve-control-checkpoints-docx.test.ts` | CA-N / PA-N register tables |
| `red-color-round-trip.test.ts` | Red text color fidelity |
| `raster-dimensions.test.ts` | PNG dimension reads |

</details>

<details>
<summary><strong>Placeholders and suggestions</strong> (`src/lib/placeholders/`, `src/lib/suggestions/`)</summary>

| Area | Files |
|------|--------|
| Detection & fill | `find.test.ts`, `find-pm-doc.test.ts`, `scan-sections.test.ts`, `resolve-in-doc.test.ts`, `plain-text-segments.test.ts` |
| Evaluation policy | `evaluation-policy.test.ts`, `placeholder-eval-prompt.test.ts`, `suggestion-placeholder-policy.test.ts` |
| Normalization | `normalize-bracket-placeholders.test.ts`, `normalize-suggestion-insert.test.ts` |
| Suggestions | `locate-plain-text-edit.test.ts`, `plain-text-preview.test.ts`, `validate-suggestion.test.ts`, `persist-comment-status.test.ts` |

</details>

<details>
<summary><strong>TipTap editor</strong> (`src/lib/tiptap/`)</summary>

| File | Focus |
|------|--------|
| `rich-text.test.ts` | Markdown ↔ JSON, tables, lists |
| `suggestion-inject.test.ts` | Pending suggestion marks |
| `suggestion-action-widgets.test.ts` | Inline apply/reject widgets |
| `placeholder-highlights.test.ts` | Placeholder decorations |
| `coalesce-text-nodes.test.ts`, `list-style.test.ts`, `text-color.test.ts` | Editor utilities |

</details>

<details>
<summary><strong>Reports, sections, auth, Improve AI</strong></summary>

| Area | Files |
|------|--------|
| Sections | `sections-merge.test.ts`, `section-content-normalize.test.ts`, `seed-blank-report-sections.test.ts`, `improve-control-body-split.test.ts` |
| Reports | `deviation-no.test.ts`, `persist-source-docx.test.ts` |
| Auth | `must-change-password.test.ts`, `auth-base-url.test.ts`, `send-reset-email.test.ts` |
| Improve AI | `human-judgment.test.ts`, `session-staleness.test.ts`, `section-display-blocks.test.ts` |
| Comments UI | `comments/display.test.ts` |
| Math | `math/omml-mathml.test.ts` |
| DOCX signatures | `docx/signature-block.test.ts` |
| Plain text | `plain-text/placeholder-at-offset.test.ts`, `text/bracket-span.test.ts` |
| Bulk eval tooling | `sample-eval/bulk-eval-aggregates.test.ts` |

</details>

---

## Manual test register

Release-candidate checks that are not fully automated (email, real Word fidelity, legacy WMF):

See **[docs/manual-test-cases.md](docs/manual-test-cases.md)** (M-01 through M-06).

Spot-check **live Gemini** evaluation periodically — E2E stubs AI via `ALLOW_TEST_SKIP_*`.

---

## CI

| Job | Command | Notes |
|-----|---------|-------|
| Unit | `pnpm test` | All Vitest |
| E2E | `pnpm test:e2e` | Postgres service container, `drizzle-kit push`, Chromium + Firefox + WebKit |

Workflow: `.github/workflows/ci.yml`

---

## Adding tests

| What you're testing | Where to add |
|---------------------|--------------|
| Pure logic, parsers, prompts | `src/lib/.../*.test.ts` next to source |
| API route auth and status codes | `src/app/api/.../route.test.ts` — mock `@/db` + `getCurrentUser` |
| React UI interactions | `src/components/.../*.test.tsx` — jsdom + RTL + `user-event` |
| Full user journey | `e2e/*.spec.ts` — use `e2e/helpers/` |

E2E patterns: unique deviation numbers (`uniqueDeviationNo`), `loginAsEngineer` / `loginAsManager`, `createReport` / `deleteReport` in `afterEach`.
