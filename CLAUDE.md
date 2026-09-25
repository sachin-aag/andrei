# CLAUDE.md

Architecture handbook for this repository. Cursor also loads `AGENTS.md` (operating
caveats) and `.cursor/rules/*.mdc` (file-scoped invariants). If those disagree
with this file, trust `AGENTS.md` / the rules / the code — then fix this file.

## Project

Andrei — a Next.js 16 investigation-report engine with per-customer packs. Demo (`ANDREI_CUSTOMER=demo`) is Andrei-branded with design verification, a conclusion section, and a demo-only free-form Document (`generic_document`: one TipTap body, no criteria). MJ (`ANDREI_CUSTOMER=mj`) overlays SOP/DP/QA/008 criteria and prompts, the MJ Word template, MJ branding, Word import, hides conclusion plus design verification, and adds Quality Risk Assessment (`quality_risk_assessment`, SOP/DP/QA/010) plus the Equipment Lifecycle Report (`equipment_lifecycle_report`) and Investigation Report DS (`failure_investigation_report`, SOP/QA/017-F01 R01). MJ is the only pack running two investigation forms, so it labels them by unit: **Investigation Report DP** (`investigation_report`, SOP/DP/QA/008, Drug Product) and **Investigation Report DS** (SOP/QA/017, Drug Substance). Demo and Convergent keep the plain `Investigation Report` label. Convergent (`ANDREI_CUSTOMER=convergent`) is Convergent Dental branding with design verification only (9-section Solea DV template). 3xper (`ANDREI_CUSTOMER=3xper`) is 3xper Innoventure branding with vendor qualification (`vendor_qualification`, QAD-SOP-MS-001-F04) and the Qualification Summary Report (`qualification_summary_report`, QAD/016/F06-00). Features: in-browser DMAIC editor with auto-save, AI traffic-light evaluation (Gemini via Vercel AI Gateway or Vertex), manager review with comments, attachment evidence (PDF/DOCX ingest + chat retrieval), and DOCX export.

## Commands

```bash
pnpm test -- src/lib/ai/evaluate.test.ts  # run a single test file
pnpm exec playwright test e2e/auth.spec.ts --project=chromium  # single E2E spec
pnpm precommit            # lint + typecheck + test (husky hook)
pnpm seed-demo-reports    # seed demo reports for the demo engineer (loads .env + .env.local)
pnpm sample-eval-report   # bulk AI evaluation of sample DOCXs → HTML report (needs gateway key)
pnpm retrieval-eval       # attachment retrieval gold cases (default --dry-run; --from-gcs CI download+ingest+judge, generate if GCS stale; --live local PDFs; --report-id skip ingest)
pnpm retrieval-eval:upload # laptop ADC only: write synthetic eval PDFs to RETRIEVAL_EVAL_GCS_BUCKET (CI never uploads)
pnpm soak:pdf-ingest      # local PDF extract soak (Vertex; no DB/GCS writes)
```

Every script lives in `package.json`; only the non-obvious invocations are listed here.

`pnpm db:ensure-workspace-users` uses the Neon HTTP driver — skip it against
local Docker. Create users with `pnpm set-workspace-password` instead.

**One-time E2E setup:**
```bash
pnpm exec playwright install --with-deps chromium firefox webkit
```

## Architecture

### Non-obvious structure

Layout is `ls src/`; stack is `package.json`; `@/*` → `src/*` is `tsconfig.json`. Only the two
facts the tree cannot show are kept here:
- **New document types must be registered in `src/lib/ai/suggest-target-fields.ts`** (both `SUGGEST_TARGET_FIELD_PATTERNS` and `RICH_FIELD_PATHS`). A type whose sections are absent from those maps ships silently broken: `pickPatterns` substitutes `[]`, chat `propose_edit` has no valid target, placeholder scanning finds nothing, and Table N cross-refs stop resolving. `suggest-target-fields.test.ts` asserts coverage for every registered type — a key declared `[]` is a deliberate "no editable text fields" (DV `cover_page`), absent is a bug.
- `src/proxy.ts` — Next.js 16 request interception (auth redirects, `mustChangePassword`/`passwordExpired`). There is **no** `middleware.ts`. Does **not** enforce the site-access gate (`/unlock`).

### Data flow

1. TipTap editor → section content (JSONB in `report_sections`)
2. Auto-save debounces 1.5s → `PATCH /api/reports/[id]/sections/[sectionType]`
3. AI evaluation → `POST /api/reports/[id]/evaluate` → upserts `criteria_evaluations`
4. Attachments → upload → `runDocumentIngest` (Vertex extract/embed) → `document_pages` / `document_chunks`
5. Manager review → submit/comment/approve/feedback status transitions
6. DOCX export → `GET /api/reports/[id]/export` (investigation vs design-verification branches in `generate-docx.ts`)

