# Report Scorer

Standalone tool for evaluating deviation investigation reports against GMP criteria.
**Not part of the main application.**

## Usage

```bash
# Score all reports in docs/dataset/
npx tsx tools/score-report/score-report.ts

# Score specific files
npx tsx tools/score-report/score-report.ts path/to/report1.docx path/to/report2.docx
```

Outputs `scores.html` in the project root. Open it in any browser.

## Requirements

- `GOOGLE_GENERATIVE_AI_API_KEY` set in `.env.local` (same key used by the app)
- Reports must be `.docx` files

## Scoring

- **met** = 1 point · **partially_met** = 0.5 · **not_met** = 0
- 36 criteria total across 5 DMAIC sections (Define 6, Measure 5, Analyze 5, Improve 6, Control 14)
- Overall score = (total points / 36) × 100
