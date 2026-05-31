# Plan: AI Suggestion Generation Agent

## Context

The traffic lights evaluation system already evaluates 36 criteria across DMAIC sections and reports which are `met`, `partially_met`, or `not_met` with reasoning. Users currently see what's wrong but must manually fix their report text. This feature adds an agent that **generates targeted fix suggestions on demand** (one explicit action per section), displayed both inline in the Tiptap editor (tracked-change marks) and in the criteria side panel.

**Key insight**: The infrastructure is 90% built. The `injectSuggestionMarks()` function, suggestion mark extensions, action widgets (accept/ignore), `ai_fix` comment kind, `contentPath`, `anchorText`, and `fromPos`/`toPos` columns all exist. What's missing is the **generation** step — the LLM call that produces the oldText/newText pairs.

---

## Architecture

```
User runs AI check for a section (existing), sees failing criteria
    │
    ▼
User clicks “Suggest fixes” for THAT section only (no global / top-bar trigger)
    │
    ▼ (non-blocking request for that section)
POST /api/reports/[reportId]/suggestions  { sections: [thatSection] }
    │
    ├─ Group failing criteria by section
    ├─ For each section: one LLM call with full content + all failing criteria
    ├─ LLM returns: { criterionKey, targetField, anchorText, replacementText, reasoning }[]
    │
    ▼ Validate & apply
    ├─ Narrative fields: injectSuggestionMarks(doc, anchor, replacement, attrs)
    ├─ Structured fields: store in comments table with contentPath
    ├─ Persist updated section content + create ai_fix comment rows
    │
    ▼ Return to client
    └─ { updatedSections, newComments, suggestionStatuses }
```

**Why separate endpoint (not inline with eval)**:
- Evaluation already takes 10-20s across sections. Adding suggestion generation sequentially would hit function timeouts.
- Client shows evaluation results as soon as the check finishes; the user decides when to request suggestions per section.
- Can retry suggestions independently if they fail.

**Why no auto-trigger and no top-level “suggest all” button**:
- Suggestions are LLM-heavy and edit the document; users should opt in explicitly and only for the section they are working on.
- A single control per section matches the existing **Run it by Andrei** pattern in `section-shell.tsx` and avoids accidental bulk edits.

---

## Prompt Design (Codex-style direct diffs)

The LLM receives the **full section content as plain text** (same `contextForPrompt()` output the evaluator sees) plus the failing criteria with their reasoning. It returns verbatim `anchorText` substrings because:

1. Section content is short (hundreds to ~2K words) — well within context
2. The text IS in the prompt — the LLM is looking at it, not remembering it
3. `injectSuggestionMarks()` already has whitespace-tolerant matching as fallback
4. If anchor doesn't match → append at end (insertion mode, already handled)

**Scope constraint**: Anchor text must come from the CURRENT section only. Previous sections are context but NOT editable targets.

**Criteria context**: The evaluation reasoning IS the specification for what to fix. The LLM doesn't need to re-diagnose — it already knows "detection date/time is missing" from the evaluation.

---

## Implementation Steps

### 1. New file: `src/lib/ai/suggest.ts`

Core suggestion generation logic. Follows the pattern of `evaluate.ts`:

```ts
const suggestionSchema = z.object({
  suggestions: z.array(z.object({
    criterionKey: z.string(),
    targetField: z.string(), // "narrative" | "sixM.man" | "correctiveActions[0].description" etc.
    anchorText: z.string(),  // verbatim substring from section content (empty = append)
    replacementText: z.string(),
    reasoning: z.string().max(300),
  }))
});
```

