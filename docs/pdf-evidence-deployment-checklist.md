# PDF Evidence Attachments — Deployment Checklist

Use this before enabling PDF evidence upload in a shared environment.
CI does **not** validate Gemini visual accuracy; run a manual soak on a
representative scan after infrastructure gates pass.

## How extraction picks a mode

Each batch is classified before any model call, and the mode is logged as
`[document-ingest] Extracted pages …`:

- **`text-layer`** — every page in the batch has an embedded text layer
  (born-digital PDFs). The PDF parser produces the transcript, and the model is
  asked only for visual context under a small output budget. Dense tables no
  longer risk output truncation, because the model never transcribes them.
- **`vision`** — at least one page has no usable text layer (scans). Document AI
  Enterprise OCR transcribes first when `DOCUMENT_AI_PROCESSOR_ID` is set
  (`recovery: ocr-document-ai`). Weak or failed OCR pages still go to Gemini
  vision, then rotate/tiles. A batch that still cannot produce a page records a
  **page-gap** placeholder and the rest of the file continues. The attachment
  becomes `ready` with a warning rather than failing the whole file.

## Infrastructure

Bucket + CORS + staging/temp lifecycle + runtime SA IAM are managed by
Terraform in [`infra/gcs`](../infra/gcs/README.md) (`terraform apply` there).

Enterprise OCR processor + `roles/documentai.apiUser` on the Vercel WIF SA are
managed by Terraform in [`infra/document-ai`](../infra/document-ai/README.md).

- [ ] Private GCS bucket with Uniform Bucket-Level Access (UBLA) enabled
- [ ] Prefer an existing project bucket via `GCS_BUCKET` (prefix separation, not a new bucket)
- [ ] Lifecycle rule deletes **only** `staging/` and `temp/` prefixes (not permanent evidence)
- [ ] Exact CORS origins for browser resumable uploads (app production + preview URLs). Custom domains must be listed exactly — `https://mj.andreihealth.com` is in [`infra/gcs/cors.json`](../infra/gcs/cors.json). Apply with `gsutil cors set` or Terraform.
- [ ] WIF trust configured (`GCP_WIF_AUDIENCE`, `GCP_SERVICE_ACCOUNT_EMAIL`) for Vercel OIDC
- [ ] Least-privilege IAM: object create/read on attachment prefixes + `iam.serviceAccounts.signBlob` / Token Creator for signed URLs — avoid blanket `roles/storage.objectAdmin` on shared buckets
- [ ] pgvector available on Neon (and local/CI via `pgvector/pgvector:pg16`)
- [ ] Migrations applied through `0034_audit_canonical_v2` (`pnpm db:migrate` / Vercel build)
- [ ] Vercel Workflow DevKit available in the deployment region; proxy excludes `/.well-known/workflow/*`. If Bot Protection is on, allow that path. Production `AUTH_URL` must be the public host (not a leftover `*.vercel.app`).
- [ ] Preview: document ingest defaults to **inline** (`after()`). Set `DOCUMENT_INGEST_MODE=workflow` only when Vercel World/Queues reliably drain runs. Production defaults to `workflow`, and falls back to inline if workflow `start()` fails.
- [ ] Inline ingest is bounded by the route's `maxDuration` (300s). A run killed by that limit never writes a terminal status, so `reclaimStaleIngests` retires it after 30 minutes and the attachment becomes reprocessable.
- [ ] Document AI OCR processor applied (`cd infra/document-ai && terraform apply`)
- [ ] Runtime SA has `roles/documentai.apiUser`

## Application config

- [ ] `GCS_BUCKET` set in Production and Preview
- [ ] `DOCUMENT_EXTRACT_GOOGLE_MODEL_ID=gemini-3.1-flash-lite`
- [ ] `DOCUMENT_EXTRACT_LOCATION=global` — dedicated var, do **not** reuse `GOOGLE_VERTEX_LOCATION`. Gemini 3.x extract 404s outside `global`.
- [ ] `DOCUMENT_AI_LOCATION=us` (or `eu`) — regional Document AI, **never** `global`
- [ ] `DOCUMENT_AI_PROCESSOR_ID` set in Production and Preview (Terraform output `processor_id`)
- [ ] `DOCUMENT_EMBEDDING_MODEL_ID=gemini-embedding-001` (`GOOGLE_VERTEX_LOCATION=us-central1` is fine for embeddings — separate var from extract, on purpose)
- [ ] Quotas set (`MAX_ATTACHMENT_BYTES`, `MAX_ATTACHMENT_PAGES`, per-report count/bytes)
- [ ] `ATTACHMENT_STORAGE_BACKEND` is **not** `local` in production
- [ ] `ALLOW_LOCAL_ATTACHMENT_STORAGE` unset/false in production
- [ ] `ALLOW_TEST_STUB_DOCUMENT_INGEST` unset/false in production
- [ ] Langfuse: document prompt/response capture redacted or metadata-only
- [ ] Organization-approved malware scanner wired, or `ATTACHMENT_MALWARE_SCAN_REQUIRED=true` only after scanner is real (fail closed)

## Product / compliance gates

- [ ] Attachment mutations only in `draft` / `feedback`
- [ ] Submission blocked while any active attachment is not `ready`
- [ ] Signed content hash includes sorted evidence manifest
- [ ] Soft-delete retains GCS bytes; admin purge drains `storage_outbox`
- [ ] Retention / legal-hold policy documented for evidence PDFs
- [ ] Evaluation ("AI Check") remains report-only (no PDF evidence)

## Manual soak (credentialed)

Use the local soak script (extract only — no DB/GCS; output discarded):

```bash
pnpm soak:pdf-ingest
pnpm soak:ocr-compare
pnpm soak:pdf-ingest -- --batches 3
pnpm soak:pdf-ingest -- --pages 10-15
pnpm soak:pdf-ingest -- --file path/to/scan.pdf
```

Requires `GOOGLE_VERTEX_PROJECT` plus WIF (`GCP_WIF_AUDIENCE`,
`GCP_SERVICE_ACCOUNT_EMAIL`, `VERCEL_OIDC_TOKEN`) or Application Default
Credentials (`gcloud auth application-default login`).

Gated CI: [`.github/workflows/pdf-ingest-soak.yml`](../.github/workflows/pdf-ingest-soak.yml)
(`workflow_dispatch` + nightly). Needs Actions secrets `GOOGLE_VERTEX_PROJECT`
and `GCP_SERVICE_ACCOUNT_KEY`. Not a required PR check.

Deterministic coverage in normal CI (`pnpm test`):

- `src/lib/attachments/pdf-fixture.test.ts` — parse/split the 74-page sample
- `src/lib/attachments/pdf-text-layer.test.ts` — text-layer detection, digital vs scanned
- `src/lib/attachments/extract-batch.test.ts` — mode selection, Document AI OCR,
  salvage, per-page retry, transcript-only escalation, and page-gap placeholders
- `src/lib/attachments/stale-ingest-policy.test.ts` — when a stalled ingest is reclaimed

Record for a representative ~500-page scan (full app ingest, not just extract):

| Metric | Value |
|--------|-------|
| Pages | |
| Wall-clock ingest latency | |
| Extract model / location | gemini-3.1-flash-lite / global |
| Approx input/output tokens | |
| Estimated cost (USD) | |
| Retries / failed batches | |
| Temp object cleanup verified | |
| Citation spot-check (filename + page) | |

Expected cost ballpark: about **$1–$2** extract + **$0.05–$0.20** embed per 500-page document.
