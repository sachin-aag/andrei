# Customer deploys — one trunk, four Vercel projects

One product engine on **`main`**. Customer differences live in `ANDREI_CUSTOMER` packs, not in long-lived SHA pins or a second product branch.

| | MJ production | Customer demo | Convergent Dental | 3xper Innoventure |
|--|---------------|---------------|-------------------|-------------------|
| **Vercel project** | `andrei-v2` | `andrei-demo` | `andrei-convergent` | `andrei-3xper` (create) |
| **Git production branch** | `main` | `main` | `main` | `main` |
| **Pack** | `ANDREI_CUSTOMER=mj` | `ANDREI_CUSTOMER=demo` (or unset) | `ANDREI_CUSTOMER=convergent` | `ANDREI_CUSTOMER=3xper` |
| **URL** | https://mj.andreihealth.com | https://demo.andreihealth.com | https://convergent.andreihealth.com | https://3xper.andreihealth.com (suggested) |
| **Neon project** | `Andrei V2` | `demo` (`bold-field-45608643`) | `andrei-convergent` (`cold-thunder-36255681`) | create (`docs/3xper-deployment.md`) |
| **What users see** | MJ criteria, MJ Word template, Word import, no DV, no conclusion | Andrei branding, DV + conclusion, attachments-only create | Convergent branding, design verification only (9-section Solea DV template) | 3xper branding, vendor qualification only (QAD-SOP-MS-001-F04) |

Release valve: **the same git SHA on all Production deploys**. Pack env chooses MJ vs demo vs Convergent vs 3xper. There is no long-lived product branch.

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

All three Vercel projects watch the same GitHub repo. Every git ref builds on each; pack env on each project picks MJ vs demo vs Convergent. There is no branch allow-list.

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

**Neon preview branching:** keep **Create a branch for each preview deployment** **on** for `andrei-v2`, `andrei-demo`, `andrei-convergent`, and `andrei-3xper`. Each git ref gets `preview/<git-branch>` on that project's Neon. Production stays on the default Neon branch. Enable cleanup when the preview deployment / git branch is removed (`neon-preview-cleanup.yml` plus the integration toggle).

The integration injects **Preview / git-branch** `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (Neon logo, branch name truncated) for that ref only. Those are not pack env. Do not hand-edit them.

- **Keep** the Sensitive `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED`) scoped **Production** (no git-branch) — that is the real production Neon.
- **Ignore** the Neon-logo per-branch rows. Deleting them in Vercel while the integration is connected just recreates them on the next deploy of that branch.
- **28P01 on preview:** the injected password is leftover from a deleted compute. Delete Neon `preview/<git-branch>` and redeploy. Do not turn preview branching off.

## Environment variables

### Shared (team) vs per project

Stop copying Vertex / AI Gateway / Resend / Langfuse / PostHog onto every new Vercel project. Create them once as [Shared Environment Variables](https://vercel.com/docs/environment-variables/shared-environment-variables) (team **Settings** → **Environment Variables**, Pro / Enterprise) and **link** `andrei-demo`, `andrei-v2`, `andrei-convergent`, and `andrei-3xper`. Updating the shared row updates every linked project; redeploy to pick it up.

`vercel env add` only writes to the **linked** project. Shared vars are team-level (dashboard or `POST /v1/env?teamId=`). A project-level var with the same key + environment **overrides** the shared one — delete those duplicates or rotations never land. Shared vars cannot be git-branch-specific (Neon preview URLs stay an integration inject).

**Share:** `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` (if one From address), `AI_GATEWAY_API_KEY` (or OIDC), `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_VERTEX_PROJECT`, `GCP_WIF_AUDIENCE`, `GCP_SERVICE_ACCOUNT_EMAIL`, Langfuse keys, `NEXT_PUBLIC_POSTHOG_KEY`. Use **Secret** for tokens.

**Never share:** pack identity (`ANDREI_CUSTOMER`, `NEXT_PUBLIC_ANDREI_CUSTOMER`, `ANDREI_VERCEL_DEPLOY_SCOPE`), `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `GCS_BUCKET`.

