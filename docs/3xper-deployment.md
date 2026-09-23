# 3xper Innoventure — customer deploy

Manual steps to stand up the 3xper pack (`ANDREI_CUSTOMER=3xper`) as a fourth Vercel project on the same git trunk. The engine is unchanged; only pack env, Neon, auth URL, Vertex/GCS, and users are 3xper-specific.

This pack enables **one** document type: Vendor Qualification (`vendor_qualification`, form **QAD-SOP-MS-001-F04** Rev 01). Investigation, DV, QRA, ELR, and generic Document are off.

## What users see

| Surface | 3xper |
|---------|--------|
| Branding | 3xper Innoventure Limited, navy `#0a4e9b`, magenta accent `#ed1c6f`, wordmark from [3xper.com](https://3xper.com/) |
| Create | Vendor Qualification only (VQ number, e.g. `VQ-2026-001`) |
| Workspace | Cover + sections A–N + scoring. Yes/No/N.A. in the editor; chat drafts comments, conclusions, and impurity/CAPA tables |
| Word export | A4, header logo + MASTER COPY, form number `QAD-SOP-MS-001-F04`, Palachur / Naidupeta address, footer Prepared / Reviewed / Approved |
| Insights | Off (`/insights` redirects home) |
| Analytics | On (same worksheet/plots as demo) |
| Word import | Off |
| Unsupported facts | Block (do not persist invented hard facts) |

Header **Document Number** on the form is always `QAD-SOP-MS-001-F04`. The unique Andrei id is `reports.document_no` (the VQ number).

## Pack env

Create a Vercel project (suggested name `andrei-3xper`) watching the same GitHub repo, production branch `main`. **Do not** import `.env.example` as Production secrets — empty `DATABASE_URL` / `AUTH_SECRET` placeholders block the Neon inject and fail `pnpm vercel:build` with `DATABASE_URL is not set`. Connect Neon (Storage → Neon) so it writes Production `DATABASE_URL` (pooled) and Preview injects `preview/<git-branch>`. Then set **Production, Preview, and Development**:

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `3xper` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `3xper` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `3xper` |

They must agree. Client chrome reads the public var. **Do not** put these on the team shared list — a shared `ANDREI_CUSTOMER` would paint every project 3xper.

Suggested public host: `https://3xper.andreihealth.com` (or 3xper’s own domain). Set `AUTH_URL` to that exact origin — do not leave `https://andrei-3xper.vercel.app`.

## Shared env (team) — do this instead of copy-paste

Do **not** re-type Vertex, AI Gateway, Resend, Langfuse, or PostHog onto `andrei-3xper`. Those are team-level [Shared Environment Variables](https://vercel.com/docs/environment-variables/shared-environment-variables) (Pro / Enterprise). One value, linked to `andrei-demo`, `andrei-v2`, `andrei-convergent`, and `andrei-3xper`. Updating the shared row updates every linked project; the next **new** deployment picks it up (live deploys keep the old value).

`vercel env add` is **project-scoped**. Shared vars are created in the team dashboard (or `POST /v1/env` with `teamId`), not by linking the CLI to one project.

### Create / link

1. Team switcher → **Settings** → **Environment Variables**.
2. Add the key, value, type (**Secret** for keys/tokens; **Config** for non-secret), and targets (**Production, Preview, Development** unless a policy forces Production-only Secrets).
3. **Link to Projects**: `andrei-demo`, `andrei-v2`, `andrei-convergent`, `andrei-3xper`. A shared var is inactive until it is linked to at least one project.
4. On an existing project: **Settings** → **Environment Variables** → **Link Shared Environment Variables**, or edit the shared row and add the project.
5. Redeploy each linked project (Redeploy with build cache off, or a new git push). `NEXT_PUBLIC_*` is inlined at build time.

If a **project-level** var already has the same key + environment, it **always overrides** the shared one — including empty secrets imported from `.env.example`. After linking, delete those per-project duplicates (empty `AUTH_RESEND_KEY`, `AI_GATEWAY_API_KEY`, `GCS_BUCKET`, …) or a rotation of the shared row will never reach that project.

Shared vars **cannot** be git-branch-specific. Neon preview `DATABASE_URL` stays a project integration inject, not a shared row.

### Share (link all four projects)

Same GCP project / Resend account / observability as demo. Store as **Secret** unless noted.

| Variable | Notes |
|----------|--------|
| `AUTH_RESEND_KEY` | Same Resend key; password-reset subject is still pack-branded |
| `AUTH_EMAIL_FROM` | Config. Only if every pack sends from this address |
| `AI_GATEWAY_API_KEY` | Or rely on Vercel OIDC and omit the key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Only if you still use a direct Gemini key |
| `GOOGLE_VERTEX_PROJECT` | Vertex ingest + embeddings |
| `GCP_WIF_AUDIENCE` | WIF |
| `GCP_SERVICE_ACCOUNT_EMAIL` | WIF |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` | Skip if unused |
| `NEXT_PUBLIC_POSTHOG_KEY` | Config. Shared PostHog project; pack is in event properties |

### Never share (project-level on `andrei-3xper` only)

| Variable | Why |
|----------|-----|
| `ANDREI_CUSTOMER`, `NEXT_PUBLIC_ANDREI_CUSTOMER`, `ANDREI_VERCEL_DEPLOY_SCOPE` | Pack identity |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | One Neon per customer; Preview is injected per git branch |
| `AUTH_SECRET` | New secret (`openssl rand -base64 32`). Do not reuse MJ/demo |
| `AUTH_URL` | Public origin of **this** host |
| `GCS_BUCKET` | Own bucket (or prefix). Do not point at MJ’s bucket |
| `SITE_ACCESS_PASSWORD` | Optional; only if 3xper should share the same `/unlock` password |

Next customer: create pack + Neon + `AUTH_SECRET` + `AUTH_URL` + `GCS_BUCKET`, then **link** the existing shared rows. Do not copy Vertex/AI/Resend again.

### Unlink vs delete

- **Unlink** — drop one project; the team row stays for the others.
- **Delete** (team Settings) — removes the var from the team **and every linked project**.

## Neon

1. Create a Neon project (suggested name `andrei-3xper`). Postgres 16 + **pgvector**.
2. Copy the **pooled** connection string into Vercel `DATABASE_URL` (Production, no git-branch).
3. Keep **Create a branch for each preview deployment** on, same as demo / MJ / Convergent. Preview injects `preview/<git-branch>` URLs — do not hand-edit those.
4. Run `pnpm db:migrate` against this database (or let `vercel:build` run `tsx scripts/drizzle-migrate.ts`). Fresh Neon has no `workspace_users` table in journaled SQL (`0000`–`0013`); `runPendingMigrations` creates the 0014-era table before `migrate()`. Do not edit `0014_remove_employee_id.sql` (hash would restamp MJ/demo/Convergent). Migration `0065_vendor_qualification_type` adds the `vendor_qualification` enum value.
5. Do **not** run `pnpm db:ensure-workspace-users` against Neon HTTP if you are on local Docker; on Neon TCP use `pnpm set-workspace-password`.

Local pack check:

```bash
ANDREI_CUSTOMER=3xper
NEXT_PUBLIC_ANDREI_CUSTOMER=3xper
DATABASE_URL=postgresql://andrei:andrei@localhost:5432/andrei_dev
```

Then `pnpm db:local:up` and `pnpm db:migrate` (or `pnpm db:local:push`).

## Auth

| Variable | Where | Notes |
|----------|--------|--------|
| `AUTH_SECRET` | Project | New secret (`openssl rand -base64 32`). Do not reuse MJ’s. |
| `AUTH_URL` | Project | Public origin, e.g. `https://3xper.andreihealth.com` |
| `AUTH_RESEND_KEY` | **Shared** | Link the team row; do not paste it again |

Create the first engineer (3xper convention is whatever they use — the script does not enforce `@3xper.com`):

```bash
pnpm set-workspace-password -- qa.lead@3xper.com 'TempPass123!' --role engineer
```

Roles: `engineer | manager | admin | qa`. New accounts get `mustChangePassword`. Add a manager and an admin the same way.

Optional site gate: `SITE_ACCESS_PASSWORD` + `/unlock`. Not enforced by `src/proxy.ts`.

## AI / Vertex / GCS

**Link** the shared Vertex / AI Gateway / Gemini rows (see [Shared env](#shared-env-team--do-this-instead-of-copy-paste)). Gateway key is **not** enough for PDF/DOCX ingest.

Set **on this project only**:

| Variable | Purpose |
|----------|---------|
| `GCS_BUCKET` | Production attachment bytes. New bucket or a 3xper prefix; do not point at MJ’s bucket |

If Vertex WIF is still missing after linking, the shared rows are overridden by empty project-level copies — delete the duplicates. Partial Vertex (`GOOGLE_VERTEX_PROJECT` without WIF) causes `Could not load the default credentials` on Vercel.

Local uploads only: `ATTACHMENT_STORAGE_BACKEND=local` **and** `ALLOW_LOCAL_ATTACHMENT_STORAGE=true` — never on Vercel.

Composer voice is English (`en-US`). The assistant still replies in English.

## Domain / CORS / cookies

1. Add the custom domain on the Vercel project.
2. `AUTH_URL` must match that host (Auth.js cookies).
3. If 3xper embeds or calls the app from another origin, add it to Auth.js trusted hosts — default is the `AUTH_URL` host only.
4. GCS bucket CORS: allow `GET`/`PUT` from the public origin for resumable uploads (copy the demo bucket CORS and swap the origin).

## Feature notes 3xper should confirm

These are encoded as form-master constants until 3xper signs off:

- Footer **Prepared / Reviewed / Approved** names: Anantha Kumar D, Sarat Kumar Y, Narayan Kumar S (from the scanned master). Replace if the controlled copy differs.
- Cover SCM contact defaults (placeholders until filled): Chinamuthevi Phani Raja Kumar, DGM – Supply Chain, Guindy address / `044 4217 7770-5`.
- **Section E** on the 48-page master has more 2.x / 4.x / 5.x sub-questions than the workspace. Leftovers go in that section’s additional narrative.
- Form number `QAD-SOP-MS-001-F04` Rev 01 is not Andrei’s document number.

Rebuild the Word template after header/logo copy changes:

```bash
pnpm build-vq-template
```

## Smoke after first deploy

1. Open `/login` — 3xper wordmark on white, “Vendor qualification, accelerated.”
2. Sign in, change password.
3. Create a Vendor Qualification (`VQ-2026-001`). Workspace opens Cover, not DMAIC.
4. Fill manufacturer + material; export Word. File is A4, form number in the identity table, VQ number in `{documentNo}`, 3xper logo in the header.
5. Upload a PDF to the vault, add it to the report, ask Agent to draft section G from the attachment (needs Vertex).

Do not set `ALLOW_TEST_LOGIN`, `ALLOW_TEST_STUB_CHAT`, or `ALLOW_TEST_STUB_DOCUMENT_INGEST` on this project.
