# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

M.J. Biopharm Investigation Report Tool — a Next.js 16 app replacing manual DOCX-over-email workflows for pharmaceutical deviation investigation reports (SOP/DP/QA/008). Features an in-browser DMAIC editor with auto-save, AI traffic-light evaluation (Gemini via Vercel AI Gateway), manager review workflow with comments, and DOCX export matching the original template.

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
pnpm precommit            # lint + typecheck + test (husky hook)
pnpm db:push              # apply Drizzle schema directly to DB
pnpm db:generate          # generate Drizzle migrations
pnpm db:migrate           # run Drizzle migrations
pnpm db:studio            # Drizzle Studio GUI
pnpm db:local:up          # start local Docker Postgres
pnpm db:local:down        # stop local Docker Postgres
pnpm db:local:setup       # up + push schema to local DB
pnpm db:local:reset       # reset local DB (destructive)
pnpm db:ensure            # ensure required DB tables/enums exist
pnpm set-workspace-password  # set a workspace user's password (CLI prompt)
```

## Architecture

**Tech stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS v4, Drizzle ORM + Neon Postgres, AI SDK v6 with Gemini, TipTap v3 rich text editor, `docx` library for DOCX generation.

**Path alias:** `@/*` maps to `src/*`.

### Key directories

- `src/app/api/reports/[reportId]/` — Route handlers for report CRUD, section auto-save (`sections/[sectionType]`), AI evaluation, evaluation bypass (`evaluations/[evalId]`), comments, submit/approve/feedback workflow, and DOCX export.
- `src/app/improve-ai/` — Improve AI pages: session list and `[sessionId]` review page.
- `src/app/api/improve-ai/` — API routes for creating sessions (from report or uploaded DOCX), listing sessions, and completing review.
- `src/components/report/` — Editor UI: `report-workspace.tsx` (header + tabs + sidebar), per-section editors in `sections/`, `report-sidebar.tsx` (AI traffic-light results), `review-rail/` (manager comment margin UI).
- `src/components/improve-ai/` — Improve AI UI: session form, upload button, section content display, stale-rerun dialog.
- `src/components/ui/` — shadcn-style Radix UI primitives.
- `src/db/schema/` — Drizzle schema: `reports`, `reportSections`, `criteriaEvaluations`, `comments`, `workspaceUsers`, `reportSourceDocx` (original .docx as bytea), `mathExtractionCache` (LLM formula cache keyed by image SHA-256), `aiFeedbackSessions`, `aiFeedbackResponses`, `passwordResetTokens`, plus NextAuth tables in `auth.ts`.
- `src/lib/ai/` — AI evaluation pipeline (see subsystem below).
- `src/lib/improve-ai/` — Improve AI business logic: session store, session view, human-judgment tracking, response syncing, staleness detection.
- `src/lib/export/` — DOCX generation (see subsystem below).
- `src/lib/import/` — DOCX parsing (see subsystem below).
- `src/lib/tiptap/` — TipTap editor extensions and utilities: rich text helpers, placeholder highlights, suggestion injection.
- `src/providers/report-provider.tsx` — Centralized client-side state via React Context.
- `src/hooks/` — Auto-save hooks (see subsystem below).
- `src/proxy.ts` — Next.js middleware logic (auth redirects, `mustChangePassword` enforcement). Exported as `proxy` and re-used by the actual `middleware.ts` entry point.

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

NextAuth v5 with Drizzle adapter. Credentials (email/password) and Resend (magic link). Mock users defined in `src/lib/auth/mock-users.ts` (2 engineers, 2 managers). JWT-based sessions with `workspaceUserId`.

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
2. Prompt includes each failing criterion with status and reasoning
3. `generateText()` with Gemini 3.1-pro, temperature 0.4 (variety in phrasing). Schema returns `{ criterionKey, targetField, anchorText, deleteText, insertText, reasoning }`
4. Gating drops suggestions: bad criterion key, bad target field, empty edit, placeholder-only edit, anchor not found, anchor ambiguous (>1 match)
5. `sortedOpenSuggestionsForSection()` orders: red first, then yellow, then criterion order. `activeSuggestionForSection()` returns highest-priority for UI.

**Applying suggestions:**
- Narrative fields: `applyNarrativeSuggestion()` → `injectSuggestionMarks()` adds pending TipTap marks (red strikethrough for delete, green underline for insert) → `acceptSuggestionMarksById()` finalizes
- Plain text fields: `applyStructuredFieldSuggestion()` navigates dot-path, calls `applyPlainTextEdit()` with `locateUniqueSpan()` (fails if 0 or >1 matches)

**Key invariant:** Anchor must be unique in the target text. Whitespace is normalized for matching (multiple spaces/newlines → single space).

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

## Testing

- Vitest config: `vitest.config.ts`, environment `node`, setup file `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`).
- E2E: Playwright with chromium, base URL `http://127.0.0.1:3000`, config in `playwright.config.ts`.
- Test files live alongside source: `*.test.ts` / `*.test.tsx`.

## Style

- Dark theme with MJ Biopharm navy brand color `#2D2A6E`.
- Tailwind CSS v4 configured in `src/app/globals.css`.
- Toast notifications via `sonner`.
- Observability: Langfuse tracing + OpenTelemetry (`src/instrumentation.ts`).
