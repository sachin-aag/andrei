# CLAUDE.md

Architecture handbook for this repository. Cursor also loads `AGENTS.md` (operating
caveats) and `.cursor/rules/*.mdc` (file-scoped invariants). If those disagree
with this file, trust `AGENTS.md` / the rules / the code — then fix this file.

## Project

Andrei — a Next.js 16 investigation-report engine with per-customer packs. Demo (`ANDREI_CUSTOMER=demo`) is Andrei-branded with design verification, a conclusion section, and a demo-only free-form Document (`generic_document`: one TipTap body, no criteria). MJ (`ANDREI_CUSTOMER=mj`) overlays SOP/DP/QA/008 criteria and prompts, the MJ Word template, MJ branding, Word import, hides conclusion plus design verification, and adds Quality Risk Assessment (`quality_risk_assessment`, SOP/DP/QA/010). Convergent (`ANDREI_CUSTOMER=convergent`) is Convergent Dental branding with design verification only (9-section Solea DV template). Features: in-browser DMAIC editor with auto-save, AI traffic-light evaluation (Gemini via Vercel AI Gateway or Vertex), manager review with comments, attachment evidence (PDF/DOCX ingest + chat retrieval), and DOCX export.

## Commands

```bash
pnpm install              # install dependencies
pnpm dev                  # dev server at http://localhost:3000
pnpm build                # production build (pnpm vercel:build for Vercel CI)
pnpm lint                 # ESLint
pnpm typecheck            # tsc --noEmit (strict mode)
pnpm test                 # Vitest (all unit tests, no watch)
pnpm test:watch           # Vitest watch mode
pnpm test:coverage        # Vitest with v8 coverage
pnpm test -- src/lib/ai/evaluate.test.ts  # run a single test file
pnpm test:e2e             # Playwright E2E (chromium, hits 127.0.0.1:3000)
pnpm exec playwright test e2e/auth.spec.ts --project=chromium  # single E2E spec
pnpm precommit            # lint + typecheck + test (husky hook)
pnpm db:push              # apply Drizzle schema directly to DB (interactive — prompts in TTY)
pnpm db:local:push        # non-interactive schema push (use in scripts/CI, not pnpm db:push)
pnpm db:generate          # generate Drizzle migrations
pnpm db:migrate           # run Drizzle migrations
pnpm db:studio            # Drizzle Studio GUI
pnpm db:local:up          # start local Docker Postgres
pnpm db:local:down        # stop local Docker Postgres
pnpm db:local:setup       # up + push schema to local DB
pnpm db:local:reset       # reset local DB (destructive)
pnpm db:ensure            # ensure required DB tables/enums exist
pnpm set-workspace-password  # set a workspace user's password (CLI prompt)
pnpm db:ensure-workspace-users  # upsert the mock workspace users into the DB
pnpm seed-demo-reports    # seed demo reports for the demo engineer (loads .env + .env.local)
pnpm sample-eval-report   # bulk AI evaluation of sample DOCXs → HTML report (needs gateway key)
pnpm model-sweep          # run the AI eval across multiple models (scripts/eval/)
pnpm compare-evals        # diff two eval runs (scripts/eval/)
pnpm soak:pdf-ingest      # local PDF extract soak (Vertex; no DB/GCS writes)
```

`pnpm db:ensure-workspace-users` uses the Neon HTTP driver — skip it against
local Docker. Create users with `pnpm set-workspace-password` instead.

**One-time E2E setup:**
```bash
pnpm exec playwright install --with-deps chromium firefox webkit
```

## Architecture

**Tech stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS v4, Drizzle ORM + Postgres (Neon or local Docker; **always** the `pg` driver), AI SDK v6 with Gemini (Gateway and/or Vertex), TipTap v3, `docx` for DOCX generation. pgvector for attachment chunks.

**Path alias:** `@/*` maps to `src/*`.

### Key directories