- Uses same `resolveEvaluationLanguageModel()` (Gemini 2.5 Flash)
- Temperature: 0.4, no seed (we want good prose, not reproducibility)
- One call per section (batches all **gap** failing criteria for that section — see Re-run Policy)
- Validates each suggestion: layered anchor matching (exact → whitespace-collapsed → Unicode-normalized), `targetField` in per-section allow-list, `deleteText` is a substring of `anchorText`, at least one of `deleteText`/`insertText` non-empty
- Returns `{ applied[], dropped[{criterionKey, reason}] }` — **never drops silently**. Reasons: `not_found`, `ambiguous`, `overlap`, `block_boundary`, `bad_target_field`, `bad_criterion`, `schema_invalid`

### 2. New file: `src/lib/ai/suggest-prompts.ts`

System prompt for suggestion generation:
- Role: pharmaceutical QA writing assistant
- Rules: anchorText must be VERBATIM substring, minimal edits only, use `<to be filled>` for facts not in source
- Per-section additions for domain-specific guidance (same pattern as `section-prompts.ts`)

### 3. New file: `src/app/api/reports/[reportId]/suggestions/route.ts`

POST endpoint orchestrating the flow:
1. Receive `{ section: SectionType }` — **exactly one section per request**. Reject arrays with 400. Tests call `generateSuggestions(section)` directly, not the route, so there's no need for a parallel-across-sections code path (and no risk of fan-out blowing the function budget on a future "regenerate all" misuse).
2. Load current evaluations + section content from DB.
3. Compute the **gap set**: failing criteria (`partially_met` / `not_met`) with no open `ai_fix` comment linked via `evaluationId`. If empty → return `{ blocked: true, reason: "no_gap_criteria" }`.
4. Verify `evaluatedContentHash === currentSectionHash` for the gap criteria; if mismatched → `{ blocked: true, reason: "stale_evaluation" }`.
5. Call `generateSuggestions(section, gapCriteria)`.
6. For each valid suggestion:
   - Mint a fresh `suggestionId` (cuid) used for both the Tiptap mark id and the comment id.
   - **Narrative**: call `injectSuggestionMarks(doc, { anchorText, deleteText, insertText }, attrs)` where `attrs.id = suggestionId`, `attrs.authorId = AI_AUTHOR_ID` (sentinel — see step 7), `attrs.kind = "fix"`.
   - **Structured field**: validate `targetField` against `suggest-target-fields.ts` allow-list for this section; skip Tiptap injection.
   - Create `comments` row: `id=suggestionId`, `kind='ai_fix'`, `evaluationId`, `anchorText`, `content=insertText`, `contentPath=targetField`, `fromPos/toPos` from inject result, `status='open'`.
7. Persist updated section JSONContent (with marks) to `reportSections.content`.
8. Return `{ applied: Suggestion[], dropped: { criterionKey, reason }[] }`. Client toasts a summary line per dropped suggestion so the user can act.

### 4. Modify: `src/providers/report-provider.tsx`

- Add `generateSuggestions(section: SectionType)` (or equivalent) called **only** from the per-section UI — **not** from `runEvaluation()` success callbacks
- Track `suggestingSections: SectionType[]` (or `runningSuggestSections` parallel to `runningEvalSections`) so the section button can show a spinner
- After suggestions return for that section: call `replaceSection()` for the updated section (Tiptap re-render with marks), merge new comments into state

### 4b. Modify: `src/components/report/sections/section-shell.tsx` (+ small component)

- Place **one** secondary control next to `SectionRunEvaluationButton`: e.g. **Suggest fixes** (or similar label), wired to `generateSuggestions(section)`
- Disable when: eval is running for that section, suggestions are already generating for that section, that section has no failing criteria (`partially_met` / `not_met`), or pending `ai_fix` comments block re-generation (per re-run policy below)
- **Do not** add a `RunAllSuggestionsButton` or any header/toolbar control that generates suggestions for every section — contrast with `RunAllEvaluationButton`, which stays evaluation-only
- Optionally extract `SectionSuggestFixesButton` into `section-status-pill.tsx` next to `SectionRunEvaluationButton` for consistency

### 5. Modify: `src/components/report/criteria-sheet.tsx`

