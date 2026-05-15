---
iteration: 2
max_iterations: 15
completion_promise: "All 12 todos in /Users/sachinagrawal/.cursor/plans/draft_+_redraft_andrei_pipeline_bfdd9c97.plan.md are implemented, npx tsc --noEmit passes with no errors, ESLint passes, full vitest suite passes, AND a focused unit test demonstrates that the route's wantsSuggestion + Case D branch correctly handles a kind:fields fix end-to-end (route returns a fields-shape comment, applyFieldsDirect writes the value to the right path)"
---

## Iteration 2 (done)

- Extracted pure helpers to `src/lib/ai/apply-field-ops.ts`: `parsePath`, `setNestedPath`, `appendAtPath`, `applyFieldOps`.
- `use-apply-suggestion.ts` calls `applyFieldOps` for fields-kind Accept.
- New tests: `src/lib/ai/apply-field-ops.test.ts` (24 tests worth of cases), `src/lib/ai/suggested-fix.test.ts`.
- `evaluate.test.ts` mock `suggestedFix` updated to `{ kind: "none" }` for met rows.
- Verification: `tsc --noEmit` clean, `npm run lint` clean, `npm test` → **64 tests**, 14 files.

**Manual check (optional):** Analyze → Run it by Andrei → confirm gutter shows Set/Add rows → Accept → form fields fill. Automated tests cover apply logic; manual run confirms API + model + UI wiring.

Execute the plan at `/Users/sachinagrawal/.cursor/plans/draft_+_redraft_andrei_pipeline_bfdd9c97.plan.md` ("Fix Reviewer Output for Hybrid Sections").

The plan extends the per-criterion `suggestedFix` schema in `src/lib/ai/evaluate.ts` to a discriminated union (none/patch/fields), updates the prompts in `src/lib/ai/section-prompts.ts` to instruct the model on the new shape, fixes the apply path in `src/hooks/use-apply-suggestion.ts` to handle FieldOp[], updates the route in `src/app/api/reports/[reportId]/evaluate/route.ts` to branch on `fix.kind`, and updates the gutter card in `src/components/report/review-rail/comment-card.tsx` to preview field-ops. Also requires updating types in `src/types/report.ts` and `src/db/schema/index.ts`, and adding a `coerceLegacyFix` helper for backward compatibility with existing DB rows.

Implementation order (each iteration: do the next chunk that has unmet dependencies satisfied, run `npx tsc --noEmit` to validate, then continue):

1. **Schema + types** (foundation, blocks everything else):
   - Update `src/lib/ai/evaluate.ts` schema to the discriminated union (none/patch/fields)
   - Update `EMPTY_SUGGESTED_FIX` and `SuggestedFix` exports
   - Update `src/types/report.ts` `EvaluationRecord.suggestedFix` type
   - Update `src/db/schema/index.ts` Drizzle `$type` annotation

2. **Legacy coercion helper**: add `coerceLegacyFix(unknown): SuggestedFix` somewhere reusable (probably co-located with the type, e.g., `src/lib/ai/evaluate.ts` or a new `src/lib/ai/suggested-fix.ts`).

3. **Prompts** (`src/lib/ai/section-prompts.ts`):
   - Update `COMMON_EVALUATION_SYSTEM_PROMPT` to describe the union (replace the "anchorText:'',replacementText:''" rule for met)
   - Rewrite `ANALYZE_PROMPT_ADDITION` to require kind:fields with per-criterion target paths and tool-selection rule
   - Update `IMPROVE_PROMPT_ADDITION` and `CONTROL_PROMPT_ADDITION` to allow patch/fields per criterion with documented target paths
   - Bump `PROMPT_VERSION`

4. **Route** (`src/app/api/reports/[reportId]/evaluate/route.ts`): coerce on read, update `wantsSuggestion` to `fix.kind !== "none" && hasContent`, branch Materialize on `fix.kind` not `NARRATIVE_SECTIONS`.

5. **Apply path** (`src/hooks/use-apply-suggestion.ts`): coerce on read, handle each kind. Add `setNestedPath`/`appendToArray` helpers with prototype-pollution guard and silent-drop on unresolvable paths. Inject `id: createId()` for `correctiveActions` appends. Drop the analyze hard-code to `investigationOutcome`.

6. **Gutter card** (`src/components/report/review-rail/comment-card.tsx`): coerce on read, render ops preview for kind:fields, replace the misleading anchor fallback for fields-kind, add `formatPathLabel` helper.

7. **Verify**: run `npx tsc --noEmit`. Manual test guidance: open a report, navigate to Analyze, click Run by Andrei, confirm the gutter card shows field ops and Accept populates the form.

When emitting the completion promise, only do so when ALL of these are true:
- Every file change above is in place
- `npx tsc --noEmit` returns exit 0
- ESLint or the project's lint command passes (run `npx next lint` or check `package.json` for the lint script)
- The plan file's todo statuses have been updated to `completed`

Each iteration: read the plan file todos, the previous iteration's progress (look at git diff if helpful), and pick the next unblocked chunk. Keep iterations focused — better to do one or two todos thoroughly than five sloppily.
