# Ami Lifesciences — stand-up checklist

Pilot pack for [Ami Lifesciences Pvt. Ltd.](https://www.amilifesciences.com/) (API, Vadodara). Infra is **[Add a customer](./whitelabel-vercel-deploy.md#add-a-customer)** with `slug=ami`. The pack already exists in `src/lib/customers/` — this file is only the dashboard / DNS / secrets work that cannot land from a PR.

| Piece | Value |
|-------|--------|
| Vercel project | `andrei-ami` |
| Pack env | `ami` (`ANDREI_CUSTOMER`, `NEXT_PUBLIC_ANDREI_CUSTOMER`, `ANDREI_VERCEL_DEPLOY_SCOPE`) |
| Public host / `AUTH_URL` | `https://ami.andreihealth.com` |
| Neon | `andrei-ami` (`wispy-bonus-55749532`) |
| `GCS_BUCKET` | `andrei-493614-ami-attachments` |
| `promptVersion` | `ami-investigation-v1` |
| Document type | Investigation Report only (`investigation_report`, DMAIC, no conclusion) |

Word export is the MJ investigation form with Ami chrome (`templates/ami-investigation-report-template.docx`, rebuilt with `pnpm build-ami-investigation-template`). Criteria are the shared investigation set — not MJ SOP/DP/QA/008. Insights and the Templates gallery stay off. Analytics is on.

## What is already in git

Do **not** redo these in the dashboard:

- Pack id `ami` in `src/lib/customers/`
- Ami branding, logos (`public/logo-ami*.png` from [amilifesciences.com](https://www.amilifesciences.com/images/logo.png))
- Investigation-only enablement + Word import
- GCS tenant entry in `infra/gcs/terraform.tfvars.example`

## Manual steps

### 1. Vercel project

1. Vercel → **Add New** → **Project** on the same GitHub repo as `andrei-demo`. Name it `andrei-ami`.
2. Production branch **`main`**. Ignored Build Step **off** (every git ref must build).
3. **Do not** import `.env.example` as Production secrets.

### 2. Pack identity (project-level, not team-shared)

Production, Preview, and Development — all three, same value:

| Variable | Value |
|----------|--------|
| `ANDREI_CUSTOMER` | `ami` |
| `NEXT_PUBLIC_ANDREI_CUSTOMER` | `ami` |
| `ANDREI_VERCEL_DEPLOY_SCOPE` | `ami` |

### 3. Neon

1. Neon Console → **New project**: name `andrei-ami`, **Postgres 16**, enable **pgvector**.
2. Vercel project → **Storage → Neon** → connect this project. Production `DATABASE_URL` must be the **pooled** URL with **no** git-branch. Keep **Create a branch for each preview deployment** **on**.
3. Do not hand-edit Neon-logo Preview rows.

### 3b. Paste the Neon project id (code follow-up)

The project id is already in `CUSTOMER_NEON_PREVIEW_PROJECTS`. If you recreate the Neon project, copy the new id from the Neon URL (`console.neon.tech/app/projects/{id}`) and:

1. Add this row to `CUSTOMER_NEON_PREVIEW_PROJECTS` in `src/lib/db/neon-preview-projects.ts`:

   ```ts
   {
     label: "ami",
     id: "wispy-bonus-55749532",
     envVar: "NEON_PROJECT_ID_AMI",
   },
   ```

2. Update the exact-list assertions in `src/lib/db/neon-preview-projects.test.ts`.
3. Optionally set GitHub Actions variable `NEON_PROJECT_ID_AMI` (override only — cleanup must not depend on it).

Do **not** invent an id. Preview-branch cleanup skips Ami until this lands.

### 4. Auth (project-level)

| Variable | Notes |
|----------|--------|
| `AUTH_SECRET` | `openssl rand -base64 32` — **new**, do not copy MJ/demo/3xper |
| `AUTH_URL` | `https://ami.andreihealth.com` (set after the domain is live; do **not** leave `https://andrei-ami.vercel.app`) |

`AUTH_RESEND_KEY` / `AUTH_EMAIL_FROM` are **team shared** — link them in step 5. Optional `SITE_ACCESS_PASSWORD` only if this pilot should sit behind `/unlock`.

### 5. Link shared env

Team **Settings → Environment Variables** → link the existing Vertex / AI Gateway / Gemini / Resend / Langfuse / PostHog rows to `andrei-ami`. Do not paste values from `andrei-demo`. Redeploy after linking.

If Vertex 500s with `Could not load the default credentials`, a project-level empty duplicate is overriding the shared row — delete it.

### 6. GCS bucket

`infra/gcs/terraform.tfvars.example` already has the `ami` tenant. On a machine with ADC:

```bash
cd infra/gcs
cp terraform.tfvars.example terraform.tfvars   # first time only; then merge the ami key
gcloud auth application-default login
gcloud config set project andrei-493614
terraform plan    # create ami bucket + IAM; do not destroy shared
terraform apply
```

Then, with the Vercel CLI linked to **andrei-ami**:

```bash
printf '%s' "andrei-493614-ami-attachments" | vercel env add GCS_BUCKET preview
printf '%s' "andrei-493614-ami-attachments" | vercel env add GCS_BUCKET production
```

Do **not** point Ami at `andrei-493614-attachments`.

### 7. Domain

1. Vercel project `andrei-ami` → add `ami.andreihealth.com`.
2. DNS **CNAME** `ami` → `cname.vercel-dns.com` (not `*.vercel.app`).
3. Set Production `AUTH_URL` to `https://ami.andreihealth.com` and redeploy.

### 8. First users

Against **this** Neon (not MJ, not demo):

```bash
DATABASE_URL='postgresql://…andrei-ami…?sslmode=require' \
  pnpm set-workspace-password -- user@amilifesciences.com 'TempPass123!' --role engineer
```

Roles: `engineer | manager | admin | qa`. New accounts get `mustChangePassword`. Keep temporary passwords out of git. Domain is a convention — the script does not enforce `@amilifesciences.com`.

Seed at least one engineer, one manager, and one Andrei admin (`sachin@andreihealth.com` / `aditya@andreihealth.com`) the same way.

### 9. Smoke

1. `https://ami.andreihealth.com/login` shows Ami chrome (orange, Ami wordmark — not Andrei/MJ).
2. Sign in, change password.
3. Create an Investigation Report (the only type). Confirm there is no design verification / QRA / ELR / Document option.
4. Export Word — header is Ami Lifesciences / Vadodara, DMAIC body, no conclusion section.
5. Optional: upload an existing DMAIC investigation `.docx` on create (Word import is on).
6. Upload a PDF to the vault, add it to the report, ask Agent to draft from it (needs Vertex + this `GCS_BUCKET`).
7. Confirm the Production deploy SHA matches the other packs.

### 10. Do not

- Set `ALLOW_TEST_LOGIN`, `ALLOW_TEST_STUB_CHAT`, `ALLOW_TEST_STUB_DOCUMENT_INGEST`, or any other `ALLOW_TEST_*` on this project.
- Set `ATTACHMENT_STORAGE_BACKEND=local` or `ALLOW_LOCAL_ATTACHMENT_STORAGE` on Vercel.
- Share `AUTH_SECRET`, `DATABASE_URL`, or `GCS_BUCKET` with another pack.

## Local overlay check

```bash
ANDREI_CUSTOMER=ami
NEXT_PUBLIC_ANDREI_CUSTOMER=ami
```

in `.env.local`, then `pnpm db:local:up` and `pnpm dev`. Create one investigation report and export Word.

Rebuild the Word chrome after header/logo copy changes:

```bash
pnpm build-ami-investigation-template
```

## Follow-ups with Ami (not blockers)

These are encoded as generic until Ami signs off:

- Real investigation SOP / form number for the Word header and footer (today: `Investigation SOP`, MJ `SOP/DP/QA/008/F04-R02` stripped).
- Site / unit label (today: `Unit: API`).
- Gujarati / Hindi voice dictation if QA wants it (today: `en-US` only).
- Additional document types (they asked for investigation only on this pilot).