**One card at a time per section, severity-ordered.** The panel does not render a stack of open suggestion cards. It picks the single highest-priority open `ai_fix` for that section and renders only that one. After the user accepts or dismisses it, the next card slides in.

- Selection order: open `ai_fix` comments for the section sorted by
  1. linked criterion `effectiveStatus`: `not_met` (red) before `partially_met` (yellow),
  2. then by criterion display order within the section,
  3. then by comment `createdAt` ascending (stable for same-priority ties).
- Card displays: linked criterion (with red/yellow pill), suggested change (deleteText → insertText diff or new field value), reasoning, Apply / Dismiss buttons.
- **Narrative suggestions**: "Apply" scrolls to the inline mark in editor and triggers the per-operation accept animation; "Dismiss" calls `stripSuggestionMarksById()` and updates comment status to `dismissed`.
- **Structured field suggestions**: "Apply" calls section update with the validated `targetField` path + `insertText`; "Dismiss" just dismisses the comment.
- After Apply/Dismiss settles, re-query the open set and render the next card. If none remain, show an empty state ("All suggestions resolved — re-run criteria or request more fixes.").
- Counter in the card header: "Suggestion 1 of N" so the user knows how many remain.

This keeps the panel focused, makes the red-first ordering visible, and avoids users skimming/applying yellows before resolving reds.

**Inline marks track the active card.** Only the suggestion currently shown on top in the panel reveals its red/green marks in the editor; all other open suggestions' marks stay in the document JSON but are visually hidden so the editor isn't littered with rainbow diffs the user can't act on.

- Track `activeSuggestionId` in report-provider state (the id selected by the severity-ordered query above).
- Tiptap renders all suggestion marks but applies an `is-inactive` class to any mark whose `id !== activeSuggestionId`. CSS for `.suggestion-insert.is-inactive` and `.suggestion-delete.is-inactive` removes the green/red styling and the strikethrough — the underlying text just renders as normal prose.
- Inline accept/dismiss action widgets (`suggestion-action-widgets.ts`) are also hidden for inactive marks (no floating buttons over invisible suggestions).
- When the active card resolves (accept/dismiss) and the next card is selected, the swap is animated: brief fade-in of the new marks (200ms) so the user's eye is drawn to the next change location.
- This works for both narrative (Tiptap marks) and structured-field suggestions (no marks exist for those, so the active-id logic is a no-op in those sections).

Net effect: the panel and the editor stay in lockstep — one card visible, one set of inline marks visible, in red-first order.

### 6. DB migration — **none required**

Earlier drafts proposed a `suggestionStatus` column on `criteriaEvaluations`. We're not doing that:

- The `comments` table (`kind='ai_fix'`, `status='open'|'resolved'|'dismissed'`, `evaluationId` FK) is already the source of truth.
- A column would duplicate state and drift — especially once a criterion can have a history (one resolved + one open) or, in the future, multiple open suggestions.
- The gap-set query ("failing criteria with no open `ai_fix`") is a join, not a column lookup; a column doesn't speed it up.

If join perf becomes an issue, add an index on `comments(report_id, evaluation_id, kind, status)`. Otherwise this feature ships with **zero schema changes**.

### 7. New file: `src/lib/ai/suggest-target-fields.ts`

Per-section allow-list of valid `targetField` dot-paths:

```ts
export const SUGGEST_TARGET_FIELDS: Record<SectionType, readonly string[]> = {
  define:  ["narrative"],
  measure: ["narrative"],
  analyze: ["narrative", "sixM.man", "sixM.machine", "sixM.method", "sixM.material", "sixM.measurement", "sixM.environment", "rootCause.primaryLevel1", /* ... */],
  improve: ["narrative", "correctiveActions[].description", "correctiveActions[].owner", /* ... */],
  control: ["narrative"],
};
```

Server validates each suggestion's `targetField` against this list. Pattern entries like `correctiveActions[].description` match `correctiveActions[0].description`, `correctiveActions[1].description`, etc., but reject arbitrary indices outside the existing array length (prevents `lodash.set` from creating sparse arrays at index 99). Failures → drop with `reason: "bad_target_field"`.