- `src/app/api/reports/[reportId]/` — Route handlers for report CRUD, section auto-save (`sections/[sectionType]`), AI `evaluate`, evaluation bypass (`evaluations/[evalId]`), AI `suggestions`, `comments`, `submit`/`approve`/`feedback` workflow, `chat` (AI chat), `analytics` (worksheet + sixpack + stats chat), `audit` (trail), `attachments`, `revisions` (product History snapshots + inline diff), and `export`/`complete-export` (DOCX).
- `src/app/api/reports/[reportId]/chat/` — AI chat sessions/messages scoped to a report (see AI Chat subsystem).
- `src/app/admin/` + `src/app/api/admin/` — Admin console (audit log viewer, user management, retention/password-policy settings). API: `audit`, `users` (+ `reset-password`, `unlock`), `password-policy`, `retention`, `reports/[reportId]/{purge,source-docx}`.
- `src/app/insights/` — Analytics dashboards (`dashboard`, `doc-insights`, `management`, `pitfalls`). Currently backed by `src/lib/insights/mock-data.ts`.
- `src/app/api/site-access/` — Site-wide password gate (see Site Access subsystem).
- `src/app/{login,change-password,forgot-password,reset-password,unlock,profile}/` — auth/account pages. `src/app/api/auth-pw/` — password-based auth routes (forgot/reset).
- `src/components/report/` — Editor UI: `report-workspace.tsx` (header Document | Agent chrome + work-product Report | Analytics pane + sidebar), per-section editors in `sections/`, `report-sidebar.tsx` (AI traffic-light results + analytics chat), `review-rail/` (manager comment margin UI), History compare (`document-revision-history.tsx` / `document-revision-diff.tsx` / `analytics-revision-diff.tsx`).
- `src/components/statistical-analysis/` — Report Analytics worksheet grid, Stat menu, sixpack/scatter SVG, capability and plot-measurements dialogs, stats chat panel.
- `src/components/ui/` — shadcn-style Radix UI primitives.
- `src/db/schema/index.ts` — Drizzle schema (single file, not a directory): `workspaceUsers`, `reports` (includes `documentType`), `reportManagers`, `reportSections`, `criteriaEvaluations`, `comments`, `chatSessions`/`chatMessages`, `reportSourceDocx`, `mathExtractionCache`, `auditEvents`/`sectionContentVersions`/`electronicSignatures`, `passwordPolicySettings`, `retentionSettings`, `statisticalWorkspaces`/`statisticalAnalyses`, `documentRevisions`/`documentRevisionSections` (document History — not the audit chain), `analyticsRevisions` (Analytics History), plus attachment evidence (`reportAttachments`, `attachmentIngestRuns`, `documentPages`, `documentChunks` with `vector(768)`). NextAuth tables + `authUsers` in `auth.ts`.
- `src/lib/document-revisions/` — Document product History snapshots (`snapshot.ts`) and inline compare (`inline-diff.ts`). One row per Agent-chrome report turn, or one coalesced row per human editing burst (30s idle). Compare diffs prose, every table by index, and added/removed figures. Worksheet writes are `analyticsRevisions`, not document versions.
- `src/lib/analytics-revisions/` — Analytics product History (worksheet + plots snapshot, idle-coalesced). Compare is a cell/plot list, not TipTap.
- `src/lib/ai/` — AI evaluation, suggestion, and chat pipelines (see subsystems below).
- `src/lib/document-types/` — Registry for `investigation_report`, `design_verification`, `mechanical_design_verification`, `quality_risk_assessment`, and `generic_document` (sections, criteria, prompts, chat persona, merge).
- `src/lib/attachments/` — PDF/DOCX ingest, chunk/embed, hybrid retrieval (`searchReportDocuments`, `readDocumentPage`, `readDocumentOutline`).
- `src/lib/storage/` — Attachment blob storage (GCS vs local).
- `src/lib/audit/` — Hash-chained audit log, section version history, and e-signature workflow (see Audit subsystem).
- `src/lib/customers/` — Customer pack resolver (`ANDREI_CUSTOMER` / `NEXT_PUBLIC_ANDREI_CUSTOMER`). Demo vs MJ vs Convergent overlays: criteria descriptions, eval prompts, export template, hidden sections, enabled document types, Word import, branding, `statisticalAnalysisEnabled`.
- `src/lib/statistical-analysis/` — Report-scoped worksheet ops, I-MR Normal Capability Sixpack, analytics store and stats-only chat tools.
- `src/lib/reports/` — Report domain logic: access control (`access.ts`), manager authorization, deviation-no generation, submit validation, source-docx persistence, blank-section seeding, tombstones.
- `src/lib/admin/` — Admin-console business logic (user/retention/password-policy operations).
- `src/lib/analytics/` — PostHog client event capture (`events.ts` enumerates the event names).
- `src/lib/eval/` — Offline eval harness helpers (model sweep, run comparison).
- `src/lib/export/` — DOCX generation (see subsystem below).
- `src/lib/import/` — DOCX parsing (see subsystem below).
- `src/lib/tiptap/` — TipTap editor extensions and utilities: rich text helpers, placeholder highlights, suggestion injection, redraft preview.
- `src/lib/placeholders/` — Placeholder detection, fill, scan, and evaluation policy.
- `src/lib/suggestions/` — Suggestion validation, plain-text edit location, comment persistence, whole-field redraft apply (`apply-redraft.ts`).
- `src/lib/site-access-token.ts` / `site-access-cookie.ts` — HMAC-signed site-gate token + cookie helpers.
- `src/providers/report-provider.tsx` — Centralized client-side state via React Context.
- `src/hooks/` — Auto-save hooks (see subsystem below).
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

