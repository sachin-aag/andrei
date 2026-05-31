# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

M.J. Biopharm Investigation Report Tool — a Next.js 16 app replacing manual DOCX-over-email workflows for pharmaceutical deviation investigation reports (SOP/DP/QA/008). Features an in-browser DMAIC editor with auto-save, AI traffic-light evaluation (Gemini via Vercel AI Gateway), manager review workflow with comments, and DOCX export matching the original template.

## Commands

```bash
pnpm install              # install dependencies
pnpm dev                  # dev server at http://localhost:3000
pnpm build                # production build
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
```

## Architecture

**Tech stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS v4, Drizzle ORM + Neon Postgres, AI SDK v6 with Gemini, TipTap v3 rich text editor, `docx` library for DOCX generation.

**Path alias:** `@/*` maps to `src/*`.

### Key directories

- `src/app/api/reports/[reportId]/` — Route handlers for report CRUD, section auto-save, AI evaluation, comments, submit/approve/feedback workflow, and DOCX export.
- `src/components/report/` — Editor UI: `report-workspace.tsx` (header + tabs + sidebar), per-section editors in `sections/`, `traffic-light-sidebar.tsx` (AI results), `comments-panel.tsx`.
- `src/components/ui/` — shadcn-style Radix UI primitives.
- `src/db/schema/` — Drizzle schema: `reports`, `report_sections`, `criteria_evaluations`, `comments`, `workspace_users`, plus NextAuth tables in `auth.ts`.
- `src/lib/ai/` — AI evaluation pipeline: `criteria.ts` (36 static criteria across 5 DMAIC sections), `evaluate.ts` (generateObject with Gemini), `suggest.ts`, `section-prompts.ts`.
- `src/lib/export/` — DOCX generation matching `reference-template.docx`. 20+ helper files for sections, tables, signatures, footers.
- `src/lib/import/` — DOCX parsing with mammoth/PizZip/docxtemplater. Rich content extraction (subscript, superscript, colors, images, math).
- `src/lib/tiptap/` — TipTap editor extensions and utilities (19 files): rich text helpers, placeholder highlights, suggestion injection.
- `src/providers/report-provider.tsx` — Centralized client-side state via React Context.
- `src/hooks/` — `use-auto-save.ts` (1.5s debounce + sendBeacon flush), `use-section-save.ts`.

### Data flow

1. TipTap editor → section content (JSONB in `report_sections`)
2. Auto-save debounces 1.5s → `PATCH /api/reports/[id]/sections/[sectionType]`
3. AI evaluation → `POST /api/reports/[id]/evaluate` → upserts `criteria_evaluations`
4. Manager review → submit/comment/approve/feedback status transitions
5. DOCX export → `GET /api/reports/[id]/export`

### Report statuses

`draft` → `submitted` → `in_review` → `feedback` (back to engineer) or `approved`

### Auth

NextAuth v5 with Drizzle adapter. Credentials (email/password) and Resend (magic link). Mock users defined in `src/lib/auth/mock-users.ts` (2 engineers, 2 managers). JWT-based sessions with `workspaceUserId`.

### Section types

Define, Measure, Analyze, Improve, Control (DMAIC). Content types in `src/types/sections.ts`.

## Testing

- Vitest config: `vitest.config.ts`, environment `node`, setup file `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`).
- E2E: Playwright with chromium, base URL `http://127.0.0.1:3000`, config in `playwright.config.ts`.
- Test files live alongside source: `*.test.ts` / `*.test.tsx`.

## Style

- Dark theme with MJ Biopharm navy brand color `#2D2A6E`.
- Tailwind CSS v4 configured in `src/app/globals.css`.
- Toast notifications via `sonner`.
- Observability: Langfuse tracing + OpenTelemetry (`src/instrumentation.ts`).
