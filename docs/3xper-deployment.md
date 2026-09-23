# 3xper Innoventure — pack notes

Infra stand-up is **[Add a customer](./whitelabel-vercel-deploy.md#add-a-customer)** with `slug=3xper`. Do not copy this file for the next pack.

| Piece | Value |
|-------|--------|
| Vercel | `andrei-3xper` |
| Pack env | `3xper` (all three identity vars) |
| Host / `AUTH_URL` | `https://3xper.andreihealth.com` |
| Neon | `andrei-3xper` (`dark-salad-24878113`) |
| `GCS_BUCKET` | `andrei-493614-3xper-attachments` |
| `promptVersion` | `3xper-vq-f04-v1` |

This pack enables **one** document type: Vendor Qualification (`vendor_qualification`, form **QAD-SOP-MS-001-F04** Rev 01). Investigation, DV, QRA, ELR, and generic Document are off.

## What users see

| Surface | 3xper |
|---------|--------|
| Branding | 3xper Innoventure Limited, navy `#0a4e9b`, magenta accent `#ed1c6f`, wordmark from [3xper.com](https://3xper.com/) |
| Create | Vendor Qualification only (VQ number, e.g. `VQ-2026-001`) |
| Workspace | Cover + sections A–N + scoring. Yes/No/N.A. in the editor; chat drafts comments, conclusions, and impurity/CAPA tables |
| Word export | A4, header logo + MASTER COPY, form number `QAD-SOP-MS-001-F04`, Palachur / Naidupeta address, footer Prepared / Reviewed / Approved |
| Insights | Off (`/insights` redirects home) |
| Analytics | On (same worksheet/plots as demo) |
| Word import | Off |
| Unsupported facts | Block (do not persist invented hard facts) |
| Composer voice | English (`en-US`); assistant still replies in English |

Header **Document Number** on the form is always `QAD-SOP-MS-001-F04`. Andrei’s unique id is `reports.document_no` (the VQ number).

Local overlay check: `ANDREI_CUSTOMER=3xper` and `NEXT_PUBLIC_ANDREI_CUSTOMER=3xper` in `.env.local`, then `pnpm db:local:up` and `pnpm db:migrate`.

## Feature notes 3xper should confirm

These are encoded as form-master constants until 3xper signs off:

- Footer **Prepared / Reviewed / Approved** names: Anantha Kumar D, Sarat Kumar Y, Narayan Kumar S (from the scanned master). Replace if the controlled copy differs.
- Cover SCM contact defaults (placeholders until filled): Chinamuthevi Phani Raja Kumar, DGM – Supply Chain, Guindy address / `044 4217 7770-5`.
- **Section E** on the 48-page master has more 2.x / 4.x / 5.x sub-questions than the workspace. Leftovers go in that section’s additional narrative.
- Form number `QAD-SOP-MS-001-F04` Rev 01 is not Andrei’s document number.

Rebuild the Word template after header/logo copy changes:

```bash
pnpm build-vq-template
```

## Smoke (after the shared deploy checklist)

1. Open `/login` — 3xper wordmark on white, “Vendor qualification, accelerated.”
2. Sign in, change password.
3. Create a Vendor Qualification (`VQ-2026-001`). Workspace opens Cover, not DMAIC.
4. Fill manufacturer + material; export Word. File is A4, form number in the identity table, VQ number in `{documentNo}`, 3xper logo in the header.
5. Upload a PDF to the vault, add it to the report, ask Agent to draft section G from the attachment (needs Vertex).