- **Investigation:** DMAIC (`define`, `measure`, `analyze`, `improve`, `control`) plus `conclusion`, plus non-editable `documents_reviewed`, `attachments`, `signature_approvals`. Content types in `src/types/sections.ts`.
- **Design verification:** demo/MJ shape is `purpose_scope`, `references`, `traceability`, `test_methods`, `test_results`, `deviations`, `conclusion`, `approval_signoff`, `appendices`, plus virtual `cover_page` (lives in `reports.metadata`, not `report_sections`). Convergent pack (`buildDesignVerificationDefinition`) is a 9-section Solea DV (`purpose` … `conclusion`, no cover page). Content types in `src/lib/document-types/design-verification/sections.ts` and `src/lib/document-types/convergent/sections.ts`.
- **Quality risk assessment (MJ only):** SOP/DP/QA/010 F02 + F04. Keys are prefixed `qra_` (`qra_approach` … `qra_revision_history`). Identity lives in `reports.metadata`. RPN/RPR are computed in `src/lib/document-types/qra/scoring.ts`, not by the LLM.
- **Generic document (demo pack only):** one continuous `body` section (`{ narrative }`). The editor is a US Letter page canvas (visual page separators overlay the same TipTap field — not extra JSON nodes). No criteria, no Criteria tab / Run AI Check. Headings (H1–H3) are enabled for this type only. Word upload is type-owned (`wordImport.kind === "generic_body"`) and does **not** use pack `wordImportEnabled`. Accepting AI suggestions persists TipTap revision marks and exports them as Word tracked changes. Content types in `src/lib/document-types/generic/sections.ts`.

### Auth

NextAuth v5 with Drizzle adapter. Credentials (email/password) is the primary sign-in UI; Resend magic link is a secondary option on `/login`. JWT-based sessions with `workspaceUserId` and `role`. Roles: `engineer`, `manager`, `admin`, `qa` (`src/lib/auth/roles.ts`, `userRoleEnum`). E2E/test seed accounts are created via `POST /api/test/seed-auth-users`; user helpers live in `src/lib/auth/` (`workspace-users.ts`, `user-directory.ts`).

Password lifecycle is enforced beyond NextAuth: `mustChangePassword`/`passwordExpired` force a redirect to `/change-password` (via the proxy); configurable password policy in `passwordPolicySettings`; failed-login lockout with admin unlock at `POST /api/admin/users/[userId]/unlock`; self-service forgot/reset via `/forgot-password`, `/reset-password`, and `src/app/api/auth-pw/`. An optional site-wide password gate (`/unlock`, `POST /api/site-access`) is active only when `SITE_ACCESS_PASSWORD` is set.

### Customer packs

