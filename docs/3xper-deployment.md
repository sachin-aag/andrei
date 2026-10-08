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

This pack enables **three** document types: Vendor Qualification (`vendor_qualification`, form **QAD-SOP-MS-001-F04** Rev 01), the Qualification Summary Report (`qualification_summary_report`, form **QAD/016/F06-00**, `promptVersion` `3xper-qsr-f06-v3`), and the Cleaning Validation Protocol (`cleaning_verification_protocol`, form **QAD-SOP-PS-003-F08-00**, `promptVersion` `3xper-cvp-f08-v3`). Investigation, DV, QRA, ELR, and generic Document are off.

## What users see

| Surface | 3xper |
|---------|--------|
| Branding | 3xper Innoventure Limited, navy `#0a4e9b`, magenta accent `#ed1c6f`, wordmark from [3xper.com](https://3xper.com/) |
| Create | Vendor Qualification (VQ number, e.g. `VQ-2026-001`), Qualification Summary Report (report no., e.g. `QSR/GLR-1301`), or Cleaning Validation Protocol (protocol no., e.g. `CVRP-ISM4-26-001`) |
| Workspace | Cover + sections A–N + scoring. Yes/No/N.A. in the editor; chat drafts comments, conclusions, and impurity/CAPA tables |
| Word export | A4, header logo + MASTER COPY, form number `QAD-SOP-MS-001-F04`, Palachur / Naidupeta address, footer Prepared / Reviewed / Approved |
| Insights | Off (`/insights` redirects home) |
| Analytics | On (same worksheet/plots as demo) |
| Word import | CVP only (existing protocol .docx at create). VQ and QSR stay off |
| Unsupported facts | Block (do not persist invented hard facts) |
| Composer voice | English (`en-US`); assistant still replies in English |

Header **Document Number** on the form is always `QAD-SOP-MS-001-F04`. Andrei’s unique id is `reports.document_no` (the VQ number).

## Qualification Summary Report (QAD/016/F06-00)

- **Identity** (report header card): Equipment / System, Equipment Number, Capacity / Size, Section, Report No., Revision, revision description. They print on the cover, the revision-history row, and every page header.
- **Sections** follow the form Index: 1.1 Objective … 7 Conclusion (18 `qsr_*` keys). Tables are plain grids in the editor; the export rebuilds the form's merged cells:
  - a row whose only content is a bold first cell becomes a full-width group row (equipment name in Qualification Documents, “ANY SPECIFIC REQUIREMENTS” in the RTMs);
  - a Qualification Documents row with a blank Document Name continues the protocol row above (S.No, Document Name, and Remarks merge vertically);
  - Operating Range: a blank Range cell spans Details across both columns; a blank S.No / Parameter continues the row above (Temperature Minimum / Maximum).
- **Word export** is the source form itself (`templates/3xper-qualification-summary-report-template.docx`, rebuilt from `docs/sample_files/3xper-qualification-summary-report-source.docx` with `pnpm build-qsr-template`). Index page numbers are `PAGEREF` fields; Word refreshes them on print or F9 (the file opens with the form's original numbers).
- Blank RTM tables export one empty row, not the source's URS-1…29 placeholders, and every body row uses the form's minimum row height (content grows it).

## Cleaning Validation Protocol (QAD-SOP-PS-003-F08-00)

- **Identity** (report header card): Protocol No., Name of the product, Product Code, Stage, Plant, Department, Version, Effective Date, Document Title. They print on the cover table and every page header. Footer Format No. is always `QAD-SOP-PS-003-F08-00`.
- **Sections** follow the form 1.0–24.0 (30 `cvp_*` keys). Equipment-specific 15.1–15.10 blocks from a filled protocol are one `cvp_equipment_sampling` narrative — do not hardcode vessel IDs. Result tables record three consecutive cleaning batches (Batch 1 / Batch 2 / Batch 3). Existing reports are widened on read.
- **Word export** keeps the source form’s A4 chrome and header logo (`templates/3xper-cleaning-verification-protocol-template.docx`, rebuilt with `pnpm build-cvp-template`). Body figures from the example protocol are dropped; section bodies are `{@cvp_*Xml}`.
- **Word import** is type-owned (`wordImport.kind === "cleaning_verification_protocol"`) — do **not** set pack `wordImportEnabled` (that would turn on VQ/QSR upload). Create dialog accepts a filled QAD-SOP-PS-003-F08-00 `.docx`; headings 1.0–24.0 split into `cvp_*` sections, cover/header fill identity, and the original file is stored as source DOCX. Word drawings, SmartArt, headers/footers, and yellow highlight are dropped — same limits as export.

### What Andrei can generate vs what it cannot

The filled example protocol uses Word drawings, merged cells, and yellow highlight fills that TipTap / `edit_table` / Word export do not reproduce. Chat is instructed to substitute; the engineer pastes or redraws the rest in Word after export.

| Piece in the paper protocol | Andrei can | Andrei cannot |
|-----------------------------|------------|----------------|
| Cover identity (product, code, stage, plant, protocol no.) | `draft_identity` | Invent a protocol number |
| Objective, Scope, Background, Pre-requisites, Methodology, Sampling procedure, Evaluation, Deviations, Revalidation | Prose from cited CPDR / PDR / BCR / SOPs | Ungrounded equipment or method numbers |
| Flat tables (scope, responsibilities, surface area, rinse calc, MACO attributes, process line, testing, method validation, related documents, annexures, history) | `edit_table` / seeded headers | Two-row merged headers (`gridSpan` / `vMerge`) |
| Qualification status | One row per equipment; dates sit in the same cells as the protocol/report number | Continuation-row date under the number (paper `vMerge`) |
| Nitrosamine / PGI limits | Flat columns (NDMA…NDBA; O-Nitro Toluene / P-Nitro Toluene / Mesityl oxide) | Impurity names spanning two header rows |
| Manufacturing area | Two rows per equipment (Production, then QA) | Vertically merged Equipment ID |
| MACO / rinse / swab arithmetic | Unicode or table rows: `n = √H + 1`, `SA × RF`, `PDE × MBS / TDD` | OMML equations, stacked-fraction drawings, bracketed formula art |
| Swab locations | `√H+1` rule and Location ID \| Description tables | Swab-stroke figure (overlapping H/V wipe drawing) |
| Equipment sampling 15.x | Heading + identity / locations / rationale tables per Scope item | Labelled vessel sketches (S-1 on the top dish), PFR flow schematics, equipment-train diagrams |
| Yellow “filled” cells | — | Cell highlight (`w:highlight` / yellow fill) |
| Handwritten signatures / chromatograms | — | Signatures; analytical plots (upload as attachments; `insert_image` only when the engineer asks to place a cited page) |
| TOC page numbers | Static section list | Live PAGEREF index matching the 96-page example |

Rebuild the Word template after header/logo copy changes:

```bash
pnpm build-cvp-template
```

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
4. Create a Cleaning Validation Protocol (`CVRP-ISM4-26-001`). Workspace opens cover identity + 1.0 Approval Signatures, not DMAIC. Export Word: A4, Format No. in the footer, protocol no. in the header, 3xper logo, no leftover `{@cvp_*Xml}` tags. Title and 12.0 heading say Validation.
5. Fill manufacturer + material; export Word. File is A4, form number in the identity table, VQ number in `{documentNo}`, 3xper logo in the header.
6. Upload a PDF to the vault, add it to the report, ask Agent to draft section G from the attachment (needs Vertex).