---

## Key Files

| File | Role |
|------|------|
| `src/lib/ai/suggest.ts` | **NEW** — Core generation logic |
| `src/lib/ai/suggest-prompts.ts` | **NEW** — Prompt templates |
| `src/lib/ai/suggest-target-fields.ts` | **NEW** — Per-section allow-list of editable dot-paths |
| `src/lib/tiptap/strip-pending-suggestions.ts` | **NEW** — `cleanViewForPrompt()` for evaluator |
| `src/lib/text/normalize-for-anchor.ts` | **NEW** — Whitespace + Unicode normalization for layered matching |
| `src/app/api/reports/[reportId]/suggestions/route.ts` | **NEW** — API endpoint |
| `src/lib/tiptap/suggestion-inject.ts` | **EXISTING** — `injectSuggestionMarks()`, `stripSuggestionMarksById()` |
| `src/lib/tiptap/suggestion-marks.ts` | **EXISTING** — Mark definitions, TrackChanges extensions |
| `src/lib/tiptap/suggestion-action-widgets.ts` | **EXISTING** — Accept/Ignore inline buttons |
| `src/lib/ai/evaluate.ts` | **EXISTING** — Pattern to follow for LLM call |
| `src/lib/ai/section-context.ts` | **EXISTING** — `contextForPrompt()` reused for suggestion prompt |
| `src/providers/report-provider.tsx` | **MODIFY** — Expose `generateSuggestions(section)`, loading state per section |
| `src/components/report/sections/section-shell.tsx` | **MODIFY** — Per-section **Suggest fixes** button (only place in app chrome) |
| `src/components/report/criteria-sheet.tsx` | **MODIFY** — Suggestion cards in panel |

---

## Handling Structured Fields (non-Tiptap)

For sections like Analyze (6M fields, rootCause, impactAssessment) and Improve (correctiveActions array):

