# Targeted Edits Plan — stopping whole-section rewrites

Status: proposed (not started)
Owner: TBD
Related: `docs/suggestion-system-analysis.md`, `docs/suggestion-agent-plan.md`

## The complaint

Two user-facing symptoms, one shared root cause.

**Symptom 1 — "the suggestion erased my text and wrote new text instead of making a
targeted edit."** A section already has prose. The AI proposes a change. Instead of a
surgical insert/replace, the whole paragraph (or the whole field) is struck through and
replaced.

**Symptom 2 — "I asked for an update to a draft and now I have two cards, and the first
one is pointless."** Draft a section via chat, then say "update the draft" before
accepting. Two `ai_redraft` cards now exist on the same field. Accepting the first is
wasted work because the second replaces the whole field again.

**Shared root cause:** the full-field replacement path (`draft_field` → `ai_redraft`) is
fire-and-forget. It has no relationship to the field's current content, and no
relationship to anything already pending against that field. The targeted-edit path
(`propose_edit` / `ai_fix`) is guarded in chat but not in AI Check, and every one of its
failure modes is explicitly routed into a full rewrite.

---

## Diagnosis

### Cause A — the AI Check path has no size guard at all

`checkProposedEdit` (`src/lib/ai/chat/propose-edit.ts:52-90`) rejects any edit whose
`deleteText` covers more than `REDRAFT_COVERAGE_THRESHOLD` (0.5) of the field. Its only
consumers are `src/lib/ai/chat/tools.ts` and `src/lib/charts/plot-measurements.ts`.

The AI Check suggestion path never calls it. `generateSuggestionsForSection`
(`src/lib/ai/suggest.ts:452-489`) and the route
(`src/app/api/reports/[reportId]/suggestions/route.ts:221` rich, `:288` plain) gate
**only** on locate status — `not_found` / `ambiguous` / `cross_cell` / `bad_scope`.

A suggestion with `anchorText` = the whole paragraph and `deleteText` = that same
paragraph locates uniquely, passes every gate, and lands as an `ai_fix` that wipes the
paragraph. Structurally it *is* a targeted edit; it just targets everything. The prompt
says "Keep edits minimal" (`src/lib/ai/suggest-prompts.ts:66`) and nothing enforces it.

**Net: chat is guarded at 50% coverage, AI Check at 100%.**

### Cause B — the chat prompt funnels every failure into `draft_field`

Four separate escape hatches all terminate in a full rewrite:

| Location | Text |
|---|---|
| `system-prompt.ts:246` | "ENOUGH … draft it now with draft_field" — no distinction between an empty field and one the engineer already wrote |
| `system-prompt.ts:254` (rule 3) | "If propose_edit fails twice on the same prose spot, switch to draft_field" |
| `system-prompt.ts:257` (rule 6) | "propose_edit refuses changes that rewrite most of a field (`too_large`) — that is the signal to use draft_field" |
| `propose-edit.ts:123` | the repair hint itself ends "…or use draft_field for an explicit full replacement" |

`propose_edit` is fragile by design: it needs a verbatim, *unique*, whitespace-normalized
anchor. Misses are common, and every miss is a funnel into a rewrite.

Note the table path was already hardened against exactly this — rules 2 and 4 say "do not
fall through to draft_field" for tables, and `edit_table` exists precisely so table
changes stay incremental. **Prose never got the same treatment.**

### Cause C — `draft_field` has no preconditions

`src/lib/ai/chat/tools.ts:1802-1910` validates: field name resolves, no table in a plain
field, no markdown images, results-matrix inventory. It never checks whether the field is
non-empty, whether the engineer asked for a rewrite, or whether the draft preserves
existing content. The description says "use this for empty fields, substantial rewrites"
— pure suggestion, unenforced.

### Cause D — the preview amplifies

`buildRedraftPreviewDoc` (`src/lib/tiptap/redraft-preview.ts`) renders the entire old
content struck through with the replacement highlighted, so even a *warranted* rewrite
looks maximally destructive — and it silently drops inline images and already-filled
placeholders in the parts that did not need to change.

(An earlier draft of this plan also listed the 0.5 coverage threshold as a cause. It is
not — see "On the 0.5 threshold" below.)

### Cause E — duplicate drafts on one field (Symptom 2)

`draft_field` inserts a new `ai_redraft` comment with no supersede, no dedupe, and no
check for an existing open redraft on the same field. Four consequences:

1. **The queue surfaces the wrong card first.** Chat redrafts are written with
   `evaluationId: null` (`tools.ts:1907`). In `sortedOpenSuggestionsForSection`
   (`src/lib/ai/suggestion-gating.ts:349-377`) both drafts fall to priority 3 with an
   empty criterion key, so the tie-break is `a.createdAt.localeCompare(b.createdAt)` —
   **ascending**. `activeSuggestionForSection` therefore surfaces the *older, superseded*
   draft as the active card. The product steers the user to the pointless one.

2. **Neither card is marked stale.** `fieldHashAtSuggestion` snapshots the field's hash at
   creation (`src/lib/suggestions/validate-suggestion.ts:99-113`). Draft 1 was never
   accepted, so the field never changed, so both drafts carry the same hash H₀ and both
   report `documentChanged: false`. Nothing hints that one obsoletes the other.

