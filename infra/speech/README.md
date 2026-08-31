# Speech-to-Text v2 (Terraform)

Enables Cloud Speech-to-Text for composer voice dictation. Each `POST /api/reports/[id]/chat/transcribe` with LINEAR16 PCM is one Chirp 3 recognize in that request (Vercel Fluid does not pin POSTs to one isolate):

- Enables `speech.googleapis.com`
- Grants the Vercel WIF runtime SA `roles/speech.client`

The app calls Speech-to-Text v2 **Chirp 3** over **HTTPS REST**
(`POST https://speech.googleapis.com/v2/projects/{project}/locations/global/recognizers/_:recognize`).
Do not use the `@google-cloud/speech` gRPC client on Vercel Fluid. Hindi and Marathi stay in native script (Devanagari). Do not enable Translation API for this path — assistant English replies are a chat prompt rule, not STT translation.

WIF trust (`GCP_WIF_AUDIENCE`, OIDC) is **not** managed here — that already exists for Vertex.

## Prerequisites

```bash
gcloud auth application-default login
gcloud config set project andrei-493614
# ADC / user needs permission to enable APIs and set project IAM
```

## Apply

```bash
cd infra/speech
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

No extra Vercel env vars. Dictation reuses `GOOGLE_VERTEX_PROJECT` plus WIF (`GCP_WIF_AUDIENCE`, `GCP_SERVICE_ACCOUNT_EMAIL`).

Local/E2E stub: `ALLOW_TEST_STUB_SPEECH=true` (never on Vercel production or preview).

## State

State is local (`terraform.tfstate`, gitignored). Move to a remote backend before sharing across machines.
