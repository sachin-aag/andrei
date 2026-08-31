# Speech-to-Text v2 (Terraform) — unused at runtime

Composer voice dictation transcribes through **Vertex Gemini** (same WIF /
resolver as chat). It does **not** call `speech.googleapis.com`. The Vercel
runtime SA can already use Vertex; Chirp 3 needs `roles/speech.client` and
preview 403s without it (`PERMISSION_DENIED`).

This stack remains only if we later switch STT back to Chirp:

- Enables `speech.googleapis.com`
- Grants the Vercel WIF runtime SA `roles/speech.client`

Do not use the `@google-cloud/speech` gRPC client on Vercel Fluid.

## Apply (optional)

```bash
cd infra/speech
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Local/E2E stub: `ALLOW_TEST_STUB_SPEECH=true` (never on Vercel production or preview).
