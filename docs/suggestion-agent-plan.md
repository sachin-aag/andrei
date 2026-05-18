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
- Temperature: 0.4 (slightly more creative than eval's 0.2 — we want good prose)
- One call per section (batches all failing criteria for that section)
- Validates each suggestion: `anchorText` must be findable in section content (whitespace-tolerant `collapse()` match)
- Drops invalid suggestions silently (no retry — not worth the latency)

### 2. New file: `src/lib/ai/suggest-prompts.ts`

System prompt for suggestion generation:
- Role: pharmaceutical QA writing assistant
- Rules: anchorText must be VERBATIM substring, minimal edits only, use `<to be filled>` for facts not in source
- Per-section additions for domain-specific guidance (same pattern as `section-prompts.ts`)

### 3. New file: `src/app/api/reports/[reportId]/suggestions/route.ts`

POST endpoint orchestrating the flow:
1. Receive `{ sections?: SectionType[] }` — **client sends exactly one section** per button click (implementation may still accept an array for tests); do not default to “all sections” from the product UI
2. Load current evaluations + section content from DB
3. Filter to `partially_met` / `not_met` criteria
4. Call `generateSuggestions()` per requested section (typically one; use `Promise.all` when the array has multiple entries, e.g. tests)
5. For each valid suggestion:
   - **Narrative**: call `injectSuggestionMarks(doc, anchor, replacement, attrs)` where `attrs.id = evaluationId`, `attrs.authorId = "ai"`, `attrs.kind = "fix"`
   - **Structured field**: skip Tiptap injection (no narrative to mark)
   - Create `comments` row: `kind='ai_fix'`, `evaluationId`, `anchorText`, `content=replacementText`, `contentPath=targetField`, `fromPos/toPos` from inject result
6. Persist updated section JSONContent (with marks) to `reportSections.content`
7. Return response

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

- For each failing criterion that has an `ai_fix` comment: show a suggestion card
- Card displays: suggested text (or field value), reasoning, Apply/Dismiss buttons
- **Narrative suggestions**: "Apply" scrolls to the inline mark in editor; "Dismiss" calls `stripSuggestionMarksById()` and updates comment status to `dismissed`
- **Structured field suggestions**: "Apply" calls section update with the field path + new value; "Dismiss" just dismisses the comment

### 6. DB migration

Add `suggestionStatus` column to `criteriaEvaluations`:
```sql
ALTER TABLE criteria_evaluations
  ADD COLUMN suggestion_status text DEFAULT NULL;
-- Values: null (no suggestion), 'pending', 'accepted', 'rejected'
```

This tracks per-criterion whether a suggestion exists and its lifecycle, avoiding extra queries to the comments table.

---

## Key Files

| File | Role |
|------|------|
| `src/lib/ai/suggest.ts` | **NEW** — Core generation logic |
| `src/lib/ai/suggest-prompts.ts` | **NEW** — Prompt templates |
| `src/app/api/reports/[reportId]/suggestions/route.ts` | **NEW** — API endpoint |
| `src/lib/tiptap/suggestion-inject.ts` | **EXISTING** — `injectSuggestionMarks()`, `stripSuggestionMarksById()` |
| `src/lib/tiptap/suggestion-marks.ts` | **EXISTING** — Mark definitions, TrackChanges extensions |
| `src/lib/tiptap/suggestion-action-widgets.ts` | **EXISTING** — Accept/Ignore inline buttons |
| `src/lib/ai/evaluate.ts` | **EXISTING** — Pattern to follow for LLM call |
| `src/lib/ai/section-context.ts` | **EXISTING** — `contextForPrompt()` reused for suggestion prompt |
| `src/providers/report-provider.tsx` | **MODIFY** — Expose `generateSuggestions(section)`, loading state per section |
| `src/components/report/sections/section-shell.tsx` | **MODIFY** — Per-section **Suggest fixes** button (only place in app chrome) |
| `src/components/report/criteria-sheet.tsx` | **MODIFY** — Suggestion cards in panel |
| `src/db/schema/index.ts` | **MODIFY** — Add `suggestionStatus` column |

---

## Handling Structured Fields (non-Tiptap)

For sections like Analyze (6M fields, rootCause, impactAssessment) and Improve (correctiveActions array):

- The LLM sets `targetField` to the dot-path (e.g., `"sixM.measurement"`, `"rootCause.primaryLevel1"`)
- No Tiptap marks are injected (these aren't narrative fields)
- The suggestion lives in the `comments` table with `contentPath = targetField`
- The criteria panel shows the suggestion inline with an "Apply" button
- "Apply" does: `updateSection(section, prev => lodash.set(prev, targetField, replacementText))`

---

## Re-run Policy: Block While Pending

If the user tries to run **Suggest fixes** again while pending suggestions exist for that section:
- **Block suggestion generation** — the endpoint returns an error/warning: "Pending suggestions exist. Accept or dismiss them before generating new ones."
- The per-section **Suggest fixes** button is disabled (or shows a tooltip) while that section is generating suggestions or while any `suggestionStatus === 'pending'` exists **for that section**.
- This avoids the complexity of stripping/superseding marks and prevents confusing overlapping suggestions.

**Evaluation itself is NOT blocked** — the user can always re-evaluate criteria (traffic lights update). Only the suggestion generation step is gated on no pending suggestions.

Implementation:
- Before calling `/suggestions`, check: are there any `ai_fix` comments with `status='open'` for these sections?
- If yes, return `{ blocked: true, reason: "pending_suggestions" }`
- Client shows toast: "Accept or dismiss existing suggestions before generating new ones"

---

## Accept/Dismiss Animation (Fade)

When user clicks "Accept" on an inline suggestion:
1. The green `suggestionInsert` text loses its highlight (mark removed → becomes normal text)
2. The red `suggestionDelete` text fades out via CSS transition (`opacity: 1 → 0` over 200ms, then `max-height: 0` collapse)
3. After transition completes, the delete-marked nodes are actually removed from the doc

Implementation:
- Add CSS: `.suggestion-delete-fading { opacity: 0; transition: opacity 200ms ease-out; }`
- On accept: first add a `fading` class to the delete marks, then after 200ms timeout, perform the actual mark removal and content splice
- The `onAccept` callback in `suggestion-action-widgets.ts` already exists — extend it with the animation step before the DOM mutation

When user clicks "Dismiss":
- Green insert text fades out (same 200ms pattern), red delete text returns to normal (loses strikethrough)
- Uses `stripSuggestionMarksById()` after the fade transition

---

## Stale Content Handling

Between evaluation completing and suggestions being applied, the user may have edited the section:
- Each suggestion stores `evaluatedContentHash` (same hash used by eval dedupe)
- Before injection, compare current section hash with the hash at eval time
- If changed: skip injection, mark suggestion as stale, show "Content changed — re-run evaluation" in UI

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
