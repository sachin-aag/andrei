# Andrei

Andrei is a Next.js app for drafting, reviewing, and exporting regulated quality documents. It replaces the Word-over-email loop with an in-browser editor, AI checks against quality criteria, manager review, attachment evidence, and one-click DOCX export.

The same engine ships as three customer packs: **demo** (Andrei branding, investigation reports plus design verification plus a free-form Document), **mj** (M.J. Biopharm SOP/DP/QA/008 overlay), and **convergent** (Convergent Dental branding, design verification only).

**Release notes:** use the project skill **release-notes** (`.agents/skills/release-notes/SKILL.md`) to draft paste-ready markdown for GitHub Releases. Do not paste long release notes here.

---

## What it does

- **In-browser editor** — TipTap sections with 1.5s auto-save and a `sendBeacon` flush on unload.
- **Document types** — investigation reports (DMAIC), design verification, and (demo pack) a free-form Document. Chat, evaluation, suggestions, and editors all go through `src/lib/document-types/`.
- **AI Check** — traffic-light evaluation (`met` / `partially_met` / `not_met`) against type-specific criteria. Gemini via the Vercel AI Gateway or a direct Gemini key.
- **Suggested fixes** — anchored edits and whole-field redrafts. Apply or dismiss from the sidebar, the rich editor, or a plain-text field.
- **Report chat** — per-report assistant that can read sections and search attached PDFs/DOCX.
- **Attachment evidence** — upload, Vertex extract + embed, hybrid retrieval for chat. Production bytes live in GCS.
- **Review workflow** — `draft` → `submitted` → `in_review` → `feedback` (back to the engineer) or `approved`.
- **DOCX export** (and MJ Word import) matching the customer template.
- **Admin** — users, password policy, retention, audit trail, and e-signatures (21 CFR Part 11-style hash chain).

Insights dashboards exist under `/insights` on the **demo** pack (`insightsEnabled`). MJ and Convergent hide the nav item and redirect those routes home. The dashboards are currently backed by mock data.

The workspace **Document library** is a primary sidebar item under Reports (`/library`): upload PDFs and Word files once, then attach them to reports.

---

## Document types

| `documentType` | Noun | Sections |
|----------------|------|----------|
| `investigation_report` | deviation | DMAIC + conclusion + attachments / approvals |
| `design_verification` | design verification | demo: cover page + 10 sections; Convergent pack: 9 Solea DV sections |
| `generic_document` | document | one continuous `body` section (demo pack only; no criteria) |

Which types and sections appear is a **customer pack** decision, not a feature flag.

| Pack | Env | What users see |
|------|-----|----------------|
| `demo` (default) | `ANDREI_CUSTOMER=demo` | Andrei branding, investigation + design verification + Document, conclusion visible |
| `mj` | `ANDREI_CUSTOMER=mj` | MJ branding, SOP/DP/QA/008 criteria and Word template, Word import, investigation only (no conclusion, no design verification) |
| `convergent` | `ANDREI_CUSTOMER=convergent` | Convergent Dental branding, design verification only (9-section Solea DV template) |

Set **both** `ANDREI_CUSTOMER` and `NEXT_PUBLIC_ANDREI_CUSTOMER` to the same value. They must agree with `ANDREI_VERCEL_DEPLOY_SCOPE` when that is set. See [docs/whitelabel-vercel-deploy.md](docs/whitelabel-vercel-deploy.md).

---

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS v4 · Drizzle ORM + Postgres (`pg` driver, Neon or local Docker) · AI SDK v6 (Gemini via Gateway and/or Vertex) · TipTap v3 · NextAuth v5 · `docx` for Word export · pgvector for attachment chunks.

Package manager is **pnpm**. Path alias `@/*` maps to `src/*`.

---

## Local setup

