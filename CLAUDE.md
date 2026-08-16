# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Andrei — a Next.js 16 investigation-report engine with per-customer packs. Demo (`ANDREI_CUSTOMER=demo`) is Andrei-branded with design verification and a conclusion section. MJ (`ANDREI_CUSTOMER=mj`) overlays SOP/DP/QA/008 criteria and prompts, the MJ Word template, MJ branding, Word import, and hides conclusion plus design verification. Features: in-browser DMAIC editor with auto-save, AI traffic-light evaluation (Gemini via Vercel AI Gateway), manager review with comments, attachments/chat, and DOCX export.

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
```

**One-time E2E setup:**
```bash
pnpm exec playwright install --with-deps chromium firefox webkit
```

## Architecture

**Tech stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS v4, Drizzle ORM + Neon Postgres, AI SDK v6 with Gemini, TipTap v3 rich text editor, `docx` library for DOCX generation.

**Path alias:** `@/*` maps to `src/*`.

### Key directories

- `src/app/api/reports/[reportId]/` — Route handlers for report CRUD, section auto-save (`sections/[sectionType]`), AI `evaluate`, evaluation bypass (`evaluations/[evalId]`), AI `suggestions`, `comments`, `submit`/`approve`/`feedback` workflow, `chat` (AI chat), `audit` (trail), `attachments`, and `export`/`complete-export` (DOCX).
- `src/app/improve-ai/` — Improve AI pages: session list and `[sessionId]` review page.
- `src/app/api/improve-ai/` — API routes for creating sessions (from report or uploaded DOCX), listing sessions, and completing review.
- `src/app/api/reports/[reportId]/chat/` — AI chat sessions/messages scoped to a report (see AI Chat subsystem).
- `src/app/admin/` + `src/app/api/admin/` — Admin console (audit log viewer, user management, retention/password-policy settings). API: `audit`, `users` (+ `reset-password`, `unlock`), `password-policy`, `retention`, `reports/[reportId]/{purge,source-docx}`.
- `src/app/insights/` — Analytics dashboards (`dashboard`, `doc-insights`, `management`, `pitfalls`). Currently backed by `src/lib/insights/mock-data.ts`.
- `src/app/api/site-access/` — Site-wide password gate (see Site Access subsystem).
- `src/app/{login,change-password,forgot-password,reset-password,unlock,profile}/` — auth/account pages. `src/app/api/auth-pw/` — password-based auth routes (forgot/reset).
- `src/components/report/` — Editor UI: `report-workspace.tsx` (header + tabs + sidebar), per-section editors in `sections/`, `report-sidebar.tsx` (AI traffic-light results), `review-rail/` (manager comment margin UI).
- `src/components/improve-ai/` — Improve AI UI: session form, upload button, section content display, stale-rerun dialog.
- `src/components/ui/` — shadcn-style Radix UI primitives.
- `src/db/schema/index.ts` — Drizzle schema (single file, not a directory): `workspaceUsers`, `reports`, `reportManagers` (many managers per report), `reportSections`, `criteriaEvaluations`, `comments`, `chatSessions`/`chatMessages` (AI chat), `reportSourceDocx` (original .docx as bytea), `mathExtractionCache` (LLM formula cache keyed by image SHA-256), `aiFeedbackSessions`/`aiFeedbackResponses` (Improve AI), `auditEvents`/`sectionContentVersions`/`electronicSignatures` (audit subsystem), `passwordPolicySettings`, `retentionSettings`. NextAuth tables + `authUsers` in `auth.ts`.
- `src/lib/ai/` — AI evaluation, suggestion, and chat pipelines (see subsystems below).
- `src/lib/audit/` — Hash-chained audit log, section version history, and e-signature workflow (see Audit subsystem).
- `src/lib/customers/` — Customer pack resolver (`ANDREI_CUSTOMER` / `NEXT_PUBLIC_ANDREI_CUSTOMER`). Demo vs MJ overlays: criteria descriptions, eval prompts, export template, hidden sections, enabled document types, Word import, branding.
- `src/lib/reports/` — Report domain logic: access control (`access.ts`), manager authorization, deviation-no generation, submit validation, source-docx persistence, blank-section seeding, tombstones.
- `src/lib/admin/` — Admin-console business logic (user/retention/password-policy operations).
- `src/lib/improve-ai/` — Improve AI business logic: session store, session view, human-judgment tracking, response syncing, staleness detection.
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
- `src/proxy.ts` — Next.js middleware logic (auth redirects, `mustChangePassword`/`passwordExpired` enforcement). Exported as `proxy` and re-used by the actual `middleware.ts` entry point. Note: it does **not** enforce the site-access gate (that lives on the `/unlock` page).

### Data flow

1. TipTap editor → section content (JSONB in `report_sections`)
2. Auto-save debounces 1.5s → `PATCH /api/reports/[id]/sections/[sectionType]`
3. AI evaluation → `POST /api/reports/[id]/evaluate` → upserts `criteria_evaluations`
4. Manager review → submit/comment/approve/feedback status transitions
5. DOCX export → `GET /api/reports/[id]/export`

### Report statuses

`draft` → `submitted` → `in_review` → `feedback` (back to engineer) or `approved`

### Section types

DMAIC (`define`, `measure`, `analyze`, `improve`, `control`) plus three non-editable structural sections: `documents_reviewed`, `attachments`, `signature_approvals`. All are values of the `sectionTypeEnum`. Content types in `src/types/sections.ts`.

### Auth

NextAuth v5 with Drizzle adapter. Credentials (email/password) and Resend (magic link). JWT-based sessions with `workspaceUserId` and `role`. Roles: `engineer`, `manager`, `admin`, `qa` (`src/lib/auth/roles.ts`, `userRoleEnum`). E2E/test seed accounts are created via `POST /api/test/seed-auth-users`; user helpers live in `src/lib/auth/` (`workspace-users.ts`, `user-directory.ts`).

Password lifecycle is enforced beyond NextAuth: `mustChangePassword`/`passwordExpired` force a redirect to `/change-password` (via the proxy); configurable password policy in `passwordPolicySettings`; failed-login lockout with admin unlock at `POST /api/admin/users/[userId]/unlock`; self-service forgot/reset via `/forgot-password`, `/reset-password`, and `src/app/api/auth-pw/`. An optional site-wide password gate (`/unlock`, `POST /api/site-access`) is active only when `SITE_ACCESS_PASSWORD` is set.

### Customer packs

`src/lib/customers/` resolves `ANDREI_CUSTOMER` (default `demo`). Set **both** `ANDREI_CUSTOMER` and `NEXT_PUBLIC_ANDREI_CUSTOMER` to the same value; they must agree with `ANDREI_VERCEL_DEPLOY_SCOPE` when that is set. Packs overlay criteria descriptions, eval prompts (`promptVersion` is distinct for MJ), export template, hidden sections, enabled document types, Word import, and branding. Do not use feature flags for customer identity. Deploys: `docs/whitelabel-vercel-deploy.md`.

## Environment variables

Required in `.env.local` (see `.env.example` for all options):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string. Local Docker: `postgresql://andrei:andrei@localhost:5432/andrei_dev` |
| `AUTH_SECRET` | NextAuth secret — generate with `openssl rand -base64 32` |
| `AUTH_RESEND_KEY` | Resend API key for magic-link emails |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key (recommended). AI features fail without this or `GOOGLE_GENERATIVE_AI_API_KEY`. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Direct Gemini key (alternative to gateway) |
| `SITE_ACCESS_PASSWORD` | Optional. When set, enables the site-wide password gate at `/unlock`. Unset = gate disabled. |
| `ANDREI_CUSTOMER` | Customer pack: `demo` (default) or `mj`. Must agree with `NEXT_PUBLIC_ANDREI_CUSTOMER` and `ANDREI_VERCEL_DEPLOY_SCOPE`. |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | Same value as `ANDREI_CUSTOMER` (client branding / create-dialog). Unset → demo. |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `mj` on `andrei-v2`, `demo` on `andrei-demo`. Must agree with the pack. |

**Test-only variables** (never set on Vercel production or preview):

| Variable | Effect |
|----------|--------|
| `ALLOW_TEST_LOGIN=true` | Enables `POST /api/test/login` bypass |
| `ALLOW_TEST_SKIP_EVALUATION=true` | Stubs all `evaluateSection()` calls |
| `ALLOW_TEST_SKIP_SUGGESTIONS=true` | Stubs AI suggestions |
| `ALLOW_TEST_STUB_MATH_EXTRACTION=true` | Stubs WMF/EMF vision LLM calls |

Playwright sets these automatically in `webServer.env` — do not add them to production Vercel env.

## Local development gotchas

**Postgres not auto-started:** If using a native (non-Docker) Postgres install, start it manually before running the app or DB scripts: `sudo pg_ctlcluster 16 main start`. Connection is via `127.0.0.1`, so `src/db/connection.ts` uses the `pg` driver, not the Neon HTTP driver.

**`pnpm db:push` is interactive:** It prompts in a TTY and fails in non-interactive shells with "Interactive prompts require a TTY". Always use `pnpm db:local:push` in scripts, CI, or when automating schema updates.

**Turbopack route registration bug:** In `pnpm dev`, a newly-added API route can fail to register on its first on-demand compile and return Next's HTML 404 page for every method. Fix: restart the dev server (optionally `rm -rf .next` first). This is a dev-server state issue, not a code bug.

**AI features require a key:** Core flows (login, report CRUD, editor, manager review, DOCX export) work without AI credentials. "Run AI Check" and suggestions fail until `AI_GATEWAY_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` is set in `.env.local`.

**Creating a workspace user locally:**
```bash
pnpm set-workspace-password -- bhargav.patel@mjbiopharm.com 'TempPass123!' --role engineer
```
The email must be `@mjbiopharm.com`. The account is flagged `mustChangePassword` on first login.

## Subsystem: DOCX Import

**Entry point:** `docxBufferToImportedReportContent()` in `src/lib/import/docx-to-sections.ts`

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

**Criteria:** 36 static criteria defined in `criteria.ts` — Define (6), Measure (5), Analyze (5), Improve (6), Control (13).

**Pipeline:**
1. `cleanSectionContentForEval()` strips pending suggestion marks from content
2. `buildCriterionEvaluationLlmPrompts()` constructs system + user prompt
   - System prompt defines traffic-light system (met/partially_met/not_met), scope rules, prompt injection guard
   - User prompt includes: deviation info, section content (via `contextForPrompt()`), prior sections (read-only context only), criteria list
   - Prompt version tracked in `PROMPT_VERSION` constant — bumping invalidates cached evals
3. `generateText()` with Gemini 3.1-flash-lite, temperature 0, seed 0 (deterministic)
4. `capEvaluationStatusForPlaceholders()` caps to partially_met if unfilled placeholders detected (never not_met solely for placeholders)
5. Results upserted into `criteria_evaluations` table. On re-evaluation, `fixApplied` preserved; `bypassed` cleared.

**Content hash:** `hashContent(cleanedContent, PROMPT_VERSION)` stored with evaluation to detect staleness.

## Subsystem: AI Suggestions

**Entry point:** `generateSuggestionsForSection()` in `src/lib/ai/suggest.ts`

**Pipeline:**
1. `gapCriteriaForSection()` (in `suggestion-gating.ts`) filters to failing criteria (not_met + partially_met) with no existing open ai_fix comment
2. Prompt includes each failing criterion with status and reasoning. Editable `SECTION CONTENT` is built by `contextForSuggestionPrompt()` (`suggestion-section-context.ts`) using the **canonical anchor string** (`flattenForAnchor`) — no markdown pipes / `[equation]` tokens. Prior sections stay markdown via `contextForPrompt`. Eval is untouched.
3. `generateText()` with Gemini 3.1-pro, temperature 0.4 (variety in phrasing). Schema returns `{ criterionKey, targetField, anchorText, deleteText, insertText, reasoning }`
4. Gating drops suggestions via `probeRichEdit` / `probePlainEdit` (same code path as apply): bad criterion key, bad target field, empty edit, placeholder-only edit, not found, ambiguous, cross-cell
5. `sortedOpenSuggestionsForSection()` orders: red first, then yellow, then criterion order. `activeSuggestionForSection()` returns highest-priority for UI.

**Locator (single matcher):** `src/lib/suggestions/locator.ts` — `flattenForAnchor`, `locateEdit`, `applyEditToRichDoc` / `applyEditToPlainText`, `probeRichEdit` / `probePlainEdit`. Gate ≡ apply is structural (probe is locate without commit).

**Applying suggestions:** all three UI surfaces (suggestion card, rich TipTap widget, plain-text field) go through `acceptSuggestion` / `dismissSuggestion` in `accept-suggestion.ts`. Order: locate → apply → PATCH section → flip comment status. Never resolve without a successful apply.

**Key invariant:** Anchor must be unique in the canonical field text. Whitespace is normalized for matching (multiple spaces/newlines → single space). Cross-paragraph deletes are allowed; cross-cell deletes are dropped.

## Subsystem: DOCX Export

**Entry point:** `generateDocx()` in `src/lib/export/generate-docx.ts`

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

## Subsystem: Improve AI

**Purpose:** A separate feedback loop where engineers submit a completed report (or upload a reference DOCX) and receive per-criterion AI evaluations they can agree/disagree with. Results train human-judgment data (`aiFeedbackResponses`) separate from the live evaluation cache.

**Entry points:**
- `POST /api/improve-ai/from-report` — creates a session from an existing report
- `POST /api/improve-ai/upload` — creates a session from an uploaded DOCX
- `GET/PATCH /api/improve-ai/sessions/[id]` — fetch/update session
- `POST /api/improve-ai/sessions/[id]/complete` — mark session as reviewed

**Data flow:**
1. Session created → status `evaluating` → background evaluation runs `evaluateSection()` for all DMAIC sections
2. Status transitions to `ready_for_review`; engineer reviews per-criterion AI verdicts in `/improve-ai/[sessionId]`
3. For each criterion the user records agreement + optional comment → upserted into `aiFeedbackResponses`
4. `POST .../complete` marks session `reviewed`

**Staleness:** `src/lib/improve-ai/session-staleness.ts` detects when the underlying report has changed since the session was created, prompting a re-run dialog.

## Subsystem: Audit Trail & E-Signatures

**Purpose:** 21 CFR Part 11-style tamper-evident audit trail, section version history, and electronic signatures on workflow transitions.

**Entry points (all re-exported from `src/lib/audit/index.ts`):**
- `recordAuditEvent()` (`record-audit-event.ts`) — appends to the hash-chained `auditEvents` table (each row carries `seq` + `prevHash`; hashing matches a DB trigger).
- `recordSectionVersion()` — snapshots section content into `sectionContentVersions`; `reconstructSection()` rebuilds a section at a given version.
- `recordElectronicSignature()` / `listSignaturesForReport()` — writes `electronicSignatures` (meaning from `signatureMeaningEnum`).
- `verifyAuditChain()` — validates monotonic `seq` and `prevHash` linkage; reports the first invalid seq.
- `verify-password-for-signing.ts` + `workflow-sign.ts` — re-authenticate the user's password before a signed transition; `handleWorkflowSignRequest()` (`workflow-handler.ts`) is the signed submit/approve/feedback handler.
- Export/review: `export.ts` + `audit-csv.ts` (CSV export), viewed in `src/app/admin/audit/`.

**Key invariant:** The chain is append-only; content edits go through `hashSectionContent()` and version snapshots, never in-place history rewrites.

## Subsystem: AI Chat

**Purpose:** Per-report conversational assistant that can read report context and propose edits.

**Entry point:** `POST /api/reports/[reportId]/chat` — `streamText()` (via `resolveChatLanguageModel()`) with tools from `buildChatTools()`, streamed back with `toUIMessageStreamResponse()`. Sessions/messages persist in `chatSessions`/`chatMessages` and are managed under `chat/sessions/[sessionId]`.

**Logic in `src/lib/ai/chat/`:** `system-prompt.ts` (mode-aware prompt), `context-map.ts` (serializes report state for the model), `fields.ts`/`section-scope.ts` (which sections/fields are in scope), `propose-edit.ts` (validates a proposed edit), `session-title.ts`, `access.ts` (report access guard). `ALLOW_TEST_*` / `stub-model.ts` provide a deterministic model in tests.

## Subsystem: Redrafts

**Purpose:** A suggestion variant that replaces an **entire field** (not an anchored span) with LLM-generated markdown — used for AI-authored rewrites.

**Apply:** `applyRedraftToSection()` in `src/lib/suggestions/apply-redraft.ts` — rich target fields get `markdownToDoc()` (tables included); plain fields get flattened via `redraftPlainTextValue()`. Whole-field replacement, no anchor matching.

**Preview:** `buildRedraftPreviewDoc()` in `src/lib/tiptap/redraft-preview.ts` renders the redraft as inline tracked changes (current content struck through + replacement highlighted) reusing the standard suggestion-mark machinery, so `acceptSuggestionMarksById()`/`stripSuggestionMarksById()` finalize or revert it.

## Subsystem: Site Access Gate

**Purpose:** Optional single shared-password gate in front of the whole site (e.g. for preview deployments), independent of user auth.

**Flow:** Active only when `SITE_ACCESS_PASSWORD` is set. `POST /api/site-access` compares the password (`timingSafeEqual`), mints an HMAC token (`mintSiteAccessToken`), and sets the httpOnly `mjb_site_access` cookie (30-day). The `/unlock` page (`src/app/unlock/page.tsx`) renders the password form and verifies the cookie. Not enforced by `src/proxy.ts`. Distinct from per-user account lockout (`/api/admin/users/[userId]/unlock`).

## Testing

- Vitest config: `vitest.config.ts`, environment `node`, setup file `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`).
- E2E: Playwright with chromium, base URL `http://127.0.0.1:3000`, config in `playwright.config.ts`.
- Test files live alongside source: `*.test.ts` / `*.test.tsx`.
- Full E2E details, artifact locations, and test catalog: `TESTING.md`.
- `pnpm precommit` runs lint + typecheck + Vitest only (no E2E). CI runs them in separate jobs.

**E2E infrastructure:** `e2e/auth.setup.ts` seeds users via `POST /api/test/seed-auth-users` before browser tests. Helpers: `e2e/helpers/auth.ts` (`loginAsEngineer`, `loginAsManager`) and `e2e/helpers/reports.ts` (`createReport`, `deleteReport`). Use `uniqueDeviationNo` for isolation and `deleteReport` in `afterEach`.

## Style

- Dark theme with MJ Biopharm navy brand color `#2D2A6E`.
- Tailwind CSS v4 configured in `src/app/globals.css`.
- Toast notifications via `sonner`.
- Observability: Langfuse tracing + OpenTelemetry (`src/instrumentation.ts`).