`src/lib/customers/` resolves `ANDREI_CUSTOMER` (default `demo`). Set **both** `ANDREI_CUSTOMER` and `NEXT_PUBLIC_ANDREI_CUSTOMER` to the same value; they must agree with `ANDREI_VERCEL_DEPLOY_SCOPE` when that is set. Packs overlay criteria descriptions, eval prompts (`promptVersion` is distinct for MJ and Convergent), export template, hidden sections, enabled document types, Word import, and branding. Do not use feature flags for customer identity. Deploys: `docs/whitelabel-vercel-deploy.md`.

## Environment variables

Required in `.env.local` (see `.env.example` for all options):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string. Local Docker: `postgresql://andrei:andrei@localhost:5432/andrei_dev`. Runtime always uses the `pg` driver (`src/db/connection.ts`), including Neon TCP. |
| `AUTH_SECRET` | NextAuth secret — generate with `openssl rand -base64 32` |
| `AUTH_RESEND_KEY` | Resend API key for magic-link emails |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key. AI Check / suggestions / chat can use this **or** `GOOGLE_GENERATIVE_AI_API_KEY`. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Direct Gemini key (alternative to gateway for eval/suggest/chat) |
| `GOOGLE_VERTEX_PROJECT` | **Required for PDF/DOCX ingest + embeddings** (Vertex-only; gateway is not a fallback). Pair with WIF (`GCP_WIF_AUDIENCE`, `GCP_SERVICE_ACCOUNT_EMAIL`) on Vercel. |
| `GCS_BUCKET` | Production attachment bytes. Local: `ATTACHMENT_STORAGE_BACKEND=local` **and** `ALLOW_LOCAL_ATTACHMENT_STORAGE=true`. |
| `SITE_ACCESS_PASSWORD` | Optional. When set, enables the site-wide password gate at `/unlock`. Unset = gate disabled. |
| `ANDREI_CUSTOMER` | Customer pack: `demo` (default), `mj`, or `convergent`. Must agree with `NEXT_PUBLIC_ANDREI_CUSTOMER` and `ANDREI_VERCEL_DEPLOY_SCOPE`. |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | Same value as `ANDREI_CUSTOMER` (client branding / create-dialog). Unset → demo. |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `mj` on `andrei-v2`, `demo` on `andrei-demo`, `convergent` on `andrei-convergent`. Must agree with the pack. |

**Test-only variables** (never set on Vercel production or preview):

| Variable | Effect |
|----------|--------|
| `ALLOW_TEST_LOGIN=true` | Enables `POST /api/test/login` / seed-auth. Also requires `TEST_AUTH_EMAIL`. |
| `TEST_AUTH_EMAIL` | Email used by the test-login bypass (Playwright defaults `test.engineer@mjbiopharm.com`) |
| `ALLOW_TEST_SKIP_EVALUATION=true` | Stubs all `evaluateSection()` calls |
| `ALLOW_TEST_SKIP_SUGGESTIONS=true` | Stubs AI suggestions |
| `ALLOW_TEST_STUB_MATH_EXTRACTION=true` | Stubs WMF/EMF vision LLM calls |
| `ALLOW_TEST_STUB_DOCUMENT_INGEST=true` | Stubs Vertex extract/embed; fixture must still insert pages + chunks |
| `ALLOW_TEST_STUB_CHAT=true` | Deterministic `buildStubChatModel` (cannot assert tool selection) |

Playwright sets these automatically in `webServer.env` — do not add them to production Vercel env.

## Local development gotchas

**Postgres:** Default local path is Docker (`pnpm db:local:up`). Native `pg_ctlcluster` is optional and not assumed. The app **always** uses the `pg` driver, including Neon — not because the host is `127.0.0.1`. Neon HTTP cannot run `db.transaction()`.

**`pnpm db:push` is interactive:** It prompts in a TTY and fails in non-interactive shells with "Interactive prompts require a TTY". Always use `pnpm db:local:push` in scripts, CI, or when automating schema updates.

**Turbopack route registration bug:** In `pnpm dev`, a newly-added API route can fail to register on its first on-demand compile and return Next's HTML 404 page for every method. Fix: restart the dev server (optionally `rm -rf .next` first). This is a dev-server state issue, not a code bug.