### Report statuses

`draft` → `submitted` → `in_review` → `feedback` (back to engineer) or `approved`

### Section types

Owned by `getWorkspaceSections(documentType)` in `src/lib/document-types/`. The shared `sectionTypeEnum` includes both families.

Per-type section keys, identity fields, table-column schemas, and the MJ/3xper form lineage (ELR, Investigation Report DS, QRA, vendor qualification, generic document, design verification) live in `src/lib/document-types/CLAUDE.md`, which loads when you work under that directory.

### Auth

NextAuth v5 with Drizzle adapter. Credentials (email/password) is the primary sign-in UI; Resend magic link is a secondary option on `/login`. JWT-based sessions with `workspaceUserId` and `role`. Roles: `engineer`, `manager`, `admin`, `qa` (`src/lib/auth/roles.ts`, `userRoleEnum`). E2E/test seed accounts are created via `POST /api/test/seed-auth-users`; user helpers live in `src/lib/auth/` (`workspace-users.ts`, `user-directory.ts`). A successful sign-in from a non-`@andreihealth.com` address emails `sachin@andreihealth.com` and `aditya@andreihealth.com` via Resend (`scheduleExternalLoginAlert` in the Auth.js `signIn` event). Fail-soft and skipped when `ALLOW_TEST_LOGIN` is on.

Password lifecycle is enforced beyond NextAuth: `mustChangePassword`/`passwordExpired` force a redirect to `/change-password` (via the proxy); the JWT callback stamps those flags for 60s (`jwtStateCheckedAt`) instead of querying Postgres on every `auth()`; `getPasswordPolicy()` is process-cached for 60s. `getCurrentUser()` returns null for deactivated users and for JWTs whose `sessionVersion` does not match `workspace_users.session_version`. Admin deactivate (`PATCH`/`DELETE`) and forced password reset (admin reset email, `set-workspace-password`, completing `/api/auth-pw/reset-password`) bump `sessionVersion` so existing sessions cannot keep calling APIs. Configurable password policy in `passwordPolicySettings`; failed-login lockout with admin unlock at `POST /api/admin/users/[userId]/unlock`; self-service forgot/reset via `/forgot-password`, `/reset-password`, and `src/app/api/auth-pw/`. An optional site-wide password gate (`/unlock`, `POST /api/site-access`) is active only when `SITE_ACCESS_PASSWORD` is set.

### Customer packs

`src/lib/customers/` resolves `ANDREI_CUSTOMER` (default `demo`). Set **both** `ANDREI_CUSTOMER` and `NEXT_PUBLIC_ANDREI_CUSTOMER` to the same value; they must agree with `ANDREI_VERCEL_DEPLOY_SCOPE` when that is set. Packs overlay criteria descriptions, eval prompts (`promptVersion` is distinct for MJ, Convergent, and 3xper), export template, hidden sections, enabled document types, Word import, branding, `insightsEnabled` (demo-only Insights nav), and `documentTemplatesEnabled` (demo-only Templates gallery). Do not use feature flags for customer identity. Deploys: `docs/whitelabel-vercel-deploy.md` (Add a customer for a new pack). 3xper product notes: `docs/3xper-deployment.md`.

## Environment variables

`.env.example` documents every variable and its purpose, including the `ALLOW_TEST_*` flags
and what each one stubs. Local config goes in `.env.local`.

**The `ALLOW_TEST_*` flags are test-only.** Playwright sets them automatically in
`webServer.env` — never add them to Vercel production or preview env.

## Local development gotchas

**Postgres:** Default local path is Docker (`pnpm db:local:up`). Native `pg_ctlcluster` is optional and not assumed. The app **always** uses the `pg` driver, including Neon — not because the host is `127.0.0.1`. Neon HTTP cannot run `db.transaction()`.

**`pnpm db:push` is interactive:** It prompts in a TTY and fails in non-interactive shells with "Interactive prompts require a TTY". Always use `pnpm db:local:push` in scripts, CI, or when automating schema updates.

**Turbopack route registration bug:** In `pnpm dev`, a newly-added API route can fail to register on its first on-demand compile and return Next's HTML 404 page for every method. Fix: restart the dev server (optionally `rm -rf .next` first). This is a dev-server state issue, not a code bug.

