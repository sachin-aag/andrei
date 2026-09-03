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
 `SUGGEST_PROMPT_VERSION`, `CHAT_PROMPT_VERSION`,
 `ANALYTICS_CHAT_PROMPT_VERSION`. Chat suggestions persist `suggestionBase`
 + `suggestionIntent` and merge at apply (`mergeField`); do not restore a
 frozen-diff hash or a `too_large` → `draft_field` funnel. Same-turn
 `propose_edit` cards in Document chrome fold when locatable spans sit
 within 20 characters (no per-field card budget).
- New chat tools must be added to the **Plan-mode allowlist** in
  `src/lib/ai/chat/document-review.ts` (`PLAN_MODE_CHAT_TOOL_NAMES`) or they
  are silently missing in Plan.
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
Set both to `mj` to exercise the MJ overlay, or both to `convergent` for
Convergent Dental (DV only):

```bash
ANDREI_CUSTOMER=mj
NEXT_PUBLIC_ANDREI_CUSTOMER=mj
```

They must agree with `ANDREI_VERCEL_DEPLOY_SCOPE` when that is set. See
`docs/whitelabel-vercel-deploy.md`. Report workspace chrome is Document | Agent.
New reports open in Agent; returning to a report restores that user's last
chrome for it. Report | Analytics in the composer is independent of the focused canvas pane in both Document and Agent chrome (locked while a turn is running). Mixed Report + Analytics turns can share a thread; each message is tagged Report or Analytics (`chat_messages.metadata.chatTarget`, stamped by the route). Report and Analytics are pinned canvas tabs; attachments and History compare open closable tabs. History is on Report and Analytics (pane-scoped compare). Report compare diffs prose, every table, and added/removed figures; Analytics compare is a cell/plot list. Worksheet versions are `analyticsRevisions`, not `documentRevisions`. Comments lives on the tab strip in Document chrome on the Report tab only (not in Agent).
Statistical Analysis lives on the work-product **Analytics** pane (worksheet + Normal Capability Sixpack + measurement scatter + worksheet XY scatter + Tukey boxplot + one-way ANOVA) and is on for demo, MJ,
and Convergent (`statisticalAnalysisEnabled`). Analytics chat uses the same
shared `ChatPanel` as Document chat (Ask/Agent + Quick/Deep; Ask
searches/extracts only; Agent fills the worksheet and runs plots when the
report is writable). `@` tags set scope (sections in Document chat; sheets,
plots, and files in Analytics; Document chat can also tag saved plots) — there is no section/sheet dropdown.
Scatters: worksheet Plot → Plot measurements (`plot_xy_scatter`) has required
numeric Y, optional X (omit = vs observation index), optional
`legendColumnId` to color-code by a grouping column (labels/lots/serials
are OK for legend, not for X), and a Chart type (scatter, line, line +
markers, area, column). Column charts stack when a legend is on. **Advanced**
(collapsed) sets min/max X and Y (blank = auto) and optional axis titles.
Those display limits are not part of `sourceHash`. Agent
Analytics chat can create a plot or edit an existing worksheet plot
(`analysisId` from Results or an `@` tag): replace Y/X, set or clear the
legend, change chart type, toggle Show LSL/USL, Show mean line, or set the axis window. Ask mode cannot. New plots default to scatter with
spec lines off. **Show LSL, USL values** under Y is off by default (no spec
lines until checked or the assistant turns them on). **Show mean line** is
off by default (not in `sourceHash`): on a scatter it connects mean Y at
each X (gray individuals when there is no legend; one line per legend
series); on a boxplot it connects each box’s mean (the median line inside
the box stays). Columns written from a
file (`write_column` after extract/scan/read) keep page citations on the
column and chart spec for CSV download. Plot figures do not show `p. N`.
Editing a cell drops that citation. Attachment extract-and-plot is Analytics chat
only (`plot_measurements`, or extract → `write_column` → `plot_xy_scatter`).
There is no Plot-from-attachments menu. Do not substitute sixpack/ANOVA
for a scatter, boxplot, or histogram.
Plot → Histogram (`plot_histogram`) is the same frequency chart as the
sixpack histogram (bars plus optional overall/within normal curves and
LSL/USL lines). LSL/USL are optional. Overlay checkboxes
`showDistributionLines`, `showLsl`, and `showUsl` default on; a spec line
draws only when the value is set and the checkbox is on. Overlay flags
are display-only (`sourceHash` is column + row selection). Agent Analytics
chat can create a histogram or edit an existing one with `analysisId`.
Ask mode cannot.
Plot → Boxplot (`plot_boxplot`) is a Tukey box-and-whisker of numeric Y.
Optional category columns (innermost first, closest to the boxes; last is
the outermost nested axis label) group observed combinations only — not a
full factorial. Zero categories is one box of all Y. Empty category cells
are labeled `(blank)`. Agent Analytics chat can create a boxplot or edit
an existing one with `analysisId` (including `showMeanLine`). Ask mode cannot. Time series is not
supported.
Worksheet PATCH is version-guarded so an empty autosave cannot overwrite an
assistant write; Agent `write_column` / `manage_worksheet` run one at a time
per report and re-apply onto the latest sheet on 409 (parallel column dumps
must not wipe each other). The grid ignores older snapshots and coalesces
mid-turn reloads so extraction does not flash empty. New extract columns
claim empty C1–C8 from the left (`write_column`
and `add_column` without `at`) instead of appending on the right. Pass
`sheetId` on `write_column` when the destination is not the engineer's
focused tab (agent writes do not steal focus; `add_sheet` reuses a
same-named tab). Report and
Analytics chat have no per-turn tool-step cap (Cancel and the 270s server
abort still apply). Do not tell the engineer they ran out of steps or to
re-prompt. Loop guards live in `prepareStep` (including `tableSchemaReadStep`
on write turns whose in-scope section already has a table, and Analytics
hiding `write_column` after a cited-page grep until a page is read, while
any file still has extract `morePages` or scan `truncated` (a finished
extract of file B does not unlock a partial write of file A), after a
refused incomplete dump until another page read, and after two consecutive
empty dumps, and hiding `manage_worksheet` after the first structure call).
One complete `write_column` per destination sheet — separate extracts per
sheet are correct; always pass `sheetId`. `write_column` `mode append` adds
rows onto an existing named column. `delete_row` accepts `rowEnd` for a
range. Agent Analytics plans multi-table dumps and calls `extract_sheet`
once per sheet in the same step (parallel workers create or reuse the tab
and write; the grid stays on the engineer's current tab). Add or remove
rows on an already-filled sheet with `extract_sheet` `mode edit` (worker
appends or deletes; it does not replace the whole table unless asked). Live matrix
headers come from the section (`read_section` / context map) — demo
Traceability is not Convergent Results. Analytics `search_documents` is keyword-first and stops after a cited page —
it does not reuse Document chat's grep-loop copy. TOC / running-header snippets that only list many requirement IDs are ranked last (`requirementIndex`) and a TOC-only grep retries excluding those pages; `ask_user` is hidden until a cited page is actually read/scanned.
Document chat copies a saved Analytics plot with `insert_image` (`source=analytics`)
and can propose attachment `plot_measurements` figures on every pack.

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
process serving the request is missing one of them.

`src/proxy.ts` does **not** enforce the site-access gate (`SITE_ACCESS_PASSWORD`
+ `/unlock`).

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

## Chat + attachments (always-on summary)

- Ready docs (filename + sanitized `documentSummary`) are in the context map.
- Each turn: focused skims may inject `buildAutoEvidence` (≤1.5s, fail-soft).
  Adaptive/comprehensive skip it so the model greps. Gap tools:
  `search_documents` (multi-round grep), `document_outline`, `read_document_page`.
- Hybrid search = vector + English FTS with OR-tokenized `websearch_to_tsquery`.
  The report body is **not** chunk-indexed; use `read_section`.
- Prompt policy is search-then-ask (including DV facts: requirement IDs, ECO/DCR). Do not restore “ask the human first” for batch numbers, dates, results, equipment IDs, or design-input facts. The document index is not citable evidence. Default retrieval is adaptive (complementary search + outline); exhaustive page review is for complete inventories and open-set work products (e.g. drafting a DV report from a multi-page catalog) when evidence is distributed, and drains remaining pages in one continue with parallel extracts. A sentence/paragraph rewrite is adaptive even on a large catalog, and an earlier “draft the report” turn must not force another full page walk. Comprehensive shape and inventory-section escalation score the latest user turn only. Shared `searchLoopDirective` hides `search_documents` after a cited hit, locate/read, or two empty greps (not during an active document review). Finished review coverage is rehydrated when the attachment coverage key is unchanged so a zero delta does not force another walk, except explicit pushback (“you missed SST”, “look again”, “re-check”) which skips rehydrate so a second pass can start. `finish_document_review` returns a capped findings sample; follow-up turns keep a slim `citationDigest` of `[filename, p. N]` plus a short summary (not the full findings array) so a 273-page review cannot 500 the next message. Chat orchestrator is Gemini 3.7 Flash with thinking `medium` until we route it by task (the model rejects `minimal`); page extracts use 3.5 Flash-Lite with `minimal`.
- Follow the latest user message. Agent mode may edit when they asked to write; empty sections and ready attachments are not a request to draft. A greeting (“hi”) must not search or write — `classifyChatUserIntent` strips tools (Document and Analytics). Ambiguous Agent-mode text (“plan the first 3 sections”) is classified by a gated Flash-Lite call (`resolveChatUserIntent`); greetings and explicit draft/write verbs stay on rules. Retrieval maps those turns to focused (`no_task`) and skips kickoff evidence. A confirmation that carries its own instruction (“yes put it in the data worksheet”) is a **write**: the affirmation prefix is stripped and the remainder classified, and an Analytics worksheet/sheet/column destination counts as a write even when the verb is not in `WRITE_RE`. When intent strips the write tools, the prompt says so (`intentToolAvailabilityRule`) so the model cannot call a tool that is no longer loaded and fall back to pasting a markdown table.
- Composer scope is `@` tags (`sectionScopeFromMentions` / analytics mentions),
  not dropdowns. Document and Analytics share `ChatPanel`; a composer or tool
  change must land on both surfaces and both chromes (Hard rules spectrum).
  Empty-state Document chips are `chat.examplePrompts` on the document type
  (not DMAIC-hardcoded). Analytics chips stay worksheet/plot copy.
  Voice dictation is the shared mic (right of the image icon): click to start,
  click to stop. PCM is buffered while recording (bigger wave + “Transcript
  appears when you stop”); one Vertex Gemini transcribe (Flash-Lite) runs after
  stop and fills the composer. No live interim text, no SSE. MJ transcribes English/Hindi/Marathi
  in native script (Devanagari preferred); other packs are English. The LLM
  still replies in English. Stub: `ALLOW_TEST_STUB_SPEECH`
  (`e2e/report-chat.spec.ts`).
- Stub chat (`buildStubChatModel`) can prove a turn streams; it cannot prove
  tool selection. Spec: `e2e/report-chat.spec.ts`.

## Turbopack 404

A newly-hit API route in `pnpm dev` can return Next’s **HTML 404** on first
compile (auto-save `PATCH` is the usual victim). Restart the dev server;
optionally `rm -rf .next`. Not a code bug.

## Tests

- Vitest: `pnpm test` — mocked env, no DB. Colocate `*.test.ts(x)` next to
  source. When a module is renamed, split, or deleted, rename/split/delete
  its test file — do not leave `section-scope.test.ts` after `section-scope.ts`
  is gone, and do not keep tombstone `not.toContain("old dropdown")` tests.
  Grep the old symbol in `*.test.*` and `e2e/` before calling a removal done.
- Playwright: `pnpm test:e2e` — needs `DATABASE_URL`, serves
  `http://127.0.0.1:3000` with stub flags. Catalog: `TESTING.md`.
- Local `reuseExistingServer` is on. Whatever already owns port 3000 is reused
  **without** Playwright’s stub env (landing-page `vercel dev` has bitten this).
  Stop it, or set `PLAYWRIGHT_BASE_URL` to a server that already has the flags
  and matching `AUTH_URL`.
- Single spec: `--project=chromium`. Full suite is three browsers.