**AI credentials are not interchangeable:** Core flows (login, report CRUD, editor, manager review, DOCX export) work without AI keys. "Run AI Check" / suggestions / chat need `AI_GATEWAY_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`. PDF/DOCX ingest + embeddings need **Vertex** (`GOOGLE_VERTEX_PROJECT`).

**Creating a workspace user locally:**
```bash
pnpm set-workspace-password -- bhargav.patel@mjbiopharm.com 'TempPass123!' --role engineer
```
MJ convention is `@mjbiopharm.com`; the script does not enforce the domain. The account is flagged `mustChangePassword` on first login.

**Playwright port 3000:** Local config sets `reuseExistingServer`. Whatever already owns 3000 is reused **without** Playwright’s stub env. Stop it, or set `PLAYWRIGHT_BASE_URL` to a server that already has the flags and matching `AUTH_URL`.

## Subsystem: DOCX Import

Investigation-report import. **Entry point:** `docxBufferToImportedReportContent()` in `src/lib/import/docx-to-sections.ts`. Design-verification import/export uses the type’s `templatePath` / merge helpers in `src/lib/document-types/`.

**Pipeline stages:**
1. Mammoth converts DOCX → markdown (preserves list numbering) and → HTML (preserves table structure)
2. Markdown split by section heading regex into Define/Measure/Analyze/Improve/Control
3. `buildSectionsFromRaw()` converts raw text → TipTap JSONContent per section. Analyze gets special handling for 6M fields, 5-Why, root cause levels, impact assessment.
4. Table injection: HTML tables matched to flat paragraphs by cell-text sequence, replaced with TipTap table nodes. Merged cells expanded (value repeated in every covered row/column).
5. `enrichNarrativesFromDocxBuffer()` in `docx-rich-content.ts` bypasses mammoth to extract direct OOXML formatting: bold, italic, underline, colors, subscript, superscript, OMML equations (→ MathML), images. Matches OOXML paragraphs to mammoth output by plain-text similarity with media placeholder normalization (`[image:...]` and `[equation]` → `[media]`).
6. Legacy WMF/EMF equation previews sent to vision LLM for math extraction (falls back to `[formula]` placeholder).
7. `extractWordCommentsFromDocxBuffer()` extracts comments from comments.xml, maps to sections by anchor text. Duplicate anchors in same section grouped into threads.

**Returns:** `{ sections, toolsUsed, header (date/deviation#), comments }`

**Key invariant:** Anchor text matching uses substring inclusion only when both sides are ≥12 chars, preventing stray short strings from overwriting paragraphs.

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

**Bulk apply/dismiss:** `Apply all N` / `Dismiss all` in the report workspace header (`report-bulk-suggestion-actions.tsx`) are **document-wide**, not section-scoped — `acceptAllSuggestionsInReport` / `dismissAllSuggestionsInReport` in `src/lib/suggestions/bulk-suggestions.ts` walk every section in `suggestionCardSectionKeys` order. Each open suggestion is re-merged against the in-memory document in queue order. Each section PATCHes once, then comment statuses flip in parallel. A stale suggestion is skipped; a save failure aborts that section only and later sections still run. No confirm dialog — the toast reports applied/skipped counts. The gutter card keeps only its single Apply/Dismiss. The single-card Apply/Dismiss still uses the cinematic settle delays. Bulk apply uses hold mode `bulk` (keep insert text, hide deletes instantly — do not opacity-0 both runs) and pushes applied content into the editor *before* the section PATCH so the wording does not vanish during save. The hold stays until comments are updated, so TipTap cannot re-inject an already-applied preview.

**Key invariant:** Anchor must be unique in the canonical field text. Whitespace is normalized for matching (multiple spaces/newlines → single space). Cross-paragraph deletes are allowed; cross-cell deletes are dropped.

## Subsystem: DOCX Export