**AI credentials are not interchangeable:** Core flows (login, report CRUD, editor, manager review, DOCX export) work without AI keys. "Run AI Check" / suggestions / chat / composer voice dictation need `AI_GATEWAY_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` or Vertex (`GOOGLE_VERTEX_PROJECT` + WIF). PDF/DOCX ingest + embeddings need **Vertex** (`GOOGLE_VERTEX_PROJECT`). Voice does **not** call Cloud Speech-to-Text.

**Creating a workspace user locally:**
```bash
pnpm set-workspace-password -- bhargav.patel@mjbiopharm.com 'TempPass123!' --role engineer
```
MJ convention is `@mjbiopharm.com`; the script does not enforce the domain. The account is flagged `mustChangePassword` on first login.

**Playwright port 3000:** Local config sets `reuseExistingServer`. Whatever already owns 3000 is reused **without** Playwright’s stub env. Stop it, or set `PLAYWRIGHT_BASE_URL` to a server that already has the flags and matching `AUTH_URL`.

## Subsystem references

These four are large enough that they load on demand instead of every session. Invoke the
skill before working in the matching code:

- `chat-subsystem` — AI chat: tools (`draft_identity` for cover/header scalars), prompt versions, user intent, citation grounding, overclaim
  gate, pending-plan queue, document review, mentions, voice dictation.
- `analytics-subsystem` — Report Analytics worksheet, sixpack / ANOVA / boxplot / histogram /
  scatter, analytics chat tools.
- `attachments-retrieval` — PDF/DOCX ingest, chunk/embed, hybrid retrieval, the document vault.
- `docx-pipeline` — DOCX import and DOCX export pipelines.

The subsystems below are small enough to stay resident.

## Subsystem: AI Evaluation

**Entry point:** `evaluateSection()` in `src/lib/ai/evaluate.ts`

**Criteria:** From `getDocumentType(type).criteriaBySection`. Investigation criteria still live in `src/lib/ai/criteria.ts` (Define / Measure / Analyze / Improve / Control / Conclusion) and are exposed through the registry. Design verification criteria (LLM + deterministic `check()` functions) live under `src/lib/document-types/design-verification/`.

**Pipeline:**
1. `cleanSectionContentForEval()` strips pending suggestion marks from content
2. `buildCriterionEvaluationLlmPrompts()` constructs system + user prompt
 - System prompt defines traffic-light system (met/partially_met/not_met), scope rules, prompt injection guard
 - User prompt includes: document info, section content (via `contextForPrompt()`), prior sections (read-only context only), criteria list
 - Prompt version is `getDocumentType(type).prompts.promptVersion` (investigation: `PROMPT_VERSION` in `section-prompts.ts`)
3. `generateText()` with Gemini 3.1-flash-lite, temperature 0, seed 0 (deterministic)
4. `capEvaluationStatusForPlaceholders()` caps to partially_met if unfilled placeholders detected (never not_met solely for placeholders)
5. Results upserted into `criteria_evaluations` table. On re-evaluation, `fixApplied` preserved; `bypassed` cleared.

**Content hash:** `evaluationContentHash()` in `evaluation-content-hash.ts` — cleaned section content + `dependsOn` sections + `promptVersion`. Bumping the type’s prompt version invalidates cached evals.

## Subsystem: AI Suggestions

**Entry point:** `generateSuggestionsForSection()` in `src/lib/ai/suggest.ts`

**Pipeline:**
1. `gapCriteriaForSection()` (in `suggestion-gating.ts`) filters to failing criteria (not_met + partially_met) with no existing open ai_fix comment
2. Prompt includes each failing criterion with status and reasoning. Editable `SECTION CONTENT` is built by `contextForSuggestionPrompt()` (`suggestion-section-context.ts`) using the **canonical anchor string** (`flattenForAnchor`) — no markdown pipes / `[equation]` tokens. Prior sections stay markdown via `contextForPrompt`. Eval is untouched.
3. `generateText()` with Gemini 3.1-pro, temperature 0.4 (variety in phrasing). Schema returns `{ criterionKey, targetField, anchorText, deleteText, insertText, reasoning }`
4. Gating drops suggestions via `probeRichEdit` / `probePlainEdit` (same code path as apply): bad criterion key, bad target field, empty edit, placeholder-only edit, not found, ambiguous, cross-cell
5. `sortedOpenSuggestionsForSection()` orders: red first, then yellow, then criterion order. `activeSuggestionForSection()` returns highest-priority for UI.

