# AGENTS.md

Cursor reads this file on every chat (also nested copies, if any). Keep it
short and true. Architecture deep-dives live in `CLAUDE.md` (also always-on in
Cursor — if it disagrees with this file or a `.mdc` rule, trust this file /
the rule / the code, then fix `CLAUDE.md`). File-scoped invariants:

This is a single Next.js 16 app (Andrei investigation-report engine with
per-customer packs). Standard commands live in `CLAUDE.md`, `README.md`, and
`package.json` scripts — use those for lint/test/build/run. The notes below
cover only non-obvious, durable setup/run caveats for this environment.

| Rule | When it attaches |
|------|------------------|
| `.cursor/rules/document-types.mdc` | Registry, eval, suggest, report UI |
| `.cursor/rules/chat-and-attachments.mdc` | Chat, retrieval, ingest |
| `.cursor/rules/eval-and-suggestions.mdc` | Criteria eval + suggestions |
| `.cursor/rules/database.mdc` | Drizzle schema + migrations |
| `.cursor/rules/testing.mdc` | Vitest + Playwright |
| `.cursor/rules/proxy-and-auth.mdc` | `proxy.ts`, auth, test login |

## What this app is

Next.js 16 App Router (Turbopack, React 19, Drizzle, TipTap, AI SDK v6).
Pharmaceutical quality documents for M.J. Biopharm and Convergent Dental — **five** `documentType`s (pack-gated):

| `documentType` | Noun | Packs | Sections |
|----------------|------|-------|----------|
| `investigation_report` | deviation | demo, MJ | DMAIC + conclusion + attachments/approvals |
| `design_verification` | design verification | demo, Convergent | demo: cover page + 10 sections; Convergent: 9 Solea DV sections |
| `mechanical_design_verification` | mechanical DV | Convergent | 14-section Solea mechanical DV |
| `quality_risk_assessment` | quality risk assessment | MJ | SOP/DP/QA/010 F02 + F04 (`qra_*` keys) |
| `generic_document` | document | demo | one continuous `body` section (no criteria) |

Chat, eval, suggestions, and editors **must** go through
`src/lib/document-types/`. Do not hardcode DMAIC as if it were the only type.

Package manager is **pnpm**. Path alias `@/*` → `src/*`.

## Read order

1. This file (operating caveats).
2. The matching `.cursor/rules/*.mdc` when you are in those globs.
3. `CLAUDE.md` only when you need a subsystem map (eval, suggestions, DOCX,
   audit, import).
4. The code. Docs that disagree with code lose.

## Commands you will actually run

```bash
pnpm test -- src/lib/ai/chat/tools.test.ts   # single Vitest file
pnpm typecheck
pnpm lint
pnpm precommit                               # lint + typecheck + Vitest (no E2E)
pnpm exec playwright test e2e/report-chat.spec.ts --project=chromium
pnpm db:migrate                              # SQL migrations (what Vercel runs)
pnpm db:local:push                           # force-push to local Docker (non-TTY)
pnpm db:generate                             # after src/db/schema changes
```

Full script list: `package.json` / `CLAUDE.md`. Prefer the narrowest test.

## Hard rules

- **Do not commit** unless asked. **Do not push** unless asked.
- **Do not set `ALLOW_TEST_*` on Vercel.** Playwright injects them locally.
- **Do not use `pnpm db:push`** in a non-TTY. Use `pnpm db:local:push`.
- **Do not add `middleware.ts`.** Next.js 16 interception is `src/proxy.ts`.
- **Do not import `@/lib/ai/chat/prompt-metadata` from `src/lib/attachments/`.**
  Sanitization belongs in chat/tools. Retrieval stays DB-layer.
- **Untrusted PDF/DOCX text** (`documentSummary`, `pageContext`, filenames,
  descriptions) goes through `sanitizePromptMetadata` before any prompt.
- **Bump versions** when prompts change: `PROMPT_VERSION` (eval),
  `SUGGEST_PROMPT_VERSION`, `CHAT_PROMPT_VERSION`.
- New chat tools must be added to the **Plan-mode allowlist** in
  `src/app/api/reports/[reportId]/chat/route.ts` or they are silently missing
  in Plan.
- **PRs:** every PR description needs a collapsed **What's new (plain
  language)** fold for the CEO, a **detailed Summary** (problem → change →
  who it affects, not a title restatement), plus a living **Test plan**
  checklist tagged **CEO** (taste / experience) or **CTO** (technical; CTO
  tests all) (skill: `.agents/skills/pr-human-tester-checklist`). Refresh
  the fold, Summary, and Test plan whenever the PR is created, edited, or
  new commits are pushed to it.

## Database

One env var: `DATABASE_URL`. Matrix: `docs/database-environments.md`.

The app **always** uses `pg` (`src/db/connection.ts`), including Neon TCP.
Neon HTTP cannot `db.transaction()` (ingest + folder moves).

| Target | Typical URL | Apply schema with |
|--------|-------------|-------------------|
| Local Docker | `postgresql://andrei:andrei@localhost:5432/andrei_dev` | `pnpm db:local:up` then `pnpm db:local:push` or `pnpm db:migrate` |
| Neon (this machine often) | pooled `*.neon.tech` in `.env.local` | `pnpm db:migrate` |
| CI | `postgresql://ci:ci@127.0.0.1:5432/ci` | workflow |

### Customer pack

Local default is **demo** (Andrei branding, design verification, conclusion).
Set both to `mj` to exercise the MJ overlay, or both to `convergent` for
Convergent Dental (DV only):