**Entry point:** `generateReportDocx()` in `src/lib/export/generate-docx.ts`. Investigation, design-verification, and generic-document are separate branches (IR template vs `templates/design-verification-report-template.docx` vs `templates/generic-document-template.docx`). The numbered pipeline below is the investigation-report path. Registry `export.templatePath` exists but generate-docx still hardcodes those paths. Generic export maps Heading1–3 (when `useHeadingStyles`), skips investigation checkboxes/signature blocks, and sets `w:trackRevisions` so pending insert/delete marks survive as Word tracked changes.

**Pipeline:**
1. Load template DOCX (`templates/investigation-report-template.docx`) via PizZip + Docxtemplater
2. Per-section generators convert TipTap JSONContent → Word XML (`<w:p>`, `<w:r>`, `<w:rPr>`) via `narrativeToDocxXmlWithContext()`. Handles bold, italic, underline, colors, subscript, superscript, images, OMML equations.
3. Analyze section formats 6M fields, 5-Why pairs, investigation outcome, root cause, impact assessment
4. Improve/Control split into narrative + CA-N/PA-N register tables (`improve-control-checkpoints-docx.ts`)
5. Post-processing passes:
   - `applyInvestigationToolCheckboxes()` — toggles SDT checkboxes for 6M/5-Why/Brainstorming
   - `applyInlineMediaToDocxZip()` — embeds images as base64
   - `applyNumberingToDocxZip()` — preserves list formatting
   - `applyWordCommentsToDocxZip()` — injects comments into comments.xml with thread parent/child linking
   - `applySignatureBlockToDocxZip()` — approval table
   - `applyGoogleDocsImageCompat()` — image compatibility

**Output:** Binary buffer matching `reference-template.docx` layout (header with logo, DMAIC sections, CAPA registers, signature table, footer with page numbers).

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

## Subsystem: Statistical Analysis

**Purpose:** Report-scoped measurement worksheet and Minitab-style Normal Capability Sixpack (individuals / I-MR), attachment measurement scatter, worksheet XY scatter, and one-way ANOVA. Lives on the report **Analytics** tab (same attachments as the document). On for demo, MJ, and Convergent (`statisticalAnalysisEnabled`). Not a document type, not TipTap, and not DMAIC chat. Convergent Document chat does **not** propose `plot_measurements` figures — those plots live in Analytics.

**Entry points:**
- Report workspace header: Document | Agent switch (`data-testid="report-chrome-switch"`, `data-current-chrome`). Chrome is persisted per user + report in localStorage (`workspaceChrome:v1`). Switching to Agent seeds the composer Report | Analytics target from the focused pane. Analytics is a work-product pane (`data-testid="report-surface-analytics"`), not a third chrome.
- `GET/PATCH/POST /api/reports/[reportId]/analytics` (`POST` aliases `PATCH` for autosave beacons)
- `POST .../analytics/analyses` creates a sixpack (default), `kind: "measurement_scatter"`, `kind: "xy_scatter"`, or `kind: "one_way_anova"`; `POST/DELETE .../analytics/analyses/[analysisId]` recomputes or deletes
- `POST /api/reports/[reportId]/analytics/chat` — stats-only assistant (`ANALYTICS_CHAT_PROMPT_VERSION`, surface `analytics`)

