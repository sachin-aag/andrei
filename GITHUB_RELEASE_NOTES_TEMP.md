> **Temporary file** — paste this into your GitHub Release description, then delete this file from the repo (or keep it untracked locally).

# Release `v0.1.1` (draft) — since `v0.1.0`

**Compared to:** tag `v0.1.0` → `main` (commit `ead3f6b`).  
**App version in `package.json`:** still `0.1.0` — bump and tag when you cut the release (e.g. `v0.1.1`).

## Summary

This release improves the report workspace layout with a dedicated right-hand sidebar, makes **placeholder** handling much clearer in the editor and in AI prompts, and **refactors AI evaluation** so more logic lives in shared libraries (with stronger tests). It also **tightens structured evaluation output** so AI results stay aligned with the app’s schema.

## Added

- **Right sidebar** on the report workspace: section-oriented navigation and supporting UI (`report-sidebar`, `section-accordion`) so long DMAIC reports are easier to scan and jump within.
- **Click-to-fill placeholders:** selecting a placeholder in the editor selects the full range so typing replaces it immediately; the **placeholders panel** adds per-card context plus an input and **Fill** action.
- **Placeholder highlighting** in the editor for bracket-style spans, with clearer treatment of non-numeric “todo” brackets and **normalization** when applying patches or field updates.
- **Section context helpers** for prompts (`section-context.ts`) to build richer, more consistent context for evaluation.
- **Documentation:** project **release-notes** skill and a short README pointer for drafting GitHub Releases.

## Changed

- **AI evaluation pipeline:** the evaluate API route delegates to `evaluateSection` and related helpers in `src/lib/ai/evaluate.ts`; prompt construction pulls from shared **section context** utilities. **Unit tests** for evaluation were expanded accordingly.
- **Criteria / review UI:** the criteria sheet received a substantial layout and interaction pass alongside the new sidebar.
- **Prompt rules** (`section-prompts.ts` and related): clearer guidance for placeholder shape (including `<to be filled>` style expectations) and bracket handling for the model.
- **Suggested fix** handling: small adjustments alongside evaluation/schema alignment.

## Fixed

- **Evaluation schema alignment:** fixes where structured AI output and downstream handling could drift from expected shapes (placeholders panel, workspace wiring, and evaluation tests updated in the same workstream as “schema issues”).

## Migration / ops

- **Database:** no new migration called out in this delta; follow existing `README` steps (`db:push`, `db:fix-comments`, etc.) if your environment is behind.
- **Environment:** no new environment variables identified in this changelog range; Vercel AI Gateway usage unchanged.

## Known issues

- None recorded here; treat placeholder edge cases and very large documents as the usual areas to spot-check during QA.
