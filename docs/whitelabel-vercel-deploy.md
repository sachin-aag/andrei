# Customer deploys — one trunk, two Vercel projects

One product engine on **`main`**. Customer differences live in `ANDREI_CUSTOMER` packs, not in long-lived SHA pins or a second product branch.

| | MJ production | Customer demo |
|--|---------------|---------------|
| **Vercel project** | `andrei-v2` | `andrei-demo` |
| **Git production branch** | `main` | `main` |
| **Pack** | `ANDREI_CUSTOMER=mj` | `ANDREI_CUSTOMER=demo` (or unset) |
| **URL** | https://mj.andreihealth.com | https://demo.andreihealth.com |
| **Neon project** | `Andrei V2` | `demo` (`bold-field-45608643`) |
| **What users see** | MJ criteria, MJ Word template, Word import, no DV, no conclusion | Andrei branding, DV + conclusion, attachments-only create |

Release valve: **the same git SHA on both Production deploys.** After cutover, promote one commit to `andrei-v2` and `andrei-demo`.

Both Production deploys track **`main`**. Pack env chooses MJ vs demo. There is no second product branch.

## Pack vs flags vs pins

| Mechanism | Job | Use now? |
|-----------|-----|----------|
| Customer pack (`ANDREI_CUSTOMER`) | Permanent identity: template, criteria, prompts, branding, enabled types and sections | Yes |
| Same SHA on both deploys | One binary to debug | Yes — policy |
| Feature flags | Temporary holdback of an unfinished engine feature | No (at two pilots a flag is a second source of truth) |
| Pin MJ on an older SHA | Demo leads for days or weeks | No, as policy |
| Roll back one project | Last deploy is bad | Yes, incident only, then catch up |

Set **both** `ANDREI_CUSTOMER` and `NEXT_PUBLIC_ANDREI_CUSTOMER` to the same value. They must agree with `ANDREI_VERCEL_DEPLOY_SCOPE`. Client chrome (login, create dialog, list filters) reads the public var.

## Deploy scope

Both Vercel projects watch the same GitHub repo. Every git ref builds on both; pack env on each project picks MJ vs demo. There is no branch allow-list.

| Git ref | Both projects |
|---------|----------------|
| `main` | **build** (production — each project's Production Branch setting) |
| any other branch | **build** (preview) |

Set on **each** project → Settings → Environment Variables → Production, Preview, and Development (pack identity, not branch routing):

| Vercel project | Variable | Value |
|----------------|----------|--------|
| **andrei-demo** | `ANDREI_VERCEL_DEPLOY_SCOPE` | `demo` |
| **andrei-v2** | `ANDREI_VERCEL_DEPLOY_SCOPE` | `mj` |

**andrei-v2 Neon:** keep **Create a branch for each preview deployment** off. If Preview `DATABASE_URL` is the Production row, those previews share MJ production data — use a dedicated Preview URL if you need isolation.

Preview `DATABASE_URL` on `andrei-demo` stays the **demo** Neon pooled URL (same as Production). Do not enable per-PR Neon branching on `andrei-v2`.

The Neon ↔ Vercel integration creates extra **Preview / git-branch** `DATABASE_URL` and `DATABASE_URL_UNPOOLED` rows (Neon logo, branch name truncated). Those are auto-injected for that git branch’s preview only. They are not pack env. Do not hand-edit them.

- **Keep** the Sensitive `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED`) scoped **Production and Preview** (or Production) with no git-branch — that is the real demo Neon.
- **Ignore** the Neon-logo per-branch rows while preview branching is on. Deleting them in Vercel while the integration is connected just recreates them on the next deploy of that branch.
- To stop the sprawl on **andrei-demo**: Neon/Vercel integration → disable **Create a branch for each preview deployment**, then delete leftover preview branches in the Neon **demo** project. After that, every preview uses the shared demo `DATABASE_URL`.
- If you see the same per-branch rows on **andrei-v2**, turn preview branching off there immediately. Those would be MJ Neon preview databases.

## Environment variables

### Both projects

Copy auth/AI keys as today. Never set `ALLOW_TEST_*` or `ATTACHMENT_STORAGE_BACKEND=local` on Vercel Production.

### andrei-demo (Production + Preview)

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `demo` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `demo` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `demo` |
| `DATABASE_URL` | Neon **demo** pooled URL (the Production / Production+Preview row — not the per-git-branch Neon copies) |
| `AUTH_URL` | `https://demo.andreihealth.com` (already set — do not change to `*.vercel.app`) |

### andrei-v2 (Production) — MJ cutover

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `mj` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `mj` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `mj` |
| `DATABASE_URL` | Neon **Andrei V2** production |
| `GOOGLE_VERTEX_PROJECT` | Vertex project (chat/ingest) |
| `GCP_WIF_AUDIENCE` | WIF audience |
| `GCP_SERVICE_ACCOUNT_EMAIL` | WIF service account |
| `GCS_BUCKET` | Attachment bucket |
| `AUTH_URL` | `https://mj.andreihealth.com` (must match the public host; do not leave `https://andrei-v2.vercel.app`) |

Partial Vertex config (`GOOGLE_VERTEX_PROJECT` without WIF) causes `Could not load the default credentials` on Vercel. Local-only attachment flags must never be set here or ingest 500s.

MJ `promptVersion` is `mj-sop-dp-qa-008-v1`. Existing evaluations go stale on cutover — tell MJ they need a re-run.

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

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| PR builds on **neither** Vercel project | Ignored Build Step in the Vercel project, or Git integration disconnected — repo policy is to build every ref on both projects |
| Demo PR creates a Neon branch on MJ | Neon preview branching is on for **andrei-v2**. Turn it off; do not hand-edit the Neon-logo `DATABASE_URL` rows |
| MJ looks like Andrei | `NEXT_PUBLIC_ANDREI_CUSTOMER` unset on `andrei-v2` (client defaults to demo) |
| MJ export missing conclusion | Expected — MJ template has no `{@conclusionNarrativeXml}`; pack hides the section |
| Ingest/chat 500 on MJ | Vertex WIF + GCS missing; do not set local attachment flags |
| Attachments fail with "Document ingestion failed" after a custom-domain move | Set Production `AUTH_URL` to the public host (`https://mj.andreihealth.com`). Add that Origin to GCS CORS (`infra/gcs/cors.json` + `gsutil cors set`). Confirm Vercel OIDC is on. If Bot Protection is on, allow `/.well-known/workflow/*`. |
| Auto-save / API `401 Unauthorized` on the custom domain | Same `AUTH_URL` mismatch: Auth.js was rewriting requests to the old `*.vercel.app` host so the session cookie missed. Redeploy after this SHA (production pin) and set `AUTH_URL`. |
| `document_no` missing after deploy | Journal was stamped without running 0037. Restore from PITR; do not re-run `db:migrate` until the baseline guard is live |
| AI Check stale on MJ day one | Expected `promptVersion` bump; re-run AI Check |
