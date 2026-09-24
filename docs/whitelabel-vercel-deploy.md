# Customer deploys — one trunk

One product engine on **`main`**. Customer differences live in `ANDREI_CUSTOMER` packs, not in long-lived SHA pins or a second product branch.

**Future stand-up:** follow [Add a customer](#add-a-customer). Do not copy a prior pack’s markdown file. Pack-only notes stay next to the pack (today: [3xper](./3xper-deployment.md)).

| | MJ | Demo | Convergent | 3xper |
|--|----|------|------------|-------|
| **Vercel** | `andrei-v2` | `andrei-demo` | `andrei-convergent` | `andrei-3xper` |
| **Git production branch** | `main` | `main` | `main` | `main` |
| **Pack** | `mj` | `demo` | `convergent` | `3xper` |
| **URL** | https://mj.andreihealth.com | https://demo.andreihealth.com | https://convergent.andreihealth.com | https://3xper.andreihealth.com |
| **Neon** | `Andrei V2` | `demo` (`bold-field-45608643`) | `andrei-convergent` (`cold-thunder-36255681`) | `andrei-3xper` (`dark-salad-24878113`) |
| **GCS_BUCKET** | `andrei-493614-attachments` (shared) | same shared bucket | same shared bucket | `andrei-493614-3xper-attachments` |
| **What users see** | MJ criteria, MJ Word template, Word import, QRA + ELR, no DV, no conclusion | Andrei branding, investigation + DV + Document, Templates gallery | Convergent branding, Solea DV only | 3xper branding, vendor qualification only |

Release valve: **the same git SHA on all Production deploys**. Pack env chooses the overlay. There is no long-lived product branch.

New packs get their **own** Neon and **own** GCS bucket (`infra/gcs` tenant). MJ / demo / Convergent still share `andrei-493614-attachments` (legacy). `andrei-493614-retrieval-eval` is CI-only — not a customer bucket.

## Pack vs flags vs pins

| Mechanism | Job | Use now? |
|-----------|-----|----------|
| Customer pack (`ANDREI_CUSTOMER`) | Permanent identity: template, criteria, prompts, branding, enabled types and sections | Yes |
| Same SHA on all deploys | One binary to debug | Yes |
| Feature flags | Temporary holdback of an unfinished engine feature | No (a flag is a second source of truth) |
| Pin MJ on an older SHA | Demo leads for days or weeks | No, as policy |
| Roll back one project | Last deploy is bad | Yes, incident only, then catch up |

Set **both** `ANDREI_CUSTOMER` and `NEXT_PUBLIC_ANDREI_CUSTOMER` to the same value. They must agree with `ANDREI_VERCEL_DEPLOY_SCOPE`. Client chrome (login, create dialog, list filters) reads the public var.

## Deploy scope

Every customer Vercel project watches the same GitHub repo. Every git ref builds on each; pack env on each project picks the overlay. There is no branch allow-list.

| Git ref | All projects |
|---------|----------------|
| `main` | **build** (production — each project's Production Branch is `main`) |
| any other branch | **build** (preview) |

Set on **each** project → Settings → Environment Variables → Production, Preview, and Development (pack identity, not branch routing):

| Vercel project | Variable | Value |
|----------------|----------|--------|
| **andrei-demo** | `ANDREI_VERCEL_DEPLOY_SCOPE` | `demo` |
| **andrei-v2** | `ANDREI_VERCEL_DEPLOY_SCOPE` | `mj` |
| **andrei-convergent** | `ANDREI_VERCEL_DEPLOY_SCOPE` | `convergent` |
| **andrei-3xper** | `ANDREI_VERCEL_DEPLOY_SCOPE` | `3xper` |

**Neon preview branching:** keep **Create a branch for each preview deployment** **on** for every customer project. Each git ref gets `preview/<git-branch>` on that project's Neon. Production stays on the default Neon branch. Enable cleanup when the preview deployment / git branch is removed (`neon-preview-cleanup.yml` plus the integration toggle). Add a GitHub Actions variable `NEON_PROJECT_ID_<SLUG>` and a matching matrix row when you add a pack.

The integration injects **Preview / git-branch** `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (Neon logo, branch name truncated) for that ref only. Those are not pack env. Do not hand-edit them.

- **Keep** the Sensitive `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED`) scoped **Production** (no git-branch) — that is the real production Neon.
- **Ignore** the Neon-logo per-branch rows. Deleting them in Vercel while the integration is connected just recreates them on the next deploy of that branch.
- **28P01 on preview:** the injected password is leftover from a deleted compute. Delete Neon `preview/<git-branch>` and redeploy. Do not turn preview branching off.

## Environment variables

### Shared (team) vs per project

Stop copying Vertex / AI Gateway / Resend / Langfuse / PostHog onto every new Vercel project. Create them once as [Shared Environment Variables](https://vercel.com/docs/environment-variables/shared-environment-variables) (team **Settings** → **Environment Variables**, Pro / Enterprise) and **link** every customer project. Updating the shared row updates every linked project; the next **new** deployment picks it up (live deploys keep the old value).

`vercel env add` only writes to the **linked** project. Shared vars are team-level (dashboard or `POST /v1/env?teamId=`). A project-level var with the same key + environment **overrides** the shared one — including empty secrets imported from `.env.example`. Delete those duplicates or a rotation never lands. Shared vars cannot be git-branch-specific (Neon preview URLs stay an integration inject).

**Share:** `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` (if one From address), `AI_GATEWAY_API_KEY` (or OIDC), `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_VERTEX_PROJECT`, `GCP_WIF_AUDIENCE`, `GCP_SERVICE_ACCOUNT_EMAIL`, Langfuse keys, `NEXT_PUBLIC_POSTHOG_KEY`. Use **Secret** for tokens.

**Never share:** pack identity (`ANDREI_CUSTOMER`, `NEXT_PUBLIC_ANDREI_CUSTOMER`, `ANDREI_VERCEL_DEPLOY_SCOPE`), `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `GCS_BUCKET`.

**Unlink vs delete:** Unlink drops one project; the team row stays. Delete (team Settings) removes the var from the team **and every linked project**.

Never set `ALLOW_TEST_*` or `ATTACHMENT_STORAGE_BACKEND=local` on Vercel.

## Add a customer

Use this checklist for every new pack. Substitute `{slug}` (`3xper`, `acme`, …). Do not clone [3xper-deployment.md](./3xper-deployment.md) — that file is VQ/product notes only.

Assume the pack already exists in `src/lib/customers/` and `ANDREI_VERCEL_DEPLOY_SCOPE` accepts `{slug}`.

| Piece | Value |
|-------|--------|
| Vercel project | `andrei-{slug}` |
| Pack env | `{slug}` (`ANDREI_CUSTOMER`, `NEXT_PUBLIC_ANDREI_CUSTOMER`, `ANDREI_VERCEL_DEPLOY_SCOPE`) |
| Public host | `https://{slug}.andreihealth.com` (or the customer’s domain) |
| Neon | Postgres 16 + pgvector, project `andrei-{slug}` |
| GCS bucket | `andrei-493614-{slug}-attachments` |

### 1. Vercel project

1. New project on the same GitHub repo. Production branch **`main`**. Ignored Build Step off (every ref builds).
2. **Do not** import `.env.example` as Production secrets — empty `DATABASE_URL` / `AUTH_SECRET` / `GCS_BUCKET` placeholders block Neon inject, override shared Vertex rows, and fail `pnpm vercel:build` with `DATABASE_URL is not set`.

### 2. Pack identity (project-level)

Production, Preview, and Development — all three, same value. **Not** on the team shared list.

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `{slug}` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `{slug}` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `{slug}` |

Client chrome reads the public var. A shared `ANDREI_CUSTOMER` would paint every project this pack.

### 3. Neon

1. Create a Neon project (Postgres 16 + **pgvector**). Connect it (Vercel **Storage → Neon**) so Production `DATABASE_URL` is the **pooled** URL (no git-branch) and Preview injects `preview/<git-branch>`.
2. Keep **Create a branch for each preview deployment** **on**. Do not hand-edit Neon-logo Preview rows.
3. `pnpm vercel:build` runs `runPendingMigrations` (creates `workspace_users` on a fresh DB, then journal SQL one file at a time). Do **not** edit old journal files to “fix” a new customer. Do **not** run `pnpm db:ensure-workspace-users` against Neon HTTP from local Docker.
4. GitHub **Settings → Secrets and variables → Actions**: add variable `NEON_PROJECT_ID_{SLUG}` (Neon project id). Add a matrix row with that var to `.github/workflows/neon-preview-cleanup.yml` and `neon-preview-stale-cleanup.yml` (copy the `3xper` row). Unset vars are skipped.

### 4. Auth

| Variable | Where | Notes |
|----------|--------|--------|
| `AUTH_SECRET` | Project | New `openssl rand -base64 32`. Do not reuse another pack. |
| `AUTH_URL` | Project | Exact public origin (`https://{slug}.andreihealth.com`). Do **not** leave `https://andrei-{slug}.vercel.app`. |
| `AUTH_RESEND_KEY` | **Shared** | Link the team row. |

Optional `SITE_ACCESS_PASSWORD` is project-level (only if this pack should have `/unlock`). Not enforced by `src/proxy.ts`.

### 5. Link shared env

Team **Settings → Environment Variables** → link the existing Vertex / AI Gateway / Gemini / Resend / Langfuse / PostHog rows to `andrei-{slug}`. Do not paste values from `andrei-demo`. Redeploy after linking. `NEXT_PUBLIC_*` is inlined at build time.

If Vertex is still missing, a project-level empty duplicate is overriding the shared row — delete it. Partial Vertex (`GOOGLE_VERTEX_PROJECT` without WIF) causes `Could not load the default credentials`.

### 6. GCS bucket (Terraform tenant)

One private attachments bucket per new pack. Do **not** point `GCS_BUCKET` at `andrei-493614-attachments`. Do **not** add this pack’s Origin to the shared bucket. Retrieval-eval is unchanged.

In `infra/gcs/terraform.tfvars` (see [`terraform.tfvars.example`](../infra/gcs/terraform.tfvars.example) and [`infra/gcs/README.md`](../infra/gcs/README.md)):

```hcl
"{slug}" = {
  cors_origins = [
    "https://{slug}.andreihealth.com",
    "https://andrei-{slug}.vercel.app",
    "http://localhost:3000",
  ]
}
```

```bash
cd infra/gcs
gcloud auth application-default login
terraform plan    # create {slug} bucket + IAM; do not destroy `shared`
terraform apply
```

Set **project-level** Production and Preview:

```bash
printf '%s' "andrei-493614-{slug}-attachments" | vercel env add GCS_BUCKET preview
printf '%s' "andrei-493614-{slug}-attachments" | vercel env add GCS_BUCKET production
```

GCS CORS is exact origins (no `*.vercel.app`). Terraform is the source of truth. Changing `bucket_name` on `shared` would replace the live MJ/demo/Convergent bucket — never do that.

### 7. Domain

1. Vercel project → add `{slug}.andreihealth.com`.
2. DNS **CNAME** to `cname.vercel-dns.com` (not `*.vercel.app`).
3. `AUTH_URL` must match that host after it is live; redeploy.
4. If the pack embeds from another origin, add it to Auth.js trusted hosts (default is the `AUTH_URL` host only).

### 8. First users

```bash
DATABASE_URL='postgresql://…this neon…?sslmode=require' \
  pnpm set-workspace-password -- user@customer.com 'TempPass123!' --role engineer
```

Roles: `engineer | manager | admin | qa`. New accounts get `mustChangePassword`. Temporary passwords stay out of git.

### 9. Smoke

1. `/login` shows this pack’s chrome (not Andrei/MJ).
2. Sign in, change password.
3. Create the pack’s document type; export Word if the pack has a template.
4. Upload a PDF to the vault, add it to a report, ask Agent to draft from it (needs Vertex + this `GCS_BUCKET`).
5. Confirm Production deploy SHA matches the other packs.

### 10. Do not

- Set `ALLOW_TEST_LOGIN`, `ALLOW_TEST_STUB_CHAT`, `ALLOW_TEST_STUB_DOCUMENT_INGEST`, or any other `ALLOW_TEST_*` on this project.
- Set `ATTACHMENT_STORAGE_BACKEND=local` or `ALLOW_LOCAL_ATTACHMENT_STORAGE` on Vercel.
- Share `AUTH_SECRET`, `DATABASE_URL`, or `GCS_BUCKET` with another pack.

### andrei-demo (Production + Preview)

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `demo` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `demo` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `demo` |
| `DATABASE_URL` | Production: Neon **demo** pooled URL (no git-branch). Preview: Neon injects `preview/<git-branch>` |
| `AUTH_URL` | `https://demo.andreihealth.com` (already set — do not change to `*.vercel.app`) |
| `GCS_BUCKET` | `andrei-493614-attachments` (legacy shared with MJ + Convergent) |

### andrei-v2 (Production) — MJ cutover

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `mj` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `mj` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `mj` |
| `DATABASE_URL` | Production: Neon **Andrei V2** default branch. Preview: Neon injects `preview/<git-branch>` |
| `GOOGLE_VERTEX_PROJECT` | Vertex project (chat/ingest) |
| `GCP_WIF_AUDIENCE` | WIF audience |
| `GCP_SERVICE_ACCOUNT_EMAIL` | WIF service account |
| `GCS_BUCKET` | `andrei-493614-attachments` (legacy shared with demo + Convergent) |
| `AUTH_URL` | `https://mj.andreihealth.com` (must match the public host; do not leave `https://andrei-v2.vercel.app`) |

Partial Vertex config (`GOOGLE_VERTEX_PROJECT` without WIF) causes `Could not load the default credentials` on Vercel. Local-only attachment flags must never be set here or ingest 500s.

MJ `promptVersion` is `mj-sop-dp-qa-008-v2`. Existing evaluations go stale on cutover — tell MJ they need a re-run.

### andrei-convergent (Production + Preview)

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `convergent` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `convergent` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `convergent` |
| `DATABASE_URL` | Neon **andrei-convergent** pooled URL |
| `AUTH_URL` | `https://convergent.andreihealth.com` (must match the public host; do not leave `https://andrei-convergent.vercel.app`) |
| Vertex / AI / Resend | **Link** team shared vars (do not paste from `andrei-demo`) |
| `GCS_BUCKET` | `andrei-493614-attachments` (legacy shared; never `ALLOW_TEST_*`) |

Keep Neon **Create a branch for each preview deployment** on. Convergent `promptVersion` is `convergent-dv-v5`.

### andrei-3xper (Production + Preview)

Stood up with [Add a customer](#add-a-customer) (`slug=3xper`). Pack/product notes: [3xper-deployment.md](./3xper-deployment.md). `promptVersion` is `3xper-vq-f04-v1`.

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `3xper` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `3xper` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `3xper` |
| `DATABASE_URL` | Neon **andrei-3xper** pooled URL |
| `AUTH_URL` | `https://3xper.andreihealth.com` (do not leave `https://andrei-3xper.vercel.app`) |
| Vertex / AI / Resend | **Link** team shared vars |
| `GCS_BUCKET` | `andrei-493614-3xper-attachments` (`infra/gcs` tenant `3xper`) |

## MJ database cutover

MJ Neon is **8 SQL files behind** the trunk: `0030_conclusion_section` through `0037_document_types`. **`0037` is destructive** (no down migration):

- copies `deviation_no` → `document_no`, then `DROP COLUMN deviation_no`
- folds `tools_used` / `other_tools` into `metadata`, then drops those columns
- `DROP TYPE section_type` after converting five `section` columns to `text`
- unique index `(author_id, document_type, document_no)`

MJ was historically **push-managed**, so `drizzle.__drizzle_migrations` may be empty or not match the 30 files on disk.

`ensurePushBaseline()` used to stamp **every** journal tag when `reports` existed and the journal was empty. That would mark 0030–0037 applied **without running SQL**. The migrator now leaves tags numbered 0030+ unstamped when `reports.document_no` is missing so `migrate()` can apply 0031–0037. `0030_conclusion_section.sql` is not in `_journal.json`; on that path it is applied as extra SQL (ADD VALUE) and recorded with a `created_at` between 0029 and 0031.

Read-only preflight: `scripts/mj-cutover-preflight.sql`.

### Gated sequence

1. Read `drizzle.__drizzle_migrations` on MJ production; reconcile against `src/db/migrations/meta/_journal.json`. `0030_conclusion_section.sql` is on disk but not in the journal (applied via `EXTRA_MIGRATION_TAGS` on already-current DBs). MJ does not need the `conclusion` enum value; 0037 converts `section` to text and drops the enum.
2. Preflight:

   ```sql
   SELECT author_id, deviation_no, count(*)
   FROM reports
   GROUP BY 1, 2
   HAVING count(*) > 1;
   ```

   Any row fails the new unique index mid-migration. Stop. Same query lives in `scripts/mj-cutover-preflight.sql`.
3. Create a **Neon branch** from MJ production. Run 0030–0037 there (or deploy this SHA at `ANDREI_CUSTOMER=mj` against the branch `DATABASE_URL`). Open a real MJ report, export Word, confirm nothing lost.

   Point `.env` `DATABASE_URL` at the **rehearsal** pooled URL, then:

   ```bash
   pnpm db:migrate -- --prod
   ```

   Confirm the printed `PROD → …` host is the rehearsal branch (`ep-shiny-flower…` or similar), not production. On Neon Free, if migrate `ETIMEDOUT` on `connect …:5432`, run `SELECT 1` in the SQL Editor on that branch and retry immediately. A log line `applying unrecorded 0000_third_nighthawk` on MJ is a migrator bug — pull a SHA that stamps 0000–0029 instead of replaying them.
4. Note the **PITR window** in the Neon console before the production run. Rollback is a Neon restore, not a down migration. Typical retain is 7 days on paid plans — confirm in the project.
5. Only then run against MJ production. Set pack + Vertex/GCS env **before** pointing users at the new SHA, or ingest and chat evidence 500.

### Local rehearsal (this environment)

No MJ production `DATABASE_URL` or `NEON_API_KEY` was available here. Rehearsal used a local clone of the **origin/main** schema (`andrei_mj_rehearsal`) with two copied reports (`DEV-2026-001`, `DEV-2026-002`):

- Preflight duplicates: empty
- Existing unique `(author_id, deviation_no)` already rejects a duplicate insert
- SQL files 0030–0037 all applied
- `document_no` copied; `metadata.toolsUsed` preserved; DMAIC section JSON intact; `section_type` enum dropped

Log: `/opt/cursor/artifacts/mj-migration-rehearsal.log` (CI/agent artifact; not in git).

## Cutover order

L1–L3 are already on `feat/whitelabel` (#123–#125). This change is the ignore-script rewrite and MJ migrate guard.

1. Merge the guards into `feat/whitelabel` so andrei-demo (still tracking that branch) builds `main` as a demo line before the flip.
2. Set pack env on `andrei-demo` (`demo`) and pack + Vertex/GCS env on `andrei-v2` (`mj`) if unset.
3. Rehearse 0030–0037 on a Neon branch of MJ production; record PITR.
4. Merge `feat/whitelabel` (with this guard) to `main`. That deploy **is** the MJ cutover (`andrei-v2` already tracks `main`).
5. Run the migration on MJ production if `vercel:build` did not (only after this baseline guard is live).
6. Repoint `andrei-demo` Production branch tracking to `main`.
7. Confirm the **same SHA** on both Production deploys. Verify:

   - Demo: DV + conclusion, Andrei chrome, no Word-body field on create
   - MJ: no DV, no conclusion tab, MJ login/shell, Word import on create, evidence PDFs from the report Documents tab, export opens the MJ template
   - PR deploys build **both** `andrei-demo` and `andrei-v2` (today: every customer project)

## Neon `demo` project

| Field | Value |
|-------|--------|
| Console | https://console.neon.tech/app/projects/bold-field-45608643 |
| Database | `neondb` |
| Default branch | `production` |

Connection strings: Neon Console → **demo** → **Connect**. Do not commit passwords.

Connect the **demo** Neon project to **andrei-demo** only. Do not reuse the Andrei V2 integration for the demo app.

## Seed / refresh demo data

```bash
DATABASE_URL='postgresql://…demo…?sslmode=require' pnpm seed-demo-reports
```

Password for seeded users: **`DemoPass123!`**. See previous seed table in git history if you need the email list.

### Convergent accounts

Create / reset logins on the **andrei-convergent** Neon (not demo, not MJ):

```bash
DATABASE_URL='postgresql://…convergent…?sslmode=require' \
  pnpm set-workspace-password -- sachin@andreihealth.com 'TempPass123!' --role engineer
```

Same emails as demo (`sachin@` / `aditya@` plus `+manager` / `+admin`). Temporary passwords are not committed — generate them at seed time and share out of band. First login forces a password change.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| PR builds on **no** customer Vercel project | Ignored Build Step in the Vercel project, or Git integration disconnected — every ref should build on every customer project |
| Demo PR creates a Neon branch on MJ | Expected if preview branching is on for **andrei-v2**. That branch is MJ-isolated (`preview/<git-branch>`), not the demo Neon. Do not hand-edit Neon-logo `DATABASE_URL` rows |
| Preview `pnpm vercel:build` fails with `28P01` / `password authentication failed for user 'neondb_owner'` | Stale password for a deleted preview compute (host looks like `ep-…-pooler…neon.tech`). Keep preview branching **on**. Delete Neon `preview/<git-branch>` and leftover `preview/…` for that ref, then redeploy. Do not hand-edit Neon-logo rows |
| MJ looks like Andrei | `NEXT_PUBLIC_ANDREI_CUSTOMER` unset on `andrei-v2` (client defaults to demo) |
| MJ export missing conclusion | Expected — MJ template has no `{@conclusionNarrativeXml}`; pack hides the section |
| Ingest/chat 500 on MJ | Vertex WIF + GCS missing; do not set local attachment flags |
| Attachments fail with "Document ingestion failed" after a custom-domain move | Set Production `AUTH_URL` to the public host (`https://mj.andreihealth.com` / `https://demo.andreihealth.com` / `https://convergent.andreihealth.com` / `https://3xper.andreihealth.com`). Add that Origin to **that pack’s** GCS bucket CORS (`infra/gcs` `tenants` + `terraform apply`). Confirm Vercel OIDC is on. If Bot Protection is on, allow `/.well-known/workflow/*`. |
| Auto-save / API `401 Unauthorized` on the custom domain | Same `AUTH_URL` mismatch: Auth.js was rewriting requests to the old `*.vercel.app` host so the session cookie missed. Redeploy after setting `AUTH_URL`. |
| `document_no` missing after deploy | Journal was stamped without running 0037. Restore from PITR; do not re-run `db:migrate` until the baseline guard is live |
| AI Check stale on MJ day one | Expected `promptVersion` bump; re-run AI Check |
