# Ami Lifesciences — pack notes

Pilot pack for [Ami Lifesciences Pvt. Ltd.](https://www.amilifesciences.com/) (API, Vadodara). Infra stand-up is **[Add a customer](./whitelabel-vercel-deploy.md#add-a-customer)** (`pnpm standup-customer -- … --slug ami`). This file is pack/product notes only — do not copy it for the next tenant.

| Piece | Value |
|-------|--------|
| Vercel project | `andrei-ami` (`prj_0kgqT8O8Jrp6Sa9ds7674U3nu0HU`) |
| Pack env | `ami` |
| Public host / `AUTH_URL` | `https://ami.andreihealth.com` |
| Neon | `andrei-ami` (`wispy-bonus-55749532`) |
| `GCS_BUCKET` | `andrei-493614-ami-attachments` |
| `promptVersion` | `ami-investigation-v1` |
| Document type | Investigation Report only (`investigation_report`, DMAIC, no conclusion) |

Word export is the MJ investigation form with Ami chrome (`templates/ami-investigation-report-template.docx`, rebuilt with `pnpm build-ami-investigation-template`). Criteria are the shared investigation set — not MJ SOP/DP/QA/008. Insights and the Templates gallery stay off. Analytics is on.

First users are Andrei plus-aliases (`sachin@` / `aditya@` engineer, `+manager`, `+admin`), not `@amilifesciences.com`.

## In git

- Pack id `ami` in `src/lib/customers/`
- Branding / logos (`public/logo-ami*.png` from [amilifesciences.com](https://www.amilifesciences.com/images/logo.png))
- Investigation-only enablement + Word import
- Neon preview id in `CUSTOMER_NEON_PREVIEW_PROJECTS`
- GCS tenant `ami` in `infra/gcs`

## Local overlay check

```bash
ANDREI_CUSTOMER=ami
NEXT_PUBLIC_ANDREI_CUSTOMER=ami
```

in `.env.local`, then `pnpm db:local:up` and `pnpm dev`. Create one investigation report and export Word.

```bash
pnpm build-ami-investigation-template
```

## Follow-ups with Ami (not blockers)

- Real investigation SOP / form number for the Word header and footer (today: `Investigation SOP`, MJ `SOP/DP/QA/008/F04-R02` stripped).
- Site / unit label (today: `Unit: API`).
- Gujarati / Hindi voice dictation if QA wants it (today: `en-US` only).
- Additional document types (they asked for investigation only on this pilot).