**Data flow:**
1. Opening Analytics `getOrCreate`s one worksheet per report (`statistical_workspaces.report_id` unique). The workbook has one or more data sheets. Specs (LSL/USL/target) are edited from a column-header context menu (also insert left/right, delete, clear data, and Analyze data).
2. Enter, paste, or ask the assistant to extract values from attachments (`extract_numeric_series` → `write_column`). Extraction also fills column specs when pages name limits.
3. `Analyze {column}` (or a Shift+arrow row range), column-header **Analyze data…**, or `Stat → Normal Capability Sixpack…` (or `run_capability_sixpack` with optional `rowStart`/`rowEnd`/`rows`) computes I-MR limits, histogram, AD normal plot, Cp/Cpk/Pp/Ppk on the **server** (`computeCapabilitySixpack`). Analyze data opens a plot-type popup (sixpack / ANOVA / attachment scatter) with the column’s values pre-filled and editable. Column specs (right-click header) prefill the form; if those are empty, min/max (and midpoint target) of the selected range are used. Each run **inserts** a new `statistical_analyses` row — same-column titles become `Assay (2)`; a subset is titled `Assay (rows 1–10)`.
4. `Stat → Plot measurements…` (or analytics `plot_measurements`) extracts cited numeric measurements from attachments and saves a scatter (`measurement_scatter`) on Results. Optional LSL/USL in the dialog (or tool args) override extracted acceptance limits; blank keeps the cited limits. Do not reuse Document-chat `executePlotMeasurements` here (that path writes section suggestions).
5. `Stat → Scatter…` (or analytics `plot_xy_scatter`) plots two numeric worksheet columns (`xy_scatter`, Y vs X). Pair rows where both cells parse as numbers; Pearson r is reported (null if n<2 or zero variance). Y-column LSL/USL draw as horizontal dashed lines. `plot_measurements` remains attachment series vs observation index.
6. `Stat → One-Way ANOVA…` (or analytics `run_one_way_anova`) compares a numeric response by a factor column on the same sheet. Pairwise tests are Bonferroni t-tests using the ANOVA MSE (not Tukey). Each run **inserts** a new Results row.
7. Results lists every saved analysis; selecting one does not discard the others. Editing cells **in the analyzed rows** marks a sixpack, ANOVA, or XY scatter **stale** (`sourceHash`); attachment measurement scatter is not worksheet-stale. Recompute refreshes only that row. **Download** saves a CSV.

**Chat:** Same shared `ChatPanel` as Document chat (Ask/Agent + Quick/Deep) in both chromes. `@` tags sheets, plots, and files; `worksheet-sheet-options.ts` only lists data sheets for those chips — there is no sheet-scope dropdown. Tools are search/outline/scan/page/extract/worksheet (`read_worksheet`, `write_column`, `manage_worksheet` for sheets/columns/rows)/sixpack/ANOVA/XY scatter/attachment scatter. Analytics `search_documents` is keyword-first and must not reuse Document-chat grep-loop copy (`truncated` is not a reason to search again). After a cited page, a page read/scan/extract, or two empty greps, search is hidden for the rest of the turn. Images, Quick/Deep, and Ask vs Agent match Document chat. Ask searches and extracts only; Agent can `manage_worksheet`, `write_column`, run a sixpack, run one-way ANOVA, plot two worksheet columns (`plot_xy_scatter`), and plot measurements when the report is writable. Scatters are one series, one color: `plot_xy_scatter` needs two numeric columns (a label/serial column cannot be X); `plot_measurements` is one attachment series vs observation index. Do not substitute sixpack/ANOVA for a scatter, and do not overlay or color by group. No `propose_edit` / `draft_field`. Do not add those tools to the report Plan-mode allowlist. Stub chat is text-only (`buildStubAnalyticsChatModel`). Bump `ANALYTICS_CHAT_PROMPT_VERSION` when analytics prompt copy changes.

**Key invariant:** Analyses do not silently change when the worksheet changes, and a new run never overwrites an earlier sixpack. I-MR constants are Minitab n=2 (`d2=1.128`, `D4=3.267`, `E2=2.66`). Mutations use `canSaveReportSection` (same lock as section autosave). Worksheet PATCH is version-guarded (`statistical_workspaces.version`); a 409 returns the current analytics so the grid can reload instead of last-write-wins. Chat `write_column` / `manage_worksheet` retry once on conflict. `write_column` reports `nonNumericCells` instead of implying a full numeric fill. Product History for Analytics is `analyticsRevisions` (idle-coalesced worksheet bursts; each plot create/recompute/delete is its own version). Audit events `worksheet_updated` / `analysis_*` use entity `analytics`. Do not fold worksheet JSON into `documentRevisions`.

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

## Subsystem: AI Chat

**Purpose:** Per-report conversational assistant that can read report context, search attachments, and propose or commit edits.

**Entry point:** `POST /api/reports/[reportId]/chat` — `streamText()` (via `resolveChatLanguageModel()`) with tools from `buildChatTools()`, streamed back with `toUIMessageStreamResponse()`. Sessions/messages persist in `chatSessions`/`chatMessages` and are managed under `chat/sessions/[sessionId]`. Body includes `workspaceChrome`; the server derives `editPolicy` (`propose` in Document chrome, `commit` in Agent chrome when `canSaveReportSection`). Do not trust a client `editPolicy`.

