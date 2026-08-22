# GCS attachments bucket (Terraform)

Provisions the private PDF evidence bucket used by `GCS_BUCKET`:

- Uniform bucket-level access + public access prevention
- CORS for browser resumable uploads (`createResumableUpload` + `Origin`)
- Lifecycle delete on `staging/` and `temp/` only (never `reports/`)
- IAM: `roles/storage.objectUser` on the bucket + self `roles/iam.serviceAccountTokenCreator` for signed URLs

WIF trust (`GCP_WIF_AUDIENCE`, OIDC) is **not** managed here — that already exists for Vertex. This stack only grants the runtime SA access to the bucket.

## Prerequisites

```bash
gcloud auth application-default login
gcloud config set project andrei-493614
# ADC / user needs permission to create buckets and set IAM on the Vercel SA
```

## Apply

```bash
cd infra/gcs
cp terraform.tfvars.example terraform.tfvars   # edit CORS origins as needed
terraform init
terraform plan
terraform apply
```

Then set Vercel (after linking the target project):

```bash
BUCKET="$(terraform output -raw bucket_name)"
printf '%s' "$BUCKET" | vercel env add GCS_BUCKET preview
printf '%s' "$BUCKET" | vercel env add GCS_BUCKET production
```

Redeploy the preview after adding the env var.

## Preview CORS

GCS CORS origins must be **exact** (no `*.vercel.app`). Production hosts live
in [`cors.json`](./cors.json) and `terraform.tfvars.example` (`mj.andreihealth.com`,
`demo.andreihealth.com`, `convergent.andreihealth.com`, and the `*.vercel.app` aliases). When you add a custom
domain, add that Origin and re-apply, or set CORS immediately:

```bash
gsutil cors set cors.json gs://andrei-493614-attachments
```

When you open a preview URL, add it to `cors_origins` and re-apply, or
temporarily add the Origin you see in the browser network tab.

## State

State is local (`terraform.tfstate`, gitignored). Move to a remote backend before sharing across machines.
