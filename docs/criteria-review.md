# Criteria human review

Internal QA workflow for validating AI traffic-light evaluations on sample deviation DOCX files.

## Setup

1. Add Langfuse keys to `.env.local` (see `.env.example`).
2. Seed the dataset (runs bulk eval on `docs/sample_files`):

   ```bash
   pnpm run seed-criteria-review
   ```

3. Open **Criteria review** in the app sidebar (`/criteria-review`).

## Data model

- **Langfuse dataset:** `criteria-evaluations/human-review` (65 items after seed)
- In the Langfuse UI this appears under folder **criteria-evaluations** → dataset **human-review**, not a separate empty dataset you may have created manually (e.g. “Criteria evalutations”).
- **65 items** — one per sample DOCX × DMAIC section
- Each item has ordered **sub-questions** (traffic lights) with AI status + reasoning
- Human judgments stored in item `metadata.humanReview`

## Syncing from production traces

In Langfuse: **Observations** → select a `criteria-evaluate-section` generation → **Actions → Add to dataset** → map fields into the same `input` / `expectedOutput` shape. Use a stable item `id` like `review-{docSlug}--{section}`.

## Access control

- `CRITERIA_REVIEW_DISABLED=true` — hides feature
- `CRITERIA_REVIEW_MANAGERS_ONLY=true` — managers only
