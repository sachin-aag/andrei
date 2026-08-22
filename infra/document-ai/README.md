# Document AI Enterprise OCR (Terraform)

Provisions the scan-transcription processor used by `DOCUMENT_AI_PROCESSOR_ID`:

- Enables `documentai.googleapis.com`
- Creates an `OCR_PROCESSOR` (Enterprise Document OCR) in `us` or `eu` — never `global`
- Grants the Vercel WIF runtime SA `roles/documentai.apiUser`

WIF trust (`GCP_WIF_AUDIENCE`, OIDC) is **not** managed here — that already exists for Vertex.

## Prerequisites

```bash
gcloud auth application-default login
gcloud config set project andrei-493614
# ADC / user needs permission to enable APIs, create processors, and set project IAM
```

## Apply

```bash
cd infra/document-ai
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Then set local env (gitignored `.env.local`):

```bash
echo "DOCUMENT_AI_LOCATION=$(terraform output -raw location)" >> ../../.env.local
echo "DOCUMENT_AI_PROCESSOR_ID=$(terraform output -raw processor_id)" >> ../../.env.local
```

And Vercel (after linking the target project):

```bash
LOCATION="$(terraform output -raw location)"
PROCESSOR_ID="$(terraform output -raw processor_id)"
printf '%s' "$LOCATION" | vercel env add DOCUMENT_AI_LOCATION preview
printf '%s' "$PROCESSOR_ID" | vercel env add DOCUMENT_AI_PROCESSOR_ID preview
printf '%s' "$LOCATION" | vercel env add DOCUMENT_AI_LOCATION production
printf '%s' "$PROCESSOR_ID" | vercel env add DOCUMENT_AI_PROCESSOR_ID production
```

Do not reuse `DOCUMENT_EXTRACT_LOCATION=global` for this processor.

## State

State is local (`terraform.tfstate`, gitignored). Move to a remote backend before sharing across machines.