**Logic in `src/lib/ai/chat/`:**
- `system-prompt.ts` — mode-aware prompt (`plan` vs `agent`); `CHAT_PROMPT_VERSION`; search-then-ask `DOCUMENT_RULES`; commit copy when `editPolicy` is `commit`
- `edit-policy.ts` / `commit-edit.ts` — Agent chrome writes `report_sections` in a `FOR UPDATE` transaction; Document chrome still inserts suggestion comments
- `auto-evidence.ts` — kickoff hybrid retrieval (≤1.5s, fail-soft) injected after document rules
- `context-map.ts` — serializes report state + ready docs (sanitized `summary=`)
- `tools.ts` — `read_section`, `search_documents`, `document_outline`, `read_document_page`, `ask_user`, draft/edit tools, pack-gated `plot_measurements` (off for Convergent Document chat); sanitizes untrusted metadata here (not in `src/lib/attachments/`)
- `fields.ts` — type-specific editable sections (`chatEditableSections`); tagged `@` sections set chat scope. Do not keep investigation-only constants like `CHAT_EDITABLE_SECTIONS`.
- `mentions.ts` — `@` documents/sections. Scope is `sectionScopeFromMentions` (one tagged section focuses prompt/tools; none tagged = all). There is no composer section dropdown and no `body.sectionScope`.
- `propose-edit.ts`, `session-title.ts`, `access.ts`

**Plan-mode allowlist** in `src/lib/ai/chat/document-review.ts`: `read_section`, `search_documents`, `read_document_page`, `document_outline`, `ask_user`, plus document-review tools. New tools must be added here or they are silently missing in Plan. Analytics worksheet/plot tools stay off this list.

**Spectrum:** Document and Agent share `ChatPanel`. Composer/scope/tool changes must cover Document | Agent chrome, `/chat` **and** `/analytics/chat`, prompt versions (`CHAT_PROMPT_VERSION` / `ANALYTICS_CHAT_PROMPT_VERSION`), Plan allowlist, retrieval-policy, already-drafted, stub model, colocated tests, and `AGENTS.md` / this file / `.cursor/rules/chat-and-attachments.mdc`. Removing a control means deleting parsers, prompt copy, switch-section tools, and tests for it — not hiding the UI.

**Retrieval:** `searchReportDocuments` (vector + English FTS OR-tokens). Report body is not chunk-indexed. Stub chat: `ALLOW_TEST_STUB_CHAT` / `stub-model.ts` — streams a canned reply; cannot assert tool selection.

## Subsystem: Attachments (ingest + evidence)

**Purpose:** PDF/DOCX evidence for chat (and future citation), not a replacement for the report body.

**Entry point:** `runDocumentIngest()` in `src/lib/attachments/run-document-ingest.ts`. Extract + embed is **Vertex-only** (`GOOGLE_VERTEX_PROJECT`). Stub: `ALLOW_TEST_STUB_DOCUMENT_INGEST`.

**Pipeline:**
1. Upload stored via `src/lib/storage/` (GCS production; local only with `ATTACHMENT_STORAGE_BACKEND=local` + `ALLOW_LOCAL_ATTACHMENT_STORAGE=true`)
2. Vertex extract (`extract-batch.ts`, `DOCUMENT_EXTRACT_PROMPT_VERSION`) → `document_pages` (`pageContext` + transcript)
3. Chunk (`chunk-pages.ts`) + embed (`embed-chunks.ts`, 768-d) → `document_chunks`
4. `documentSummary` written on the ingest run; listed by `listReadyDocumentsForReport`

**Chat retrieval:** `searchReportDocuments`, `readDocumentPage`, `readDocumentOutline` in `src/lib/attachments/retrieval.ts`. FTS: `to_tsvector('english', contextual_text)` + `document_chunks_contextual_text_fts_en_idx`. Release gates: `docs/pdf-evidence-deployment-checklist.md`.

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
- Observability: Langfuse tracing + OpenTelemetry (`src/instrumentation.ts`).
