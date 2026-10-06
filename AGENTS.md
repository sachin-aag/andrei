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
Pharmaceutical quality documents for M.J. Biopharm, Convergent Dental, and 3xper Innoventure — **nine** `documentType`s (pack-gated):

| `documentType` | Noun | Packs | Sections |
|----------------|------|-------|----------|
| `investigation_report` | deviation (MJ: Investigation Report DP) | demo, MJ | DMAIC + conclusion + attachments/approvals |
| `failure_investigation_report` | Investigation Report DS | MJ | SOP/QA/017-F01 (`fir_*` keys); not DMAIC |
| `design_verification` | design verification | demo, Convergent | demo: cover page + 10 sections; Convergent: 9 Solea DV sections |
| `mechanical_design_verification` | mechanical DV | Convergent | 14-section Solea mechanical DV |
| `quality_risk_assessment` | quality risk assessment | MJ | SOP/DP/QA/010 F02 + F04 (`qra_*` keys) |
| `equipment_lifecycle_report` | equipment lifecycle report | MJ | SOP/DP/QA/014 F10 (`elr_*` keys) |
| `generic_document` | document | demo | one continuous `body` section (no criteria) |
| `vendor_qualification` | vendor qualification | 3xper | QAD-SOP-MS-001-F04 Cover + A–N + scoring (`vq_*` keys) |
| `qualification_summary_report` | qualification summary report | 3xper | QAD/016/F06-00 sections 1–7 (`qsr_*` keys) |

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
  `SUGGEST_PROMPT_VERSION`, `CHAT_PROMPT_VERSION`,
  `ANALYTICS_CHAT_PROMPT_VERSION`. Chat suggestions persist `suggestionBase`
  + `suggestionIntent` and merge at apply (`mergeField`); do not restore a
  frozen-diff hash or a `too_large` → `draft_field` funnel. Both chromes
  propose; nothing lands until Apply / Dismiss. Sequential `edit_table`
  `insert_rows` on the same table fold into the open card, including a
  first-row `edit_cells` of the seeded blank row; same-table `insert_rows`
  and scaffold `edit_cells` are serialized (`edit_cells` on other tables
  stay parallel).
  QSR/ELR card, grounding, and
  remaining-section rules live in `.cursor/rules/chat-and-attachments.mdc`
  (and `.cursor/rules/eval-and-suggestions.mdc` for apply/merge).
- New chat tools must be added to the **Plan-mode allowlist** in
  `src/lib/ai/chat/document-review.ts` (`PLAN_MODE_CHAT_TOOL_NAMES`) or they
  are silently missing in Plan. Write tools (`edit_table`, `draft_rtm_table`,
  `draft_field`, `propose_edit`) stay off that list. Internal
  `unsupported_tool` is the exception — keep it out of the allowlist and
  `activeTools`; `repairChatToolCall` remaps a hallucinated name such as
  `edit_table` onto it so `AI_NoSuchToolError` cannot fail the chat. On Agent
  read, that signal unlocks registered write tools on the next step.
  `list_suggestions` is on the Plan allowlist.