3. **Accepting in either order is destructive.** Redrafts hardcode `canApply: true`
   (`validate-suggestion.ts:106-113`). Accept #1 → field becomes R1 → #2 now shows
   `documentChanged: true` and renders a warning banner
   (`src/components/report/suggestion-card.tsx:394-399`), **but the Accept button stays
   enabled** (`:435` — `disabled={pending || !canResolve || !validation.canApply}`), so a
   click replaces the field with R2 and discards R1. Accept #2 first and #1 remains fully
   applicable, silently reverting to the older draft. *There is no ordering that gives a
   sensible result.*

4. **The model may not know it is revising.** `context-map.ts:127-131` exposes only a
   *count* of open suggestions, never their content, and `read_section` returns the
   committed section — still the pre-draft state. Within one session the model sees R1 in
   its own tool-call history, so "update the draft" usually works by luck. After a reload,
   a new session, or context summarization it is gone, and R2 is drafted from scratch
   against the original text, losing whatever the user liked about R1.

### Cause F — images are a silent casualty, and the guard makes it worse

Images are not a separate problem; they are the most *destructive* instance of this one.
Text can be retyped. A figure cannot.

**F.1 — `draft_field` destroys existing figures with no server-side check.**
`applyRedraftToSection` (`src/lib/suggestions/apply-redraft.ts`) sends the redraft markdown
through `markdownToDoc()`, which produces a doc built purely from that markdown. Any
`imageInline` node in the old field is gone. `draft_field` (`tools.ts:1802-1910`) checks
`markdownHasImage(markdown)` — that the *new* markdown does not contain markdown image
syntax — but never checks whether the **target field currently contains images**. The
system prompt warns twice (`system-prompt.ts:232`, `:236` — "A full rewrite of a field that
already has images will drop those images") and nothing enforces it.

**F.2 — the coverage guard's denominator counts an image as one character.**
`flattenForAnchor` (`locator.ts:44-45`) flattens each inline atom — image, equation — to a
**single space**. `checkProposedEdit` computes coverage as
`collapseWhitespace(deleteText).length / collapseWhitespace(fieldPlainText).length`, so a
field with three figures and two sentences has a tiny denominator.

The consequence is a live pipeline to image destruction:

> image-heavy field → engineer asks for a small text change → the modest `deleteText` is a
> large fraction of the deflated denominator → `too_large` → the hint and rule 6 both say
> "use `draft_field`" → `draft_field` replaces the field → **every figure is deleted.**

The guard that exists to prevent rewrites is currently *causing* the worst rewrites. This
was originally the argument for fixing the funnel (2.2) ahead of the threshold. Phase 3
resolves it more directly: once a draft applies as a diff, reaching `draft_field` no longer
destroys anything, so the chain is broken at its end rather than its middle. **Until PR 2
lands, this pipeline is live** — see "Still broken after PR 1".

**F.3 — dedicated image tools are fine and should stay out of scope.**
`insert_image` / `remove_image` (`tools.ts:1170`, `:1497`) create `ai_fix` comments
carrying `insertImage` / `removeImage` payloads, and `validate-suggestion.ts:134-144`
already guards them against a non-rich target. These are correct targeted operations. The
Phase 1 supersede rule must therefore scope to `ai_redraft` only, or it would wipe out
pending image suggestions.

The cross-interaction is worth checking but appears already handled by Phase 1.3: an open
`insert_image` fix plus a new `draft_field` on the same field → accept the draft first and
the image fix probes `not_found` (correctly blocked); accept the image first and the draft
is now hash-stale, which 1.3 blocks. Add a test.

---

## On the 0.5 threshold vs. the 20-char coalescing gap

Two knobs now exist. They do **not** interact, they apply to different paths, and conflating
them would break the rewrite feature.

### They operate on different paths and different scales

| | coverage 0.5 | coalescing gap 20 |
|---|---|---|
| **Path** | `ai_fix` from AI Check / `propose_edit` | planner output from `draft_field` |
| **Input** | an edit the LLM authored directly | a diff computed from old vs. new |
| **Question it answers** | "is this one change too big to call *targeted*?" | "are these two changes really one change?" |
| **Effect** | reject the suggestion | merge two operations into one |

The coalescing gap never runs on the AI Check path — those edits come from the model, not
from a diff — so the 20-char gap does not affect the 0.5 threshold at all. They are
complementary controls at different scales, not two settings for the same thing.

### Per-operation, not aggregate — yes

**Apply the coverage check per operation.** Legibility is a property of an individual
operation, not of a suggestion's total footprint:

- One operation deleting 60% of a field is a single unreviewable blob. Reject it.
- Six operations deleting 10% each is six legible changes that happen to touch 60% of the
  field. That is "a lot of changes", which is fine — the complaint was never about volume,
  it was about *unreviewable wholesale replacement*.

An aggregate check would reject the second case, which is exactly the behaviour we want to
allow. Per-operation is the correct shape.

### But do not gate planner output with it

This is the trap, and it follows directly from 3.2b. A genuine rewrite **coalesces to one
operation at ~82% coverage** (case C). A per-operation 0.5 gate applied to planner output
would reject it — breaking the feature the user explicitly asked for.

The two paths carry different contracts:

- **`ai_fix`** — the model was asked for a *minimal edit for one criterion*. A 60% delete
  breaks that contract. **Reject.**
- **planner output** — the user asked for a draft or rewrite. Coverage *describes* what
  changed; it is not a violation. **Never reject; label only.**

So coverage on planner output becomes a telemetry signal and, optionally, UI copy ("this
draft replaces most of the field") — never a gate. This is already how 2.0 is scoped.

### Resulting rules

1. Coverage 0.5, **per operation**, enforced on `ai_fix` only.
2. Coalescing gap 20, applied to planner output only.
3. Planner output is never coverage-gated.

Everything below about *why 0.5 and not 0.35* still applies, and applies to rule 1 only.

## Why 0.5 and not 0.35

**Recommendation: keep 0.5. Do not lower it.** An earlier draft of this plan proposed 0.35
for the AI Check guard; that was a guess and thinking it through it is the wrong lever, and
shipping it while the `too_large` → `draft_field` funnel is live would make things actively
worse.

Three reasons:

1. **Lowering it today increases rewrites.** Every `too_large` result currently funnels
   into `draft_field` (Cause B). A lower threshold produces *more* `too_large` results,
   therefore *more* full-field rewrites — the exact thing we are trying to stop. The
   threshold is only safe to touch once reaching `draft_field` is harmless, i.e. after
   Phase 3.

2. **Going from no guard to 0.5 is the entire win.** The AI Check path has *no* coverage
   check at all (Cause A). 100% → 50% is the change that matters. 50% → 35% is a rounding
   error against that.

3. **A fixed ratio is the wrong shape anyway.** On a short field — one sentence, ~80 chars
   — a perfectly legitimate targeted fix trivially exceeds 35% or even 50%. On an
   image-heavy field the denominator is deflated (F.2). Tightening a ratio that is already
   mis-shaped just produces more false positives.

If the guard needs refinement later, change its *shape*, not its number:
- **Absolute floor:** skip the ratio check when `deleteText` is under ~200 chars. A short
  delete is a targeted edit regardless of how small the field is.
- **Real denominator:** count inline atoms as more than one character when computing the
  denominator, so image-heavy fields are not artificially over-triggered.

Both are cheap and both fix real false positives. Neither is a threshold change. Neither is
urgent: under Phase 3 the coverage check governs only the `ai_fix` accept/reject gate, and
the knob that actually shapes what the user sees is the **coalescing gap** (3.2b), not this
ratio.

---

## Plan

> The phases below are organised by *problem*, not by ship order.
>
> Ship order: **PR 1** = 1.1 + 1.2 + 1.3 + 2.0 + 2.1 + 2.4. **PR 2** = Phase 3.
>
> Three items originally planned here (1.4, 2.2, 2.3) were **dropped** because Phase 3
> removes their reason to exist; they are recorded in "What Phase 3 subsumes" and not
> repeated as work. See "Revised sequencing: committing to Phase 3".

### Phase 1 — duplicate drafts + data loss (ship first, ~half a day)

Independent of everything else. 1.3 is a genuine data-loss bug.

**1.1 Supersede on draft.**
In `draft_field`'s `execute` (`tools.ts:1878`, immediately before the `db.insert`), find
open `ai_redraft` comments matching `(reportId, section, contentPath = resolvedField)` and
close them.

`commentStatusEnum` (`src/db/schema/index.ts:86`) is `open | resolved | dismissed`. Two
options:
- **Fast:** reuse `dismissed`, and record `supersededBy: <newSuggestionId>` in the redraft
  payload (`ParsedAiRedraftPayload`, `suggestion-gating.ts:307-315`) so the audit trail
  explains why.
- **Clean:** add a `superseded` enum value (Drizzle migration) so the audit log
  distinguishes "engineer rejected this" from "the AI replaced it."

Recommend `superseded` — this is a regulated-document product and `dismissed` carries a
human-intent meaning in the audit trail that would become a lie.

Do **not** supersede `ai_fix` comments — a targeted fix and a full draft can legitimately
coexist, and `ai_fix` rows carry an `evaluationId` tied to a criterion.

**1.2 Fix the redraft tie-break.**
In `sortedOpenSuggestionsForSection` (`suggestion-gating.ts:365-376`), when both comments
are `ai_redraft` on the same `contentPath`, sort **descending** by `createdAt` so the
newest draft is the active card. Correct ordering even with 1.1 in place (belt and braces
if a supersede write fails).

**1.3 Block accept on a stale redraft.**
In `validateSuggestionLocate` (`validate-suggestion.ts:99-113`), set
`canApply: !documentChanged` for `ai_redraft` instead of the unconditional `true`. The
card already renders `suggestionStaleMessage(validation)` when `!canApply`
(`suggestion-card.tsx:264-267`) and already disables Accept at `:435`, so this needs no UI
work — but check the copy reads sensibly for a redraft, and keep the existing
`documentChanged` banner at `:394` for the case where the two now coincide.

This is the data-loss fix: it closes "accept #2, then accept #1, silently revert."

**Migration note:** existing open `ai_redraft` rows have a `fieldHashAtSuggestion` that
may already be stale. After 1.3 those become non-applicable rather than silently
destructive — correct, but users with old pending drafts will see them go read-only.
Acceptable; mention in release notes.

**Tests**
- `tools.test.ts` (or a new `draft-field-supersede.test.ts`): two `draft_field` calls on
  the same field → first comment is `superseded`, second is `open`. Two calls on
  *different* fields → both stay `open`. A `draft_field` next to an open `ai_fix` → the
  `ai_fix` is untouched.
- `suggestion-gating.test.ts`: two open redrafts on one field → `activeSuggestionForSection`
  returns the newer.
- `validate-suggestion.test.ts`: redraft with a mismatched `fieldHashAtSuggestion` →
  `canApply: false`; matching hash → `canApply: true`.
- E2E (`e2e/report-chat.spec.ts` is stub-chat, so likely a component test instead): accept
  a superseded draft is not offered.

### Phase 2 — guards and instrumentation (2.1 + 2.4 ship in PR 1; 2.2 + 2.3 dropped)

**2.0 Instrument — re-scoped.** `src/lib/analytics/events.ts:11-13` has
`ai_suggestion_generated / accepted / dismissed` with no kind breakdown.

The original purpose was threshold tuning. **That purpose is retired** — at this user count
a week of data is noise, not a distribution (see Revised sequencing). The surviving purpose
is a **correctness canary for the diff planner**:
- kind (`ai_fix` vs `ai_redraft`) and `coverage` on `ai_suggestion_generated`
- operation count per composite suggestion, once 3.4 exists
- diffs that change more than a large fraction of a field, or that remove a block containing
  an image or a filled placeholder — these are bug signals, and unlike a coverage
  distribution they are readable at n=5 users
- accept/dismiss rate split by kind

Ship in PR 1 so the signal exists before the planner lands.

**2.1 Extend the coverage guard to AI Check.**
In `suggestions/route.ts`, after the probe passes (`:221` rich, `:288` plain), compute
`collapseWhitespace(deleteText).length / collapseWhitespace(fieldText).length` and drop
above threshold with a new `SuggestionDropReason` value `too_large`
(`src/lib/ai/suggest.ts:35-44`).

Use the **same 0.5 threshold as chat**, reusing `REDRAFT_COVERAGE_THRESHOLD` rather than
introducing a second constant, and apply it **per operation** (see "On the 0.5 threshold vs.
the 20-char coalescing gap"). Skip the guard for scoped (cell / list-item) edits, same as
`checkProposedEdit` does. Do **not** apply it to planner output.

Optionally: instead of dropping outright, re-call the model once for the affected criteria
with a repair hint. Cheaper alternative — just drop; the criterion stays red and the user
can re-run AI Check.

> **2.2 (stop the prompt hints pointing at `draft_field`) and 2.3 (gate `draft_field`
> server-side) were dropped.** Both fenced in a hazard that Phase 3 removes: once a draft
> applies as a diff it is not destructive, so steering the model away from `draft_field` —
> or gating it — is pure friction. See "What Phase 3 subsumes".

**2.4 Server-side anchor repair.** On `not_found`, the server has the full field text —
attempt a fuzzy / normalized-substring snap before reporting failure. Most `draft_field`
fallbacks are triggered by anchors that were 95% correct. This removes the *reason* to
fall back, which is more durable than forbidding the fallback.

### Phase 3 — diff-based redraft (structural, largest payoff)

When a rewrite genuinely is the right operation, do not *apply* it as one. Diff old vs. new
and apply the result as a set of targeted operations.

- Unchanged content is never touched → inline images and filled placeholders survive.
- The preview shows only what actually changed → the "it erased my text" perception goes
  away even in the cases where a rewrite is correct.
- **"Update the draft" becomes coherent:** R2 applies as an incremental diff against R1
  rather than a second full replacement.

#### 3.1 The engine is a planner, not a new apply path

The single most important design constraint. The diff engine must **not** invent a new way
to mutate documents. It derives a list of *existing* operation types, and every one of them
is applied by code that already exists and is already tested:

| Change detected | Emitted as | Applied by |
|---|---|---|
| Text changed inside a paragraph / list item | `SuggestionEdit` (anchored) | `applyEditToRichDoc` (`locator.ts:1209`) |
| Table cells / rows / columns changed | `TableOperation` (`edit_cells`, `insert_rows`, `delete_rows`, `insert_column`, `delete_column`) | `applyTableOperation` (`table-operation.ts:252`) |
| Figure added / removed | `SuggestionImageInsert` / `SuggestionImageRemove` | existing image path (`image-insert.ts`) |
| Whole block added / removed | block-level insert / delete `SuggestionEdit` | `applyEditToRichDoc` |

**This is what the table tool calls are for.** An earlier draft of this plan proposed
block-level diffing with a table treated as one block. That was wrong: a draft changing one
cell would emit "replace the whole table," which is the exact bug being fixed, scoped to
tables — and it would bypass `edit_table`, duplicating logic that already exists. Under the
planner model `edit_table` is not bypassed, it is the **compilation target**. Table diffing
reduces to "compute the row/cell delta between the old and new table," which is
well-defined, and `captureTableOperationSnapshots` (`table-operation.ts:194`) already exists
for the staleness/safety half.

Corollary: `draft_field` and `edit_table` stop being rival paths. `draft_field` becomes the
*authoring* interface (say what the field should contain) and the planner decides the
minimal operations, including table operations, to get there.

#### 3.2 Granularity is per block type, not global

Also retired from an earlier draft: "block-level first, sentence refinement later."

With tables handled by decomposition (3.1), the granularity question only applies to prose —
and there block-level is **insufficient**. A paragraph in which one sentence changed would
still be struck through whole, which is the original complaint restated. Prose needs
intra-block text diffing emitted as anchored `SuggestionEdit`s, which `locator.ts` already
supports.

- **table block** → `TableOperation` delta
- **paragraph / list item** → intra-block text diff → anchored edits
- **image** → image ops
- **block wholly added or removed** → block insert / delete

#### 3.2b How small do the operations actually get? (measured)

"One big edit is bad, forty tiny ones are worse" is the real risk, so this was measured
rather than argued. Word-level LCS diff over realistic report prose, counting hunks at
several **coalescing gaps** — the number of unchanged characters that must separate two
changes before they stay separate operations rather than merging into one:

| case | gap=0 | gap=8 | **gap=20** | gap=50 | coverage |
|---|---|---|---|---|---|
| D. one sentence altered in a 5-sentence paragraph | 1 | 1 | **1** | 1 | 2% |
| A. targeted fix (add a missing fact) | 2 | 2 | **2** | 2 | 5% |
| B. moderate revision ("update the draft") | 5 | 4 | **4** | 3 | 12% |
| C. full rewrite (same meaning, new words) | 10 | 4 | **1** | 1 | 82% |

*(Synthetic prose written for this test, not production data. It establishes the shape of
the behaviour; treat the exact counts as illustrative.)*

**The key result: coalescing is self-correcting, so no separate "is this a rewrite?" policy
is needed.** The two failure modes sit at opposite ends and the same knob fixes both:

- A **targeted change** has long unchanged runs between its edits, so its hunks never merge.
  Case A stays at 2 operations at every gap — the granularity is stable and cannot shred.
- A **rewrite** has changes packed densely with no long unchanged runs, so its hunks collapse
  into each other. Case C goes from 10 shredded word-swaps at gap=0 to **1** at gap=20.

That collapse is the desirable outcome, not a loss: a rewrite genuinely *is* one big change,
and representing it as one operation is honest. Case C's 82% coverage is exactly what the
Phase 2.1 coverage check flags — the two mechanisms agree independently, which is a good
sign that neither is arbitrary.

**Practical expectation.** Operations never cross block boundaries (3.2), and unchanged
blocks contribute zero. So the count scales with *how much actually changed*, not with field
size. A typical "update the draft" over a 4-paragraph section touching 2 paragraphs lands
around **4–8 operations** — reviewable as one card, and each one legible on its own.

**Recommendation: coalescing gap ≈ 20 characters**, and make it the tunable knob for this
system rather than the coverage threshold. It directly controls the thing the user perceives
(how chopped-up the review feels), where coverage only controls an accept/reject gate.
Gap=8 is visibly too shreddy on case C (4 fragments of a rewrite); gap=50 starts merging
genuinely separate edits in case B (3 instead of 4).

**Implementation note from the measurement:** when two hunks merge across a gap, the
unchanged bridge text between them **must be carried into both the delete and the insert
side** of the merged operation. The measurement script drops it (harmless for counting,
wrong as an edit) — the real implementation must not, or the bridge text is silently
deleted. Worth an explicit test.

#### 3.3 Module placement — new module (`src/lib/suggestions/diff-plan.ts`)

Settled in favour of a new module, on the codebase's own precedent rather than taste.

`locator.ts` and `table-operation.ts` are already split along exactly this line. Every
`locator.ts` export (`AnchorIndex`, `TextSlice`, `buildCollapsedToRawMap`,
`mapCollapsedRangeToRaw`, `flattenForAnchor`) concerns flattening a doc to text and mapping
offsets back; its one piece of knowledge is *how to locate a text span and splice it*.
`table-operation.ts` (`tableRows`, `rowCells`, `applyInsertColumn`) does pure structural tree
manipulation on coordinates — no flattening, no anchors. **Structural editing already lives
outside `locator.ts`.**

The planner owns a third, distinct piece of knowledge: *given old and new content, what is
the minimal set of operations*. DRY governs single-sourcing a piece of knowledge, not
minimizing file count; colocating unrelated logic is false DRY. `locator.ts` at 1,437 lines
with a load-bearing test suite is already at the limit of what one module should own.

The DRY obligation runs the other way, and 3.1 is where it is discharged: the planner must
**reuse every existing applier and operation type**, never reimplement one.

#### 3.4 Composite suggestions — one draft is one card

A draft producing 12 operations must render as **one card**, not 12. Today one comment row
equals one card.

`ParsedAiFixPayload` already carries `second` (`suggestion-gating.ts:286`) — a *secondary*
edit, parsed by `parseSecondEdit`. That is evidence the schema already wanted multi-op and
stopped at two for the citation split-edit case. Generalizing `second` into an ordered
operation list is the natural move and keeps one comment row per suggestion.

- **Atomicity — decided (D11):** build per-operation-capable, ship all-or-nothing. Each
  operation gets mark sub-id `${commentId}#${i}`, so the existing
  `acceptSuggestionMarksById` / `stripSuggestionMarksById` machinery supports per-operation
  review with no locator changes if we later enable it.
- **Ordering / interference:** operations must be applied in an order where earlier ones do
  not invalidate later ones' anchors. Apply bottom-up by document position, or re-locate each
  operation against the running document. Bottom-up is simpler and sufficient given
  operations never overlap by construction.
- **Partial failure — see Q2.** Default: fail the whole apply, report which operation failed.
- **Preview:** `buildRedraftPreviewDoc` (`redraft-preview.ts`, 56 lines) currently renders
  whole-content strikethrough. It should instead compose the existing per-operation
  suggestion marks, which is what makes the preview show only real changes.

#### 3.5 Draft-on-draft context

Expose the open redraft's markdown to `read_section` (or a dedicated `read_pending_draft`
tool) and prompt the model to revise *that* text rather than re-derive from the committed
section. This fixes Cause E.4 — the reload / new session / summarization case where the
model cannot see its own pending draft.

With 3.1–3.4 in place this is what makes "update the draft" behave: R2 is planned as a diff
against R1, so the second card is a small edit, not a second full replacement.

#### 3.6 Testing bar (non-optional — see "The real risk")

- **Round-trip property test** — the single highest-value test, and cheap: for any
  `(old, new)` pair, applying the planned operation list to `old` must produce exactly
  `new`. Extend `locator-gate-apply.property.test.ts`'s harness.
- **Fixtures per atom type:** table cells, inline images, OMML equations, placeholder
  tokens, nested lists, and formatting marks spanning a diff boundary.
- **Idempotence:** planning a diff from `old` to `old` must produce zero operations. Guards
  the most likely class of spurious-edit bug.
- **Flag:** ship behind a flag with the wholesale-replace path retained, so a bad diff can be
  disabled without a redeploy.

---

## What the experience looks like after PR 1

PR 1 is 1.1 + 1.2 + 1.3 + 2.0 + 2.1 + 2.4. Worth being precise about how much it actually
buys: it substantially fixes **Symptom 2**, and takes the sharpest edge off **Symptom 1**
without solving it.

### Fixed

- **"Update the draft" produces one card, not two.** The superseded draft disappears from
  the queue. No more clicking a pointless card.
- **The card you see is the current one.** The tie-break fix means even if a supersede
  write fails, the newest draft is what the sidebar offers.
- **You cannot silently revert your own work.** Accepting a draft that was created against
  older field content is blocked with an explanation instead of destructively applied.
  This is the actual data-loss fix.
- **The audit trail explains itself.** A `superseded` status distinguishes "the engineer
  rejected this" from "the AI replaced it with a newer draft" — which matters for a
  regulated document.
- **The worst AI Check rewrites stop (2.1).** An `ai_fix` that deletes more than half a
  field is now dropped instead of applied. The single "targeted" edit that wipes a whole
  paragraph — the sharpest form of Symptom 1 — is gone.
- **Fewer failed anchors (2.4).** Near-verbatim anchors snap instead of failing, so fewer
  suggestions are silently dropped and the model has less reason to escalate.

### Still broken after PR 1

- **Symptom 1 is only half-addressed.** 2.1 catches edits *over* the 0.5 line; a suggestion
  that rewrites 45% of a field still applies as-is and still reads as a rewrite. And an
  over-threshold edit is now simply **dropped**, so the criterion stays red with no fix
  offered — a silent quality regression traded for a loud destructive one. Acceptable, but
  it is a trade, not a win.
- **Chat still rewrites filled fields.** All four prompt funnels into `draft_field`
  (Cause B) remain — 2.2 and 2.3 are deliberately dropped rather than done — and
  `draft_field` still has no preconditions (Cause C). Asking for a small change to a written
  section can still come back as a full replacement. **This is the largest remaining gap and
  it is by design: it is what PR 2 exists to fix.**
- **Figures are still destroyed.** With 1.4 dropped, `draft_field` still silently deletes
  every inline image in the field it replaces (Cause F.1) until PR 2 lands. This is the
  single most consequential thing left open, and the main argument for not letting PR 2 slip
  far behind PR 1. If PR 2 is delayed beyond a few weeks, reconsider shipping 1.4 as an
  interim guard.
- **"Update the draft" still rewrites everything.** You get *one* card instead of two, but
  that one card is still a full-field replacement of your original text, and R2 is still
  drafted from scratch rather than as an edit to R1. The confusing duplicate is gone; the
  destructive rewrite is not.
- **Drafts still drop filled placeholders.** Accepting any `ai_redraft` still overwrites the
  whole field, so a placeholder you already filled in an otherwise-untouched paragraph is
  still lost. Only Phase 3 fixes that.
- **The image-destruction pipeline (F.2) is fully open.** An image-heavy field still
  over-triggers `too_large` on the deflated denominator, the hint still says "use
  `draft_field`", and `draft_field` still wipes the figures. With both 1.4 and 2.2 dropped,
  nothing in PR 1 interrupts this chain.
- **A newly stale draft is a dead end.** After 1.3, a draft blocked by `canApply: false`
  gives the user no path forward except dismiss-and-ask-again. Consider adding a "redraft
  against current content" action in the same PR, or at minimum make the stale copy tell
  them to ask the assistant again. *Flagging this as the most likely PR 1 UX regression.*

---

## Revised sequencing: committing to Phase 3

The original phasing gated Phase 3 behind "only if the remaining rewrite volume justifies
it." Two objections retire that:

1. **Telemetry-gating does not work at this user count.** The original plan said "land 2.0,
   let a week of data accumulate, then tune." With a handful of active users a week of data
   is noise, not a distribution. Waiting on it buys a delay and no knowledge.
2. **Phase 3 is not speculative.** It is the only phase that fixes the actual complaint
   rather than fencing it in. Everything in Phase 2 is a guardrail around a hazard Phase 3
   removes.

**Decision: commit to Phase 3 now.** But "build all three phases together" is the wrong
conclusion, because Phase 3 *deletes the reason for* several Phase 1/2 items. Building them
first is not just wasted work — under Phase 3 some of them become actively wrong.

### What Phase 3 subsumes

Phase 3 makes a full-field draft **non-destructive**: it applies as a per-block-type diff
(3.2), so untouched blocks keep their text, their figures, and their filled placeholders.
That inverts the premise of several planned items.

| Item | Fate under Phase 3 |
|---|---|
| **2.2** stop prompt hints pointing at `draft_field` | **Drop.** `draft_field` is no longer destructive, so the "funnel" is no longer a hazard. You may even *want* it as the easy path. |
| **2.3** gate `draft_field` server-side | **Drop.** Gating a safe operation is pure friction. The `reason` enum idea goes with it. |
| **1.4** refuse `draft_field` on image-bearing fields | **Drop.** A blanket refusal would block legitimate drafts that Phase 3 preserves figures through, and figure removal becomes a visible, rejectable operation rather than a silent one (D8). |
| **1.3** block accept on stale redraft | **Softens.** A stale draft can be re-diffed against current content instead of hard-blocked — which also resolves the "dead end" UX regression flagged earlier. Ship the block now, relax it in Phase 3. |
| **1.1 / 1.2** supersede + tie-break | **Keep as-is.** Still correct: one card per field is right whether the draft applies wholesale or as a diff. |
| **2.1** coverage guard on AI Check | **Keep.** `ai_fix` is a separate path; a whole-paragraph anchored delete is still a whole-paragraph delete. |
| **2.4** server-side anchor repair | **Keep.** Independent of how drafts apply, and it makes the diff engine's anchoring more robust too. |

### Revised order

**PR 1 — Phase 1.1, 1.2, 1.3 + 2.1 + 2.4.** Small, independent, none of it thrown away.
Critically, **1.3 is the safety net that makes Phase 3 debuggable**: it is the check that
catches a draft being applied against content it was not computed from.

**PR 2 — Phase 3.** The diff planner (3.1–3.3), composite suggestions (3.4), draft-on-draft
context (3.5), and the 1.3 relaxation that depends on it. Realistically splittable:
**2a** = planner + round-trip property test with the wholesale path still in place behind a
flag; **2b** = composite card UI, preview, and cutover. 2a is the risky half and is fully
testable without touching UI.

**Dropped: 2.2, 2.3, 1.4-as-written.** Do not build guardrails around a hazard being
deleted.

**Re-scope 2.0 telemetry.** Not for threshold tuning — useless at this volume. Keep it as a
**correctness canary for the diff engine**: log when a diff produces a change over some
fraction of the field, or removes a block containing an image or a filled placeholder.
That is a bug signal, and it is readable at n=5 users in a way that a coverage distribution
is not.

### The real risk, stated plainly

Phase 3 is not a bigger version of Phase 1. It is a different risk class.

The code it touches is the most bug-prone in the repo. `locator.ts` is 1,437 lines carrying
2,188 lines of tests — including a property test (`locator-gate-apply.property.test.ts`)
and *two* dedicated regression files (`locator-bugs.repro.test.ts`,
`accept-misplacement-repro.test.ts`). Files named `*-repro` exist because edits landed in
the wrong place in production. Diffing TipTap JSON across tables, inline images, OMML
equations, formatting marks, and placeholder tokens is harder than anchored matching, and
anchored matching already needed that much defensive testing.

**The failure mode changes shape.** Today's bug is *visible and reversible*: the user sees
a rewrite, is annoyed, and rejects the card. A diff bug is *silent and plausible*: a
paragraph is subtly altered or dropped in a way that reads fine in the preview and lands in
an approved, e-signed, exported regulated document. That is a materially worse failure in
this product.

Mitigations, non-optional:
- Extend `locator-gate-apply.property.test.ts` to the diff path: for any (old, new) pair,
  applying the generated diff to `old` must produce exactly `new`. This is the single most
  valuable test and it is cheap — it is a round-trip property.
- Explicit fixtures for every atom type: table cells, inline images, equations, placeholder
  tokens, nested lists, formatting marks spanning a diff boundary.
- Ship the diff behind a flag with the wholesale-replace path retained, so a bad diff can be
  turned off without a redeploy.
- Ship PR 1 *first* regardless. It is the safety net, and it makes PR 2's blast radius
  legible.

### Honest estimate

Phase 1 was "half a day." Phase 3 is **not** days. Given the atom types involved and the
testing bar this area demands, plan **1–2 weeks** including the property tests and fixtures.
That is still the right investment for the top product complaint — but it should be budgeted
as a project, not slipped in alongside PR 1.

---

## Decisions

Resolved during planning. Recorded with the reasoning so they are not relitigated.

**D1 — Diff granularity: per block type.** (3.2) Tables decompose into `TableOperation`s
rather than being replaced as blocks, so the question only applied to prose — where
block-level is insufficient because a one-sentence change would strike the whole paragraph.

**D2 — Module: new, `src/lib/suggestions/diff-plan.ts`.** (3.3) On the existing
`locator.ts` / `table-operation.ts` precedent: structural editing already lives outside the
locator.

**D3 — Coverage 0.5, per operation, on `ai_fix` only.** Keep 0.5 and reuse
`REDRAFT_COVERAGE_THRESHOLD`. Apply **per operation**, not to a suggestion's aggregate
footprint — legibility is a per-operation property, and six 10% operations are six legible
changes while one 60% operation is an unreviewable blob. **Never gate planner output with
it:** a genuine rewrite coalesces to one ~82% operation (3.2b), so a coverage gate there
would reject the feature the user asked for. On planner output coverage is a label and a
telemetry signal only. Full reasoning: "On the 0.5 threshold vs. the 20-char coalescing gap".

**D4 — The planner never declines to plan.** Resolved by measurement (3.2b): coalescing
collapses a rewrite into a single operation on its own, so the wholesale case falls out of
the same mechanism instead of needing a special path.

**D5 — `superseded` enum value, not reusing `dismissed`.** The migration is one Drizzle enum
addition. This is a Part 11 audit-trail product: recording "the AI replaced this draft" as
"the engineer dismissed this draft" writes a false statement about human intent into a
tamper-evident log. Cost is trivial, correctness is not optional. Check
`commentStatusEnum` consumers for exhaustive switches when adding the value.

**D6 — Supersede applies across chat sessions, report-wide.** Comment rows are report-scoped,
not session-scoped, and two live drafts on one field are equally confusing regardless of
which session produced them. Scope the query to
`(reportId, section, contentPath, kind = 'ai_redraft', status = 'open')` with no session
predicate.

**D7 — No payload version field needed for the operation list.** Add `operations?:
PlannedOperation[]` as an *additive optional* field. Old rows simply lack it, and
`parseAiFixCommentContent` already tolerates missing keys and falls back to plain text.
Readers prefer `operations` when present and fall back to `deleteText`/`insertText`/`second`
otherwise. `second` becomes sugar for a two-element list and can be dropped later.

**D8 — Figure removal inside a diff needs no special warning or refusal.** This is what the
planner buys: removing a figure becomes an explicit `SuggestionImageRemove` operation,
visible in the card and rejectable like any other operation. The Cause F problem was never
"drafts remove figures" — it was that they removed them *invisibly*. Once removal is a
reviewable operation, the special-case guard (1.4) is redundant, which is exactly why 1.4 is
dropped rather than reworked.

**D9 — Coalescing gap ≈ 20 characters, and this is the system's real tunable.** From the
3.2b measurement. Unlike the coverage ratio it is cheap to re-evaluate offline against
stored draft/section pairs once the planner exists.

**D10 — Drop the "real denominator" refinement.** It only mattered because an inflated
coverage ratio triggered the `draft_field` funnel; with the funnel harmless under Phase 3,
it is cosmetic.

**D11 — Composite accept: build per-operation-capable, ship all-or-nothing.**

The engine cost of per-operation accept is near zero and was the deciding fact.
`acceptSuggestionMarksById(doc, markId)` and `stripSuggestionMarksById(doc, markId)`
(`locator.ts:1334`, `:1377`) are **already keyed by mark id**, and
`acceptPendingImageSuggestions` / `dropPendingImageSuggestions` follow the same id. Today one
comment id serves as one mark id, which is why `second` is implicitly atomic.

So: give each planned operation its own mark sub-id (`${commentId}#${i}`) via
`InjectAttrs.id` (`locator.ts:172`). Per-operation accept then works with **no locator
changes at all** — it is the mechanism that already exists.

Ship v1 with an all-or-nothing Accept button (matches "accept this draft", avoids designing
partial-accept UI before anyone has asked for it), but with sub-ids in the data from day one
so enabling per-operation review later is a UI change, not a migration. Not doing sub-ids
now would be the expensive mistake.

**D12 — PR 1's stale-redraft dead end: copy-only.** The stale message should tell the user
to ask the assistant for a fresh draft; do not build a "redraft against current content"
action. Under Phase 3 a stale draft is re-diffable against current content, which dissolves
the problem properly — building an interim action would be throwaway work. **Conditional on
PR 2 following within a few weeks;** if it slips further, revisit this together with an
interim figure guard (the dropped 1.4).

---

## Open questions

Genuinely unresolved — each needs either a user conversation or code that does not exist yet.

**Q1 — Does per-operation review actually get enabled? (needs a design partner.)** D11 makes
it cheap, but cheap is not the same as wanted. In a regulated review workflow, "I accept 4 of
these 6 changes" may be exactly the interaction reviewers expect — or partial acceptance may
be undesirable because it produces text no one authored as a whole. **Recommendation:** ship
all-or-nothing, watch whether users dismiss whole drafts over one bad operation (the 2.0
telemetry will show this as a dismiss-rate spike on high-operation-count suggestions), and
ask two design partners directly. This is the question I would most want answered by a user
rather than by us.

**Q2 — Operation ordering under partial failure.** If operation 7 of 12 fails to locate at
accept time, does the whole draft fail? All-or-nothing implies yes, and that is the safe
default — but it means one drifted anchor kills an otherwise-good draft, which is the
failure mode that made `propose_edit` frustrating in the first place. **Recommendation:**
fail the whole apply and report *which* operation failed, but pair it with D11's sub-ids so
the eventual answer can be "skip that one operation." Revisit once Q1 is answered — the two
are the same question seen from different ends.

**Q3 — Is `markdownToDoc` lossless enough to diff against?** The planner compares the
current field doc to `markdownToDoc(draftMarkdown)`. If that conversion normalizes anything
the original doc expressed differently — mark boundaries, list attrs, table cell attrs — the
diff will report spurious operations on content that did not change. The 3.6 idempotence
test (`old → old` yields zero operations) will expose this immediately, but the *fix* may be
non-trivial. **Recommendation:** write that test first, before any planner code. It is
~20 lines and it derisks the largest unknown in PR 2. If it fails broadly, the diff may need
to run on markdown rather than on TipTap JSON, which would be a significant design change —
better to learn that in hour one than in week two.

**Q4 — What happens to an open composite suggestion when the user edits the field manually?**
Today `contentHashAtSuggestion` marks the whole suggestion stale. With N operations, some may
still locate cleanly. **Recommendation:** keep whole-suggestion staleness for v1 (consistent
with all-or-nothing), and note that per-operation staleness is the same design axis as Q1
and Q2. Do not solve it separately.