```bash
ANDREI_CUSTOMER=mj
NEXT_PUBLIC_ANDREI_CUSTOMER=mj
```

They must agree with `ANDREI_VERCEL_DEPLOY_SCOPE` when that is set. See
`docs/whitelabel-vercel-deploy.md`. Statistical Analysis (report Analytics tab:
worksheet + Normal Capability Sixpack + measurement scatter + worksheet XY scatter + one-way ANOVA) is on for demo, MJ,
and Convergent (`statisticalAnalysisEnabled`). Analytics chat uses the same
Ask/Agent + Quick/Deep composer as Document chat (Ask searches/extracts only;
Agent fills the worksheet and runs plots when the report is writable).
Worksheet PATCH is version-guarded so an empty autosave cannot overwrite an
assistant write; Agent `write_column` / `manage_worksheet` refresh the grid
mid-turn. Analytics `search_documents` is keyword-first and stops after a cited page —
it does not reuse Document chat's grep-loop copy.
Convergent Document chat does not propose measurement plots; use Analytics
instead.

- `pnpm db:ensure-workspace-users` is Neon HTTP — **skip on local Docker**
  (`127.0.0.1` → `https://api.0.0.1/sql`). Create users with
  `pnpm set-workspace-password` (`pg`).
- pgvector required (`document_chunks.embedding vector(768)`). Docker/CI:
  `pgvector/pgvector:pg16`.
- Chunk keyword search: `to_tsvector('english', contextual_text)` + GIN
  `document_chunks_contextual_text_fts_en_idx`. Index expression must match
  the query byte-for-byte or Postgres ignores it.
- Localhost and Postgres down → `pnpm db:local:up` (Docker). Do not assume a
  native `pg_ctlcluster`.

### Tests

## Auth

```bash
pnpm set-workspace-password -- bhargav.patel@mjbiopharm.com 'TempPass123!' --role engineer
```

Roles: `engineer | manager | admin | qa`. New accounts get `mustChangePassword`.
MJ convention is `@mjbiopharm.com`; the script does not enforce the domain.

`POST /api/test/login` and `POST /api/test/seed-auth-users` need **both**
`ALLOW_TEST_LOGIN=true` **and** `TEST_AUTH_EMAIL`. A 404 usually means the
process serving the request is missing one of them.

`src/proxy.ts` does **not** enforce the site-access gate (`SITE_ACCESS_PASSWORD`
+ `/unlock`).

## AI credentials (not interchangeable)

| Feature | Needs | Local stub (never Vercel) |
|---------|--------|---------------------------|
| AI Check / suggestions / Improve AI | `AI_GATEWAY_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | `ALLOW_TEST_SKIP_EVALUATION`, `ALLOW_TEST_SKIP_SUGGESTIONS` |
| Report chat | Same resolver; Vertex `global` if `GOOGLE_VERTEX_PROJECT` is set | `ALLOW_TEST_STUB_CHAT` |
| PDF/DOCX ingest + embeddings | **Vertex only** (`GOOGLE_VERTEX_PROJECT` + WIF or ADC). Gateway key is not enough | `ALLOW_TEST_STUB_DOCUMENT_INGEST` |

CRUD, editor, review, and DOCX export work without AI keys.

Production attachment bytes: GCS (`GCS_BUCKET` + WIF). Local uploads:
`ATTACHMENT_STORAGE_BACKEND=local` **and** `ALLOW_LOCAL_ATTACHMENT_STORAGE=true`.
Release gates: `docs/pdf-evidence-deployment-checklist.md`.

## Chat + attachments (always-on summary)

- Ready docs (filename + sanitized `documentSummary`) are in the context map.
- Each turn: focused skims may inject `buildAutoEvidence` (≤1.5s, fail-soft).
  Adaptive/comprehensive skip it so the model greps. Gap tools:
  `search_documents` (multi-round grep), `document_outline`, `read_document_page`.
- Hybrid search = vector + English FTS with OR-tokenized `websearch_to_tsquery`.
  The report body is **not** chunk-indexed; use `read_section`.
- Prompt policy is search-then-ask (including DV facts: requirement IDs, ECO/DCR). Do not restore “ask the human first” for batch numbers, dates, results, equipment IDs, or design-input facts. The document index is not citable evidence. Default retrieval is adaptive (complementary search + outline); exhaustive page review is for complete inventories and open-set work products (e.g. drafting a DV report from a multi-page catalog) when evidence is distributed, and drains remaining pages in one continue with parallel extracts. Chat orchestrator is Gemini 3.7 Flash with thinking `medium` until we route it by task (the model rejects `minimal`); page extracts use 3.5 Flash-Lite with `minimal`.
- Stub chat (`buildStubChatModel`) can prove a turn streams; it cannot prove
  tool selection. Spec: `e2e/report-chat.spec.ts`.

## Turbopack 404

A newly-hit API route in `pnpm dev` can return Next’s **HTML 404** on first
compile (auto-save `PATCH` is the usual victim). Restart the dev server;
optionally `rm -rf .next`. Not a code bug.

## Tests

- Vitest: `pnpm test` — mocked env, no DB.
- Playwright: `pnpm test:e2e` — needs `DATABASE_URL`, serves
  `http://127.0.0.1:3000` with stub flags. Catalog: `TESTING.md`.
- Local `reuseExistingServer` is on. Whatever already owns port 3000 is reused
  **without** Playwright’s stub env (landing-page `vercel dev` has bitten this).
  Stop it, or set `PLAYWRIGHT_BASE_URL` to a server that already has the flags
  and matching `AUTH_URL`.
- Single spec: `--project=chromium`. Full suite is three browsers.