**Prerequisites:** Node.js 20+, [pnpm](https://pnpm.io/) 10, Docker (for local Postgres). Core flows (login, editor, review, export) work without AI keys.

```bash
# 1. Install
pnpm install

# 2. Environment
cp .env.example .env.local
# Required:
#   DATABASE_URL=postgresql://andrei:andrei@localhost:5432/andrei_dev
#   AUTH_SECRET=          # openssl rand -base64 32
# Optional for AI Check / suggestions / chat:
#   AI_GATEWAY_API_KEY=   # or GOOGLE_GENERATIVE_AI_API_KEY
# Optional for PDF/DOCX ingest + embeddings (Vertex only — gateway is not a fallback):
#   GOOGLE_VERTEX_PROJECT=
# Local attachment files (never on Vercel production):
#   ATTACHMENT_STORAGE_BACKEND=local
#   ALLOW_LOCAL_ATTACHMENT_STORAGE=true

# 3. Local Postgres (pgvector/pg16) + schema
pnpm db:local:setup

# 4. First user (creates the workspace row if missing)
pnpm set-workspace-password -- you@example.com 'TempPass123!' --role engineer

# 5. Dev server
pnpm dev
# → http://localhost:3000  →  /login
```

On first login the account is flagged `mustChangePassword`. Use a new password, not the temporary one.

App roles: `engineer` · `manager` · `admin` · `qa`. The password script accepts `--role engineer|manager|admin` (default engineer). MJ convention is `@mjbiopharm.com`; the script does not enforce the domain.

`pnpm db:push` is interactive and fails without a TTY. Use `pnpm db:local:push` in scripts and CI. `pnpm db:ensure-workspace-users` uses the Neon HTTP driver — skip it against local Docker; create users with `pnpm set-workspace-password` instead.

More database options (Neon branches, Vercel preview): [docs/database-environments.md](docs/database-environments.md). Full table list: [docs/database-schema.md](docs/database-schema.md).

### Customer pack locally

Default is **demo**. To exercise another overlay, set both in `.env.local`:

```bash
ANDREI_CUSTOMER=mj
NEXT_PUBLIC_ANDREI_CUSTOMER=mj
# or: ANDREI_CUSTOMER=convergent and NEXT_PUBLIC_ANDREI_CUSTOMER=convergent
```

---

## Workflow

1. **Engineer** signs in → dashboard → new report (deviation or design verification, depending on pack).
2. Edit sections. Auto-save debounces 1.5s; reload to confirm persistence.
3. **Run AI Check** — traffic lights appear in the sidebar. Yellow/red criteria can get suggested fixes; apply or dismiss them.
4. **Submit for review** → status `submitted`.
5. **Manager** opens the queue, comments (first comment → `in_review`), then **Return with Feedback** (`feedback`) or **Approve** (`approved`).
6. Anyone with access can **Export DOCX**. On MJ, Word import is also available.

---

## Environment

Copy `.env.example` and fill `.env.local`. The important ones:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres. Local Docker: `postgresql://andrei:andrei@localhost:5432/andrei_dev`. Runtime always uses the `pg` driver. |
| `AUTH_SECRET` | NextAuth secret. |
| `AUTH_RESEND_KEY` / `AUTH_EMAIL_FROM` | Magic-link and password-reset email. See [docs/email-deliverability.md](docs/email-deliverability.md). |
| `AUTH_URL` | Public origin users actually open. A leftover `*.vercel.app` value after a custom-domain cutover breaks sessions. |
| `AI_GATEWAY_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | AI Check, suggestions, chat. |
| `GOOGLE_VERTEX_PROJECT` | **Required** for PDF/DOCX ingest + embeddings. Pair with WIF on Vercel. |
| `GCS_BUCKET` | Production attachment bytes. |
| `ANDREI_CUSTOMER` / `NEXT_PUBLIC_ANDREI_CUSTOMER` | Customer pack (`demo`, `mj`, or `convergent`). |
| `SITE_ACCESS_PASSWORD` | Optional site-wide gate at `/unlock`. Unset = disabled. |

**Never set `ALLOW_TEST_*` on Vercel.** Playwright injects those locally (`ALLOW_TEST_LOGIN`, skip-eval/suggest, stub ingest/chat, local attachment storage).

---

## Commands

```bash
pnpm dev                 # http://localhost:3000
pnpm build               # production build (`pnpm vercel:build` on Vercel CI)
pnpm lint
pnpm typecheck           # tsc --noEmit (strict)
pnpm test                # Vitest (no watch)
pnpm test:e2e            # Playwright (chromium/firefox/webkit → 127.0.0.1:3000)
pnpm precommit           # lint + typecheck + Vitest (husky; no E2E)

pnpm db:local:up         # start Docker Postgres
pnpm db:local:push       # non-interactive schema push
pnpm db:local:setup      # up + push
pnpm db:migrate          # SQL migrations (what Vercel runs)
pnpm db:generate         # after src/db/schema changes
pnpm db:studio           # Drizzle Studio

pnpm set-workspace-password -- user@example.com 'TempPass123!' --role engineer
pnpm seed-demo-reports   # demo engineer fixtures
```

Full script list: `package.json`. Architecture map: [CLAUDE.md](CLAUDE.md). Operating caveats for agents: [AGENTS.md](AGENTS.md).

---

## Testing

See **[TESTING.md](TESTING.md)** for Vitest, Playwright, test-only env vars, and the catalog of automated and manual cases.

```bash
pnpm test -- src/lib/ai/evaluate.test.ts
pnpm exec playwright test e2e/auth.spec.ts --project=chromium
```

One-time Playwright browsers:

```bash
pnpm exec playwright install --with-deps chromium firefox webkit
```

Local Playwright sets `reuseExistingServer`. Whatever already owns port 3000 is reused **without** Playwright’s stub env. Stop that server, or point `PLAYWRIGHT_BASE_URL` at a process that already has the flags and a matching `AUTH_URL`.

Release-candidate manual cases: [docs/manual-test-cases.md](docs/manual-test-cases.md).

---

## Docs

| Doc | What it covers |
|-----|----------------|
| [CLAUDE.md](CLAUDE.md) | Architecture handbook (eval, suggestions, chat, import/export, audit) |
| [AGENTS.md](AGENTS.md) | Setup and run caveats (do not treat as a second architecture dump) |
| [TESTING.md](TESTING.md) | How to run and catalog tests |
| [docs/database-environments.md](docs/database-environments.md) | Local Docker vs Neon vs CI |
| [docs/database-schema.md](docs/database-schema.md) | Tables and recovery |
| [docs/whitelabel-vercel-deploy.md](docs/whitelabel-vercel-deploy.md) | `andrei-v2` (MJ) vs `andrei-demo` |
| [docs/email-deliverability.md](docs/email-deliverability.md) | Resend / magic-link deliverability |
| [docs/pdf-evidence-deployment-checklist.md](docs/pdf-evidence-deployment-checklist.md) | Attachment ingest release gates |
| [docs/neon-vercel-setup.md](docs/neon-vercel-setup.md) | Neon ↔ Vercel integration |

There is **no** `middleware.ts`. Next.js 16 request interception is `src/proxy.ts`.
