# Criteria human review

Internal QA workflow for validating AI traffic-light evaluations on sample deviation DOCX files.

## Setup

1. Ensure `DATABASE_URL` is set in `.env.local` (Neon).
2. Apply schema: `pnpm run db:migrate` (baselines push-created DBs, then applies `0008_criteria_review`).
3. Seed review reports (runs bulk eval on `docs/sample_files`):

   ```bash
   pnpm run seed-criteria-review
   ```

4. Open **Criteria review** in the app sidebar (`/criteria-review`).

## Data model (Neon)

- **`criteria_review_reports`** — one row per sample DOCX (AI input/output JSON, deviation, prompt version).
- **`criteria_review_reviewers`** — reviewer registry (name + employee ID).
- **`criteria_review_submissions`** — one row per reviewer × report; `answers` JSON holds per-criterion judgments.

Human labels are **not** stored on production `reports` / `criteria_evaluations` tables.

## Reseeding

Re-running `pnpm run seed-criteria-review` updates AI baselines on each report but **preserves** existing human submissions for that report.

## Access control

- `CRITERIA_REVIEW_DISABLED=true` — hides feature
- `CRITERIA_REVIEW_MANAGERS_ONLY=true` — managers only