- The LLM sets `targetField` to the dot-path (e.g., `"sixM.measurement"`, `"rootCause.primaryLevel1"`)
- No Tiptap marks are injected (these aren't narrative fields)
- The suggestion lives in the `comments` table with `contentPath = targetField`
- The criteria panel shows the suggestion inline with an "Apply" button
- "Apply" does: `updateSection(section, prev => lodash.set(prev, targetField, replacementText))`

---

## Re-run Policy: Gap-Filling, Not Blanket Block

A blanket "block if any open `ai_fix` exists for the section" is too coarse: it strands the user when run #1 only produced fixes for some failing criteria, when re-evaluation surfaces a new failure, or when a pending suggestion has gone stale due to user edits. Instead, gate on **whether there is a failing criterion that does not yet have an open suggestion**, and have the endpoint only generate for that gap set.

**Gating (Suggest fixes button enabled when ALL of):**
- Section has a fresh evaluation: `evaluatedContentHash === currentSectionHash` for that section.
- There exists at least one criterion with `effectiveStatus ∈ {not_met, partially_met}` that has **no open `ai_fix` comment** linked via `evaluationId`.
- Section is not currently generating suggestions or evaluating.

If all failing criteria already have open `ai_fix` comments, the button is disabled with tooltip: "Resolve pending suggestions or clear them to request more." (This is the only case the original blanket block was actually right about, and we preserve it.)

**Server behavior on POST `/suggestions`:**
1. Compute the **gap set** = failing criteria for the requested section with no `ai_fix` comment in `status='open'`.
2. If the gap set is empty → respond `{ blocked: true, reason: "no_gap_criteria" }` (client toast: "Resolve pending suggestions before requesting more").
3. Otherwise prompt the LLM **only** over the gap criteria; never re-suggest against a criterion that already has a pending fix. This guarantees no duplicate/competing suggestions per criterion.

**Evaluation is never blocked.** The evaluator always reads the clean view (pending suggestion marks stripped), so pending fixes do not bias re-evaluation.

**Escape hatch.** Keep a per-section "Clear pending suggestions" action for the stale-anchor case (user edited around a pending suggestion and wants to start over without manually dismissing each).

**Dismissed suggestions don't count.** The gating check looks at **open** `ai_fix` comments only. A dismissed suggestion for a still-failing criterion means "that specific suggestion was wrong" — the user can retry it.

---

## Accept/Dismiss Animation (per operation kind)

The generation schema produces three operation kinds (`replace`, `pure insert`, `pure delete`). Each needs its own animation, otherwise insert-only and delete-only cases feel inconsistent or jarring.

**Replace (delete + insert):**
- Accept: fade red delete (`opacity 1→0`, 200ms) → splice it out → unwrap green insert mark (becomes normal text).
- Dismiss: fade green insert (`opacity 1→0`, 200ms) → splice it out → unwrap red delete mark (becomes normal text).

**Pure insert (no `deleteText`):**
- Accept: green insert keeps its position, brief background-color flash (`bg green-100 → transparent`, 200ms) signals the change, then unwrap the mark. No splice.
- Dismiss: fade green insert (`opacity 1→0`, 200ms) → splice it out.

**Pure delete (no `insertText`):**
- Accept: fade red delete (`opacity 1→0`, 200ms) → splice it out. No insert to unwrap.
- Dismiss: brief background-color flash on the red delete to acknowledge → unwrap the delete mark (text returns to normal).

Shared implementation:
- CSS classes: `.suggestion-fading-out` (opacity transition), `.suggestion-flash-accept` / `.suggestion-flash-dismiss` (background-color transition). Single 200ms duration across all kinds for consistency.
- `onAccept` / `onDismiss` in `suggestion-action-widgets.ts`: add the appropriate class, `setTimeout(200)`, then perform the actual mark removal / splice via the existing helpers.
- All animations should respect `prefers-reduced-motion: reduce` — fall back to instant apply.

---

## Stale Content Handling

The button gating already requires `evaluatedContentHash === currentSectionHash` at **generate time**, so most staleness is caught up front. The remaining case: user edits the section between generation and the apply click.

Rather than blocking on a strict hash check at apply time (which would be hostile given many edits are trivial whitespace/punctuation fixes), **rely on the layered matcher**:

- Apply attempts exact match → whitespace-collapsed → Unicode-normalized.
- If all three layers fail → mark the comment with a `stale` status, surface in the panel as "Anchor no longer found — content changed since this suggestion was generated," with options to dismiss or jump to the criterion to re-suggest.
- The matcher's tolerance handles smart-quote swaps, NBSP changes, and minor reflow without false positives on staleness.

This means: hash is the **generation-time gate**, layered matching is the **apply-time gate**, and an explicit `stale` status surfaces only when matching truly fails.

---

## Verification

1. **Unit test**: `suggest.ts` — mock Gemini response, verify structured output parsing + validation (drop suggestions with bad anchors)
2. **Integration test**: Hit `/api/reports/[id]/suggestions` with a real report, verify:
   - Comments created with `kind='ai_fix'`
   - Section content updated with suggestion marks
   - `suggestionStatus` set to `'pending'` on eval rows
3. **E2E manual test**:
   - Write a Define section missing detection date/time
   - Run evaluation → see "not_met" for `define.datetime`
   - Click **Suggest fixes** on that section’s header (no top-bar suggestion control)
   - Verify inline green/red marks appear in editor
   - Verify suggestion card appears in criteria panel
   - Click Accept → marks resolve, text updated
   - Click Dismiss on another → marks stripped, comment dismissed
4. **Structured field test**:
   - Leave `sixM.measurement` empty in Analyze section
   - Run evaluation → see "not_met" for `analyze.sixm_completeness`
   - Click **Suggest fixes** for Analyze
   - Verify suggestion card in panel with "Apply" button
   - Click Apply → field populated