**Locator (single matcher):** `src/lib/suggestions/locator.ts` — `flattenForAnchor`, `locateEdit`, `applyEditToRichDoc` / `applyEditToPlainText`, `probeRichEdit` / `probePlainEdit`. Gate ≡ apply is structural (probe is locate without commit).

**Applying suggestions:** all three UI surfaces (suggestion card, rich TipTap widget, plain-text field) go through `acceptSuggestion` / `dismissSuggestion` in `accept-suggestion.ts`. When the comment stores `suggestionBase` + `suggestionIntent`, apply is a three-way merge (`mergeField`) against live field content — coverage classifies edit vs rewrite; conflicts apply compatible operations and leave a remainder. Zero-ops dismiss with `resolutionReason: "already_present"` (not `resolved`). Legacy rows without a record still locate the frozen span. Never resolve a suggestion without a successful apply (or an explicit noop dismiss). Investigation/DV finalize marks (`acceptSuggestionMarksById`). Generic documents use `suggestionApplyMode: "tracked_change"`: merge then persist accepted insert/delete marks for Word `w:ins`/`w:del`. Per-operation audit is `suggestion_operation_applied` with `{ commentId, opIndex, coverage, classification }`. Mark `id` stays the comment id (`data-eval-id`); `opIndex` is a separate attr.

**Bulk apply/dismiss:** `Apply all N` / `Dismiss all` in the report workspace header (`report-bulk-suggestion-actions.tsx`) are **document-wide**, not section-scoped — shown in Document and Agent chrome whenever at least one suggestion is open. Apply all's N is locatable suggestions only; Dismiss all still covers stale leftovers. `acceptAllSuggestionsInReport` / `dismissAllSuggestionsInReport` in `src/lib/suggestions/bulk-suggestions.ts` walk every section in `suggestionCardSectionKeys` order. Each open suggestion is re-merged against the in-memory document in queue order. Each section PATCHes once, then comment statuses flip in parallel. A stale suggestion is skipped; a same-table leftover invalidated by an earlier apply in the batch is dismissed as `superseded_by:<id>`. A save failure aborts that section only and later sections still run. No confirm dialog — the toast reports applied/skipped/dismissed counts. The gutter card keeps only its single Apply/Dismiss. The single-card Apply/Dismiss still uses the cinematic settle delays. Bulk apply uses hold mode `bulk` (keep insert text, hide deletes instantly — do not opacity-0 both runs) and pushes applied content into the editor *before* the section PATCH so the wording does not vanish during save. The hold stays until comments are updated, so TipTap cannot re-inject an already-applied preview.

**Key invariant:** Anchor must be unique in the canonical field text. Whitespace is normalized for matching (multiple spaces/newlines → single space). Cross-paragraph deletes are allowed; cross-cell deletes are dropped. Chat `propose_edit` serializes same-turn calls and folds a later span into the existing card when the locatable ranges sit within `COALESCING_GAP` (20) characters on canonical field text — one frozen hunk including the bridge, no card-count budget. Lead-ins, tables, figures, citation `second`s, and table-cell scopes do not fold. Document and Agent chrome both propose (red/green review); they do not commit inline.

## Subsystem: Auto-Save

**Entry point:** `useAutoSave()` in `src/hooks/use-auto-save.ts`, wrapped by `useSectionSave()` in `use-section-save.ts`

**Behavior:**
- Serialization-based change detection — skips save if serialized value unchanged (prevents wasted saves on re-renders)
- 1.5s debounce. During in-flight save, new changes queue as pending; at most one pending save at a time
- `sendBeacon` fallback on page hide/beforeunload for unsaved changes
- Returns `{ status: "idle" | "saving" | "saved" | "error", lastSavedAt, flush }`

**`useSectionSave` disables auto-save when:**
- Report is read-only (unless trackChangesMode)
- Suggestion is in-flight or being applied (prevents race conditions)
- Previous save failed (blocks until report reloaded)

## Subsystem: Audit Trail & E-Signatures

**Purpose:** 21 CFR Part 11-style tamper-evident audit trail, section version history, and electronic signatures on workflow transitions.

**Entry points (all re-exported from `src/lib/audit/index.ts`):**
- `recordAuditEvent()` (`record-audit-event.ts`) — appends to the hash-chained `auditEvents` table (each row carries `seq` + `prevHash`; hashing matches a DB trigger).
- `recordSectionVersion()` — snapshots section content into `sectionContentVersions`; `reconstructSection()` rebuilds a section at a given version.
- `recordElectronicSignature()` / `listSignaturesForReport()` — writes `electronicSignatures` (meaning from `signatureMeaningEnum`).
- `verifyAuditChain()` — validates monotonic `seq` and `prevHash` linkage; reports the first invalid seq.
- `verify-password-for-signing.ts` + `workflow-sign.ts` — re-authenticate the user's password before a signed transition; `handleWorkflowSignRequest()` (`workflow-handler.ts`) is the signed submit/approve/feedback handler.
- Export/review: `export.ts` + `audit-csv.ts` (CSV export), viewed in `src/app/admin/audit/`.