Stand-up for a fifth customer is: pack env + Neon + `AUTH_SECRET` + `AUTH_URL` + `GCS_BUCKET`, then link the existing shared rows. Detail: [docs/3xper-deployment.md](./3xper-deployment.md#shared-env-team--do-this-instead-of-copy-paste).

Never set `ALLOW_TEST_*` or `ATTACHMENT_STORAGE_BACKEND=local` on Vercel Production.

### andrei-demo (Production + Preview)

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `demo` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `demo` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `demo` |
| `DATABASE_URL` | Production: Neon **demo** pooled URL (no git-branch). Preview: Neon injects `preview/<git-branch>` |
| `AUTH_URL` | `https://demo.andreihealth.com` (already set — do not change to `*.vercel.app`) |

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
| `GCS_BUCKET` | Attachment bucket |
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
| `GCS_BUCKET` | Project-level bucket (never `ALLOW_TEST_*`) |

Keep Neon **Create a branch for each preview deployment** on. Convergent `promptVersion` is `convergent-dv-v5`.

### andrei-3xper (Production + Preview)

Stand-up steps (Neon, auth, Vertex/GCS, first user, smoke): **[docs/3xper-deployment.md](./3xper-deployment.md)**.

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `3xper` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `3xper` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `3xper` |
| `DATABASE_URL` | Neon **andrei-3xper** pooled URL (create this project) |
| `AUTH_URL` | Public host (suggested `https://3xper.andreihealth.com`; do not leave `https://andrei-3xper.vercel.app`) |
| Vertex / AI / Resend | **Link** team shared vars — do not paste from `andrei-demo` |
| `GCS_BUCKET` | Project-level; new bucket or prefix (never `ALLOW_TEST_*`) |

Keep Neon **Create a branch for each preview deployment** on. 3xper `promptVersion` is `3xper-vq-f04-v1`.

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
   - PR deploys build **both** `andrei-demo` and `andrei-v2`

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
| PR builds on **neither** Vercel project | Ignored Build Step in the Vercel project, or Git integration disconnected — repo policy is to build every ref on both projects |
| Demo PR creates a Neon branch on MJ | Expected if preview branching is on for **andrei-v2**. That branch is MJ-isolated (`preview/<git-branch>`), not the demo Neon. Do not hand-edit Neon-logo `DATABASE_URL` rows |
| Preview `pnpm vercel:build` fails with `28P01` / `password authentication failed for user 'neondb_owner'` | Stale password for a deleted preview compute (host looks like `ep-…-pooler…neon.tech`). Keep preview branching **on**. Delete Neon `preview/<git-branch>` and leftover `preview/…` for that ref, then redeploy. Do not hand-edit Neon-logo rows |
| MJ looks like Andrei | `NEXT_PUBLIC_ANDREI_CUSTOMER` unset on `andrei-v2` (client defaults to demo) |
| MJ export missing conclusion | Expected — MJ template has no `{@conclusionNarrativeXml}`; pack hides the section |
| Ingest/chat 500 on MJ | Vertex WIF + GCS missing; do not set local attachment flags |
| Attachments fail with "Document ingestion failed" after a custom-domain move | Set Production `AUTH_URL` to the public host (`https://mj.andreihealth.com` / `https://demo.andreihealth.com` / `https://convergent.andreihealth.com` / `https://3xper.andreihealth.com`). Add that Origin to GCS CORS (`infra/gcs/cors.json` + `gsutil cors set`). Confirm Vercel OIDC is on. If Bot Protection is on, allow `/.well-known/workflow/*`. |
| Auto-save / API `401 Unauthorized` on the custom domain | Same `AUTH_URL` mismatch: Auth.js was rewriting requests to the old `*.vercel.app` host so the session cookie missed. Redeploy after setting `AUTH_URL`. |
| `document_no` missing after deploy | Journal was stamped without running 0037. Restore from PITR; do not re-run `db:migrate` until the baseline guard is live |
| AI Check stale on MJ day one | Expected `promptVersion` bump; re-run AI Check |