- Chat/workspace changes walk the **full spectrum**, not just the control you
  clicked: Document **and** Agent chrome, Report chat **and** Analytics chat,
  then UI → request body → route parser → prompt → tools → Plan allowlist →
  tests → `AGENTS.md` / `CLAUDE.md` / matching `.cursor/rules`. Removing a
  composer control means deleting that plumbing (`body.sectionScope`,
  `parseChat*`, “switch section” tools, mismatch banners). Scope is `@` tags
  (`sectionScopeFromMentions` / analytics mentions), not dropdowns.
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
Set both `ANDREI_CUSTOMER` and `NEXT_PUBLIC_ANDREI_CUSTOMER` to the same
value; they must agree with `ANDREI_VERCEL_DEPLOY_SCOPE` when that is set.
See `docs/whitelabel-vercel-deploy.md` (new pack: [Add a customer](docs/whitelabel-vercel-deploy.md#add-a-customer); 3xper product notes: `docs/3xper-deployment.md`).

```bash
ANDREI_CUSTOMER=mj
NEXT_PUBLIC_ANDREI_CUSTOMER=mj
```

Sidebar is Reports, then Document vault (`/vault`). Insights (`/insights`) and
Templates (`/templates`) are demo-only (`insightsEnabled` /
`documentTemplatesEnabled`). Other packs hide those links and keep a
document-type dropdown for New Report. Report chrome is Document | Agent;
new reports open in Agent. Composer Report | Analytics is independent of the
focused canvas pane. Scope is `@` tags. Analytics is on for every pack
(`statisticalAnalysisEnabled`). Vault, remaining-section, plot, and worksheet
loop details: `.cursor/rules/chat-and-attachments.mdc` and
`.claude/skills/analytics-subsystem`.

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

## Auth

```bash
pnpm set-workspace-password -- bhargav.patel@mjbiopharm.com 'TempPass123!' --role engineer
```

Roles: `engineer | manager | admin | qa`. New accounts get `mustChangePassword`.
MJ convention is `@mjbiopharm.com`; the script does not enforce the domain.

`POST /api/test/login` and `POST /api/test/seed-auth-users` need **both**
`ALLOW_TEST_LOGIN=true` **and** `TEST_AUTH_EMAIL`. A 404 usually means the
process serving the request is missing one of them. The same pair stubs
`sendResetEmail` (token is still written; Resend is skipped) so Playwright
lockout / forgot-password can show the success screen without
`AUTH_RESEND_KEY`.

`src/proxy.ts` does **not** enforce the site-access gate (`SITE_ACCESS_PASSWORD`
+ `/unlock`).

The JWT callback caches `mustChangePassword` / `passwordExpired` for 60s
(`jwtStateCheckedAt`) and `getPasswordPolicy()` is process-cached for 60s.
A token that still requires `/change-password` always refreshes from the DB
so a successful password replace can leave that page. `getCurrentUser()`
returns null when `deactivatedAt` is set or `sessionVersion` on the JWT does
not match `workspace_users.session_version`. Admin deactivate and forced
password reset bump that version so APIs fail closed even while the JWT cache
is still warm. Home-list Open links go straight to `/edit` or `/review`
(`reportWorkspacePath`); `/reports/[id]` still redirects for old bookmarks.

## AI credentials (not interchangeable)

| Feature | Needs | Local stub (never Vercel) |
|---------|--------|---------------------------|
| AI Check / suggestions | `AI_GATEWAY_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | `ALLOW_TEST_SKIP_EVALUATION`, `ALLOW_TEST_SKIP_SUGGESTIONS` |
| Report chat | Same resolver; Vertex `global` if `GOOGLE_VERTEX_PROJECT` is set | `ALLOW_TEST_STUB_CHAT` |
| Composer voice dictation | Same Gemini resolver as chat (Vertex WIF when `GOOGLE_VERTEX_PROJECT` is set). Native-script transcripts; assistant replies in English. Not Cloud Speech-to-Text | `ALLOW_TEST_STUB_SPEECH` |
| PDF/DOCX ingest + embeddings | **Vertex only** (`GOOGLE_VERTEX_PROJECT` + WIF or ADC). Gateway key is not enough | `ALLOW_TEST_STUB_DOCUMENT_INGEST` |

CRUD, editor, review, and DOCX export work without AI keys.

Production attachment bytes: GCS (`GCS_BUCKET` + WIF). Local uploads:
`ATTACHMENT_STORAGE_BACKEND=local` **and** `ALLOW_LOCAL_ATTACHMENT_STORAGE=true`.
Release gates: `docs/pdf-evidence-deployment-checklist.md`.

## Chat + attachments

Always-on summary only. Full policy: `.cursor/rules/chat-and-attachments.mdc`
and `.claude/skills/chat-subsystem`. Grounding incidents replay
`edit_table` / `draft_rtm_table` (`qsr-rtm-draft-replay.test.ts`) and
`pnpm chat-eval -- --replay`.

- Ready docs (filename + sanitized `documentSummary`) are in the context map.
  File-set questions use `list_attachments`; facts *inside* a PDF use
  `search_documents`. Report body is not chunk-indexed — use `read_section`.
  Living plan: `docs/retrieval.md`.
- Search-then-ask. Default retrieval is adaptive. Empty inventory tables need
  a finished matching document review before `edit_table` / `draft_rtm_table`. Hard facts in write
  tools must match a retrieved quote (`groundDraftText`). Every pack uses
  `unsupportedFactPolicy: block`. Prior assistant chat is not a keep-source
  for unsupported facts (an echo of 24.50 m² does not persist). Ask (plan)
  replies rewrite unsourced `[filename, p. N]` on persist and replace
  unsourced hard facts with placeholders (attachment facts need a retrieved
  quote; report/worksheet facts need `read_section` / `read_worksheet` this
  turn). Analytics
  `write_column` is not gated.
- Saved fields use numbered `[n]` markers plus a trailing Citations list.
  Clicking a citation opens the in-app attachment tab (not a browser tab).
- Follow the latest user message. Ask vs Agent is per send. Greetings strip
  tools. Composer scope is `@` tags. Voice is click start / click stop
  (`ALLOW_TEST_STUB_SPEECH`). Stub chat cannot prove tool selection
  (`e2e/report-chat.spec.ts`).
- A QSR RTM family-column cell persists as `{section} – {audit line}`
  from the protocol body page that prints that heading — not a
  cover/contents `Section 8` cite, and not a reused number-only `12.1`.
  Family workers keep grepping until each row has that audit line (or
  NA); persist attaches an audit line to leftover `12.1` only when that
  same section number is on the ledger (it does not swap `12.1` onto
  `12.4`). Integer `1600` matches OCR `1600.0`.
  Repair search pins to cited files. Word-form Table 4 is SOPs; Tables
  5–10 use `draft_rtm_table` when that table is in `@` scope (every
  reviewed URS ID, then DQ/IQ/OQ/PQ in parallel). `edit_table` is the
  single-cell correction path. URS-34 / 34a / 34b are
  lettered Instrument Requirement subparts in 5.2, not a column-major
  ID run. Gold: `qsr-rtm-draft-replay.test.ts`, page-9 fixture, and
  `scripts/eval/chat-draft-cases.json`.

## Turbopack 404

A newly-hit API route in `pnpm dev` can return Next’s **HTML 404** on first
compile (auto-save `PATCH` is the usual victim). Restart the dev server;
optionally `rm -rf .next`. Not a code bug.

## Tests

- Vitest: `pnpm test` — mocked env, no DB. Colocate `*.test.ts(x)` next to
  source. When a module is renamed, split, or deleted, rename/split/delete
  the test file. Assert the current contract. Do not keep tombstone
  `not.toContain("old dropdown")` tests, and do not pin prompt wording with
  long `toContain` lists — composition and replay tests own that. Grep the
  old symbol in `*.test.*` and `e2e/` before calling a removal done.
  Production grounding incidents: `qsr-rtm-draft-replay.test.ts` and
  `pnpm chat-eval -- --replay` (`scripts/eval/chat-draft-cases.json`).
  Optional Langfuse dataset `chat-draft-quality-floor` via `--sync` /
  `--experiment`. Playwright stub chat cannot assert tools.
- Playwright: `pnpm test:e2e` — needs `DATABASE_URL`, serves
  `http://127.0.0.1:3000` with stub flags. Catalog: `TESTING.md`.
- Local `reuseExistingServer` is on. Whatever already owns port 3000 is reused
  **without** Playwright’s stub env (landing-page `vercel dev` has bitten this).
  Stop it, or set `PLAYWRIGHT_BASE_URL` to a server that already has the flags
  and matching `AUTH_URL`.
- Single spec: `--project=chromium`. Full suite is three browsers.