**Key invariant:** The audit chain is append-only; content edits go through `hashSectionContent()` and version snapshots, never in-place rewrites of `sectionContentVersions`. Do not use that table as the product History UI — it records every PATCH including human autosave. Document History is `documentRevisions`. Analytics History is `analyticsRevisions`; worksheet/plot mutations also append `worksheet_updated` / `analysis_*` audit events (entity `analytics`). An open `manual` document History row may be updated in place during a typing burst; Agent rows and idle-closed manual rows are never rewritten.

## Subsystem: Redrafts

**Purpose:** A suggestion variant that replaces an **entire field** (not an anchored span) with LLM-generated markdown — used for AI-authored rewrites.

**Apply:** `applyRedraftToSection()` in `src/lib/suggestions/apply-redraft.ts` — rich target fields get `markdownToDoc()` (tables included); plain fields get flattened via `redraftPlainTextValue()`. Whole-field replacement, no anchor matching.

**Preview:** `buildRedraftPreviewDoc()` in `src/lib/tiptap/redraft-preview.ts` renders the redraft as inline tracked changes (current content struck through + replacement highlighted) reusing the standard suggestion-mark machinery, so `acceptSuggestionMarksById()`/`stripSuggestionMarksById()` finalize or revert it.

## Subsystem: Site Access Gate

**Purpose:** Optional single shared-password gate in front of the whole site (e.g. for preview deployments), independent of user auth.

**Flow:** Active only when `SITE_ACCESS_PASSWORD` is set. `POST /api/site-access` compares the password (`timingSafeEqual`), mints an HMAC token (`mintSiteAccessToken`), and sets the httpOnly `mjb_site_access` cookie (30-day). The `/unlock` page (`src/app/unlock/page.tsx`) renders the password form and verifies the cookie. Not enforced by `src/proxy.ts`. Distinct from per-user account lockout (`/api/admin/users/[userId]/unlock`).

## Testing

- Vitest config: `vitest.config.ts`, environment `node`, setup file `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`). Mock `@/db` when a module loads `DATABASE_URL` at import time.
- E2E: Playwright with chromium, base URL `http://127.0.0.1:3000`, config in `playwright.config.ts`. Local `reuseExistingServer` is on — see gotchas.
- Test files live alongside source: `*.test.ts` / `*.test.tsx`. Rename, split, or delete the test file when the source module changes; do not keep tombstone `not.toContain("old UI")` tests. Removals: grep the old symbol in tests and `e2e/` first.
- Full E2E details, artifact locations, and test catalog: `TESTING.md`.
- `pnpm precommit` runs lint + typecheck + Vitest only (no E2E). CI runs them in separate jobs.

**E2E infrastructure:** `e2e/auth.setup.ts` seeds users via `POST /api/test/seed-auth-users` before browser tests. Helpers: `e2e/helpers/auth.ts` (`loginAsEngineer`, `loginAsManager`) and `e2e/helpers/reports.ts` (`createReport`, `deleteReport`). Use `uniqueDeviationNo` for isolation and `deleteReport` in `afterEach`. Chat stream+persist: `e2e/report-chat.spec.ts` (stub chat cannot assert tools).

## Style

- Light theme only (`color-scheme: light`). Each pack overrides the `--brand-*` ramp
  in `globals.css`: demo navy `#001838`, MJ navy `#133782`, Convergent blue `#0079c1`.
  Style new UI from the tokens, never a hardcoded brand hex.
- Tailwind CSS v4 configured in `src/app/globals.css`.
- Toast notifications via `sonner`.
- Observability: Langfuse JS/TS SDK v5 (`@langfuse/otel` + `@langfuse/tracing`) with v4 observations-first ingestion (`x-langfuse-ingestion-version: 4` in `src/instrumentation.ts`). Environment is `VERCEL_ENV` (`production` / `preview` / `development`); release is the git SHA. Observation metadata also carries `tracingEnvironment`, `gitBranch`, `vercelEnv`, and `customer`. Reads go through Observations API v2 (`src/lib/observability/langfuse-observations.ts`), not the deprecated traces list/get endpoints.
