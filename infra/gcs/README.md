# GCS attachments buckets (Terraform)

Provisions **one private PDF evidence bucket per customer pack** (`GCS_BUCKET`):

- Uniform bucket-level access + public access prevention
- CORS for browser resumable uploads (`createResumableUpload` + `Origin`) — per bucket
- Lifecycle delete on `staging/` and `temp/` only (never `reports/`)
- IAM: `roles/storage.objectUser` on each bucket + self `roles/iam.serviceAccountTokenCreator` for signed URLs

WIF trust (`GCP_WIF_AUDIENCE`, OIDC) is **not** managed here — that already exists for Vertex. This stack only grants the runtime SA access to the buckets.

`andrei-493614-retrieval-eval` is CI-only and is **not** in this stack.

## Tenants

| Key | Bucket | Vercel project |
|-----|--------|----------------|
| `shared` | `andrei-493614-attachments` (existing; do not rename) | `andrei-v2`, `andrei-demo`, `andrei-convergent` |
| `3xper` | `andrei-493614-3xper-attachments` | `andrei-3xper` |

A fifth customer is a new `tenants` map entry + `terraform apply` + that project's `GCS_BUCKET`. That is step 6 of [Add a customer](../../docs/whitelabel-vercel-deploy.md#add-a-customer). Do not add their Origin to the shared bucket.

## Prerequisites

```bash
gcloud auth application-default login
gcloud config set project andrei-493614
# ADC / user needs permission to create buckets and set IAM on the Vercel SA
```

## Apply

```bash
cd infra/gcs
cp terraform.tfvars.example terraform.tfvars   # first time only; then edit tenants
terraform init
terraform plan
terraform apply
```

If `terraform.tfvars` still has the old `bucket_name` / `cors_origins` vars, replace them with the `tenants` map from the example. `moved` blocks keep the existing shared bucket in state (no destroy).

Then set Vercel (after linking the **matching** project — never share `GCS_BUCKET` across packs):

```bash
terraform output -json bucket_names
# 3xper:
printf '%s' 'andrei-493614-3xper-attachments' | vercel env add GCS_BUCKET preview
printf '%s' 'andrei-493614-3xper-attachments' | vercel env add GCS_BUCKET production
```

Redeploy that project after adding the env var.

### No local state, bucket already exists

```bash
terraform import 'google_storage_bucket.attachments["shared"]' andrei-493614-attachments
terraform import 'google_storage_bucket_iam_member.runtime_object_user["shared"]' 'andrei-493614-attachments roles/storage.objectUser serviceAccount:andrei-vercel@andrei-493614.iam.gserviceaccount.com'
terraform import google_service_account_iam_member.runtime_token_creator 'projects/andrei-493614/serviceAccounts/andrei-vercel@andrei-493614.iam.gserviceaccount.com roles/iam.serviceAccountTokenCreator serviceAccount:andrei-vercel@andrei-493614.iam.gserviceaccount.com'
```

## Add a customer

The rest of stand-up (Vercel, Neon, auth, shared env, domain) is [Add a customer](../../docs/whitelabel-vercel-deploy.md#add-a-customer). GCS-only steps:

1. Add a key under `tenants` in `terraform.tfvars` (CORS = that pack's public host + `andrei-<name>.vercel.app` + localhost). Omit `bucket_name` unless the bucket already exists.
2. `terraform apply` → bucket `andrei-493614-<key>-attachments`.
3. Project-level `GCS_BUCKET` on that Vercel app (Production + Preview).
4. Redeploy.

## CORS

GCS CORS origins must be **exact** (no `*.vercel.app`). Terraform is the source of truth (`tenants.*.cors_origins`). `cors.json` / `cors-3xper.json` are gsutil snapshots of the same lists:

```bash
gsutil cors set cors.json gs://andrei-493614-attachments
gsutil cors set cors-3xper.json gs://andrei-493614-3xper-attachments
```

When you add a custom domain, add that Origin to **that tenant** and re-apply. Preview URLs the same way.

## State

State is local (`terraform.tfstate`, gitignored). Move to a remote backend before sharing across machines.
