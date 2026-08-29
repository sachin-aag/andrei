# Suggestions — principles, target state, and rebuild plan

Status: proposed (not started)
Owner: TBD
Related: `docs/suggestion-system-analysis.md`, `docs/suggestion-agent-plan.md`
Supersedes: the phase-by-phase version of this document (diagnosis-first; kept in git history)

---

## Why this is a rebuild and not a set of fixes

The top product complaint is that AI suggestions erase existing text and rewrite it instead
of making targeted edits. Around that sit a family of smaller complaints — duplicate draft
cards, drafts that silently drop figures and filled placeholders, cards that go dead after
you accept something else, drafts that quietly undo an edit you just accepted.

These read as separate bugs and are not. They are one design choice, made early and never
revisited:

> **A suggestion is stored as a frozen edit — a delete/insert pair anchored to text that
> existed when the model wrote it — plus a hash used to guess whether that past still
> resembles the present.**

Every symptom follows from that. A frozen edit cannot be re-derived, so when the document
moves the only options are *apply it blindly* or *refuse it*. Both are bad, and the system
does one or the other depending on path. A frozen edit also has no notion of what it was
computed *from*, so two suggestions cannot be reasoned about together, and a rewrite cannot
be distinguished from an edit except by inspecting its size after the fact.

Two constants already in the codebase are the right ideas applied in the wrong place:

- `REDRAFT_COVERAGE_THRESHOLD = 0.5` (`propose-edit.ts:20`) — used as a **reject** gate, on
  one path only, where it funnels failures into full rewrites.
- A change-coalescing distance — not yet implemented, but measured at ~20 characters
  (see [Evidence](#evidence-how-small-do-operations-get)).

Both are sound. Neither is doing its job. This plan keeps them, adds one more principle, and
puts all three in the one place where they belong.

---

## The three principles

Each answers exactly one question. They are orthogonal, and every path obeys all three.

### P1 — Late binding: store intent and its base, never a frozen diff

**Question: what does a suggestion *contain*?**

A suggestion record stores:

| field | meaning |
|---|---|
| `base` | the field content the model was looking at when it authored this |
| `intent` | the field content the model wants |
| metadata | criterion, reasoning, kind, author |

It does **not** store anchors, offsets, delete/insert spans, or a staleness hash. Those are
*derived*, at the moment the suggestion is rendered or applied, from `base`, `intent`, and
the field's content right now.

**Consequences worth stating plainly:**

- **Anchors become an authoring convenience, not a persistence format.** A model calling
  `propose_edit` still writes `anchorText` / `deleteText` / `insertText`. That anchor is
  resolved **once**, at write time, against `base` — the exact content the model read, where
  it is guaranteed to match — and the result is stored as `intent`. It is never matched
  again. The entire class of "anchor drifted, suggestion is now unusable" failures disappears
  because anchors do not survive past the write.
- **`propose_edit` and `draft_field` stop being different mechanisms.** One authors intent by
  describing a change, the other by stating the result. Both normalize to `intent`, and
  everything downstream is identical. There is one path to maintain, not two that diverge.
- **The staleness hash is deleted, not fixed.** A hash answers "did anything change?", which
  is not a useful question — the change may be in a different paragraph, or may be exactly
  what this suggestion wanted. P2 answers the useful question instead.

### P2 — Three-way merge: reconcile at the moment of use

**Question: what should this suggestion *do*, right now?**

Given `base` (what the model saw), `current` (what the field holds now), and `intent` (what
the model wants), compute a three-way merge. This is diff3, applied to document blocks
instead of source lines.

```
             ┌── current  (the user's edits, other accepted suggestions)
    base ────┤
             └── intent   (this suggestion)

    merge → merged content → diff(current → merged) → operations
```

- Regions only `current` changed → keep the user's version.
- Regions only `intent` changed → apply the suggestion.
- Regions **both** changed → conflict. Do not guess; surface it.

Re-run this whenever the field changes. It is a word-level diff over one field — cheap, and
memoizable on `(fieldHash, suggestionId)`.

**Consequences:**

- **"Stale" stops being a state.** A suggestion whose base is old is not broken; it is
  re-merged. What used to be a dead card is now a live card showing a smaller change.
- **Three outcomes replace one boolean**, and each is meaningful:

  | merge result | meaning | what the user sees |
  |---|---|---|
  | operations, no conflict | still applicable | a live card, contents refreshed |
  | **zero** operations | already satisfied | auto-resolve, no card |
  | conflict | genuinely contradictory | conflict card, explicit choice |

  Auto-resolve is worth calling out — today a suggestion whose point someone already
  addressed by hand keeps nagging until dismissed.
- **The merge, not the raw intent, is what gets applied or committed.** Agent chrome commits
  the merge, so a concurrent accept is preserved instead of clobbered. Conflicts do not
  commit; the model is told and re-plans.

### P3 — Operations are the unit of review

**Question: how is the change *presented*?**

The `diff(current → merged)` step is where the two existing constants finally do their job.
They shape presentation; neither is a gate.

**Segmentation — coalescing gap ≈ 20 characters.** Two changes separated by fewer than ~20
unchanged characters are one operation; further apart, two. This is the knob that controls
how chopped-up a review feels, and it is self-correcting at both ends
(see [Evidence](#evidence-how-small-do-operations-get)).

**Classification — coverage 0.5, per operation.** An operation whose delete covers more than
half its block is a *rewrite of that block*; at or under, an *edit*. This decides **which
renderer to use**, not whether the change is allowed:

| coverage | classified | rendered as |
|---|---|---|
| ≤ 0.5 | edit | inline tracked change — strikethrough + insertion in place |
| > 0.5 | rewrite | before/after block, labelled "Rewritten" |

This is the correction to how 0.5 is used today. As a reject gate it is actively harmful:
every `too_large` rejection is funnelled into `draft_field` (`propose-edit.ts:123`,
`system-prompt.ts:257`), so the guard against rewrites *causes* rewrites. As a classifier it
is right, because the thing an 82%-coverage change actually breaks is the **renderer** —
inline strikethrough of nearly a whole paragraph is unreadable, which is why warranted
rewrites look maximally destructive today.

Per operation, not per suggestion: six 10% operations are six legible changes; one 60%
operation is one blob. Aggregate coverage would wrongly flag the first.

**Applied uniformly.** These apply to the final diff, for every suggestion, from every path.
That is the whole point — today one constant guards one path and the other does not exist.

#### The operation is the unit of decision, at every scale

An operation is what a user accepts or rejects. A card is presentation and provenance ("this
came from one draft request"), not an atomic unit. Two scales, one rule:

| scale | today | under P2 |
|---|---|---|
| **within a card** — one draft → 12 operations | not possible; one comment = one mark id = one decision | accept or reject each; the rest re-merge |
| **across cards** — a section with 3 suggestions | `acceptAllSuggestions` applies recursively, each locate running against the doc after the previous apply (`bulk-suggestions.ts:79-142`) | same, and now the *previews* update too, not just the applies |

**The rule at both scales: apply one operation, re-merge everything else.** Sequential — the
second thing is never resolved against a document state that predates the first.

This is only affordable because of P2. Under a frozen diff, accepting operation 3 of 8 moves
the field and invalidates the stored anchors of 1, 2, and 4–8; you would have to re-locate
each and some would fail — which is exactly what made per-operation review look expensive.
Under P2 operations are not stored. Accepting one changes `current`, the card re-merges, and
seven operations come back out. **Invalidation is not possible, so partial acceptance costs
nothing beyond the UI to express it.**

#### Cards shrink; they do not fail

A card is a **live remainder**, not a fixed proposal. Accepting the clean operations leaves
the card showing only what is unresolved — typically a conflict — and it keeps re-merging.
There is no state in which one difficult operation blocks the eleven straightforward ones.

The card disappears when its operation set reaches zero, whether by acceptance, by conflict
resolution, or because the user's own edits made the point (P2's auto-resolve). A remainder
that the user does not want carries an explicit "dismiss the rest", so a single stubborn
conflict cannot pin a card open forever.

**Composition:** operations are derived from existing types (`SuggestionEdit`,
`TableOperation`, `SuggestionImageInsert/Remove`) and applied by existing appliers. The
planner emits; it does not mutate. See [The model](#the-model).

---

## The target experience

The primary deliverable. Each scenario states what the user sees and which principle makes
it so.

### Ordinary editing

**You ask for a small fix to a written paragraph.** One inline tracked change on the clause
that changed. The rest of the paragraph is untouched — not struck through, not re-rendered.
*(P3 segmentation: unchanged runs are not operations.)*

**You ask for a rewrite of a written paragraph.** One operation, labelled "Rewritten",
shown before/after rather than as inline strikethrough. Honest and readable. Figures,
equations, and filled placeholders in the *rest* of the field are untouched, because they
are outside the operation. *(P3 classification.)*

**You ask the AI to draft an empty section.** Unchanged from today: one operation inserting
the whole thing.

**You ask for a change and the field already says it.** No card. The merge produced zero
operations, so the suggestion resolved itself. *(P2.)*

### Concurrency — the cases that fail today

**You accept a suggestion while the agent is still working.** The agent's draft arrives
merged against your accepted edit. Your edit survives; the draft's changes to *other* parts
apply normally. If the draft contradicts what you accepted, you get a conflict card naming
both, not a silent revert. *(P2 — `base` is what the model read, so the divergence is
visible rather than masked.)*

> Today this is the worst bug in the system and it presents as the *safest*: the hash is
> snapped at write time, so a draft authored against pre-accept text renders
> `documentChanged: false` — fresh by every check — and accepting it silently reverts what
> you just accepted. Finishing *later* is more dangerous than finishing earlier.

**You have a pending fix on ¶3 and ask for a draft that also rewrites ¶3.** The draft is
merged against a base that includes neither. Non-overlapping parts compose. The overlap is a
conflict card. Nothing is silently orphaned. *(P2.)*

> Today: accept the draft and the fix's anchor is destroyed, leaving an `open` card that can
> never be applied — the fix evaporates with no notice. Accept the fix and the draft is
> blocked. No ordering works.

**You have a pending fix on ¶3 and ask for a draft of ¶2.** Both apply, in either order.
This already works and must keep working — it is the common case and P2 must not make it
noisier.

**You edit a paragraph by hand while a suggestion is open.** The card re-merges as you type
(debounced). If your edit made the point, it disappears. If it touched a different sentence,
the card narrows to what is still needed. If you rewrote the same sentence differently, you
get a conflict. *(P2.)*

**You accept a suggestion whose card was rendered before the document moved.** You always
apply what you are looking at. If a re-merge changes the operation set between render and
click, the card refreshes and asks again rather than applying something you did not review.

### Multiple suggestions

**You say "update the draft" before accepting.** One card, showing the delta from the
current draft. Not two cards; not a second full replacement. *(P1: R2's `base` is R1, so the
merge is incremental.)*

**Two suggestions touch one field.** Both stay live if they do not overlap. Accepting one
re-merges the other rather than killing it. Overlap is stated up front — "conflicts with 1
pending suggestion" — before you click, not discovered after.

**A suggestion proposes six changes and you want four of them.** Reject two, accept four.
The four apply; the card closes. No dismiss-and-ask-again. *(P3: the operation is the unit of
decision.)*

**One of the six conflicts with an edit you made.** The five clean ones apply on Accept. The
card stays, now showing one operation — the conflict — with keep-mine / take-theirs. Deal
with it now or later; it is a follow-up, not a blocker, and it does not hold the other five
hostage. *(P3: cards shrink, they do not fail.)*

**You press Accept all.** Each suggestion resolves against the document as it stands after
the previous one — the behaviour bulk apply already has, now with previews that track it as
well as applies.

### What stays the same

Accept/dismiss affordances, the review rail, criterion association, the audit trail, and
DOCX export are unchanged. This is a change to how a suggestion is represented and resolved,
not to the review workflow.

### What we are explicitly not building

- **Automatic conflict resolution.** Conflicts are surfaced, never guessed.
- **Cross-section suggestions.** One suggestion, one field, as today.
- **Reordering operations.** They apply in document order. No dependency graph, no
  user-chosen sequence.
- **Merging across suggestions.** Two suggestions are never combined into one card, even on
  the same field. Provenance stays intact for the audit trail.

---

## The model

### Suggestion record

```ts
type SuggestionRecord = {
  id: string;
  section: SectionType;
  targetField: string;
  base: JSONContent | string;     // field content the model read
  intent: JSONContent | string;   // field content the model wants
  kind: "ai_fix" | "ai_redraft";  // metadata only; no behavioural fork
  criterionKey?: string;
  reasoning: string;
};
```

Stored in the existing `comments` payload as additive optional fields. Old rows lack
`base` / `intent` and fall back to the current delete/insert path, so this ships without a
backfill. Base content is stored inline rather than referencing `sectionContentVersions` —
that table is the audit chain and product behaviour should not depend on it.

Base is captured **when the model reads the field**, not when the comment row is written.
That one-line distinction is the whole of P1: today both `draft_field` (`tools.ts:2020-2049`)
and the AI Check route (`suggestions/route.ts:259`, `:317`) snapshot at write time, which is
what makes the concurrency bug present as safe.

### Pipeline

```
authoring        normalization        resolution              presentation
─────────        ─────────────        ──────────              ────────────
propose_edit ──┐
draft_field  ──┼─→ intent = f(base, ─→ merge3(base,      ─→ diff(current→merged)
AI Check     ──┘   authored edit)      current, intent)      ├─ coalesce (gap 20)
                                       ├─ ops               ├─ classify (0.5)
                                       ├─ empty → resolve   └─ render
                                       └─ conflict → card
```

Resolution and presentation re-run on every field change. Only authoring and normalization
touch the database.

### Operation types — reuse, do not reinvent

The planner emits existing types, applied by existing code:

| change | emitted as | applied by |
|---|---|---|
| text inside a paragraph / list item | `SuggestionEdit` (anchored) | `applyEditToRichDoc` (`locator.ts:1209`) |
| table cells / rows / columns | `TableOperation` | `applyTableOperation` (`table-operation.ts:252`) |
| figure added / removed | `SuggestionImageInsert` / `Remove` | `image-insert.ts` |
| whole block added / removed | block-level `SuggestionEdit` | `applyEditToRichDoc` |

Tables decompose into cell/row/column deltas rather than being replaced as a block —
otherwise a one-cell change emits "replace the whole table," which is the original bug scoped
to tables, and bypasses `edit_table`. **`edit_table` is not bypassed by this design; it is
the compilation target.** Figure removal likewise becomes a visible, rejectable operation
rather than a silent deletion.

New module: `src/lib/suggestions/diff-plan.ts`. `locator.ts` owns "locate a span and splice
it"; `table-operation.ts` owns structural coordinate edits. The planner owns a third thing —
"given old and new, what is the minimal operation set." Structural editing already lives
outside `locator.ts`; this follows the same seam.

### Conflicts

A conflict is: a block that both `current` and `intent` changed relative to `base`. The card
shows what is in the document, what the suggestion wants, and offers keep-mine /
take-theirs. No merge is attempted inside a conflicted block.

**A conflict is scoped to its operation, never to the suggestion.** Accepting a suggestion
applies every non-conflicting operation and leaves the conflicting ones on the card as a
remainder. Concretely: 12 operations, 1 conflicted → 11 apply, the card re-renders with 1.
This is why conflict granularity must be per block rather than per field (see
[Q2](#open-questions)) — field-level conflicts would make one contested paragraph poison an
otherwise clean draft, reproducing the failure this rebuild exists to remove.

In commit mode (Agent chrome) there is no card and no one to resolve a conflict, so the
non-conflicting operations commit and the conflicting ones are returned to the model with
both versions, to re-plan against current content. Committing the clean subset is safe
because each operation is independently derived; it is not a partial application of one
indivisible change.

---

## Evidence: how small do operations get?

"One big edit is bad, forty tiny ones are worse" is the real risk in P3, so it was measured.
Word-level LCS diff over realistic report prose, counting hunks at several coalescing gaps:

| case | gap=0 | gap=8 | **gap=20** | gap=50 | coverage |
|---|---|---|---|---|---|
| D. one sentence altered in a 5-sentence paragraph | 1 | 1 | **1** | 1 | 2% |
| A. targeted fix (add a missing fact) | 2 | 2 | **2** | 2 | 5% |
| B. moderate revision ("update the draft") | 5 | 4 | **4** | 3 | 12% |
| C. full rewrite (same meaning, new words) | 10 | 4 | **1** | 1 | 82% |

*(Synthetic prose written for this test, not production data. Treat the counts as
illustrative of the shape, not exact.)*

**The key result: coalescing is self-correcting, so no separate "is this a rewrite?" policy
is needed.** The two failure modes sit at opposite ends and one knob fixes both:

- A **targeted change** has long unchanged runs between its edits, so its hunks never merge.
  Case A stays at 2 operations at every gap — granularity is stable and cannot shred.
- A **rewrite** has changes packed densely, so its hunks collapse. Case C goes from 10
  shredded word-swaps at gap=0 to **1** at gap=20 — and that single operation lands at 82%
  coverage, which P3 independently classifies as a rewrite and renders before/after. The two
  constants agree without being tuned to agree, which is a good sign neither is arbitrary.

**Expected volume:** operations never cross block boundaries and unchanged blocks contribute
zero, so the count scales with how much changed, not with field size. A typical "update the
draft" over four paragraphs touching two lands around **4–8 operations**.

gap=8 is visibly too shreddy on case C (4 fragments of a rewrite); gap=50 starts merging
genuinely separate edits in case B (3 instead of 4). **Gap 20**, and it is cheap to
re-evaluate offline against stored base/intent pairs once they exist — which is a further
argument for P1, since today nothing durable is stored to tune against.

**Implementation note from the measurement:** when two hunks merge across a gap, the
unchanged bridge text between them **must be carried into both the delete and the insert
side**. The measurement script drops it — harmless for counting, silent data loss in a real
implementation. Explicit test required.

---

## What this replaces

Compressed; the long-form diagnosis is in git history. Each row is a current defect and the
principle that removes it.

| # | defect | location | removed by |
|---|---|---|---|
| A | AI Check applies no size guard at all — an edit deleting a whole paragraph passes every gate | `suggest.ts:452-489`, `suggestions/route.ts:221`, `:288` | P3 (classification is universal) |
| B | Four prompt paths funnel every `propose_edit` failure into a full rewrite | `system-prompt.ts:246`, `:254`, `:257`; `propose-edit.ts:123` | P1 (anchors resolved once against base; failures become rare) + P3 (0.5 no longer rejects) |
| C | `draft_field` has no preconditions — never checks whether the field is written | `tools.ts:1802-1910` | P2 (a draft over written content merges rather than replaces) |
| D | Preview strikes through the entire field, so warranted rewrites look maximally destructive | `redraft-preview.ts` | P3 (renderer chosen by coverage) |
| E | Duplicate drafts: no supersede, older card surfaces first, no ordering is safe | `tools.ts` (no dedupe); `suggestion-gating.ts:349-377`; `validate-suggestion.ts:106-113` | P1 (R2's base is R1) + P2 (merge, not replace) |
| F.1 | Redraft destroys existing figures — checks the new markdown for images, never the target field | `apply-redraft.ts`, `tools.ts` | P2 (unchanged regions untouched) + figure ops |
| F.2 | Coverage denominator counts an inline image as one character, so image-heavy fields over-trigger `too_large` → funnelled to `draft_field` → figures wiped | `locator.ts:44-45`, `propose-edit.ts:80-87` | P3 (no reject, no funnel) |
| G.1 | Staleness hash snapped at write time, so a suggestion authored against pre-accept content renders **fresh** and silently reverts | `tools.ts:2020-2049`, `suggestions/route.ts:259` | P1 (base at read time) + P2 |
| G.2 | Pending suggestions are invisible to the model and orphaned by an overlapping accept | `context-map.ts:127-131` | P2 (merge composes; conflicts surface) |
| — | `CommitEditFailureStatus` declares a `"stale"` status never returned anywhere | `commit-edit.ts:35` | the slot conflicts fill |

Two ideas from the previous plan are **retired**, both because P1/P2 dissolve them:
supersede-on-draft (E) — unnecessary once R2 merges against R1 rather than racing it — and
read-time hashing, which was the right instinct expressed as a weaker mechanism than storing
the base content itself.

One idea is **kept and promoted**: exposing pending suggestions to the model via
`read_section`, so a draft is authored knowing what is queued. P2 makes overlap safe; this
makes it rarer.

---

## Build order

Sequenced so each step is independently valuable and the riskiest unknown is settled first.

**Step 0 — Settle the merge substrate (half a day, do before anything else).**
Write the idempotence test *first*: `plan(base → base)` must produce zero operations, over
fixtures containing tables, inline images, OMML equations, placeholder tokens, nested lists,
and marks spanning a boundary. This tests whether the doc representation is stable enough to
diff. If it fails broadly — for instance if `markdownToDoc` normalizes attributes so that
round-tripped content never equals its origin — the diff may need to run on markdown rather
than TipTap JSON, which is a significant design change. ~20 lines, and it de-risks the
largest unknown in hour one instead of week two.

Note P1 reduces this exposure: `propose_edit` and AI Check produce `intent` by splicing
TipTap JSON directly, with no markdown round-trip. Only `draft_field` round-trips.

**Step 1 — Planner (`diff-plan.ts`), no UI.** Block alignment, per-block-type diff, the
gap-20 coalescer, the 0.5 classifier, emission of existing operation types. Ship behind a
flag with the current path retained. Test bar: round-trip property test (applying the planned
operations to `old` yields exactly `new`), idempotence, and the bridge-text case from the
measurement note.

**Step 2 — Three-way merge over the planner.** Block-level diff3, conflict detection, the
zero-operations auto-resolve.

**Step 3 — Record shape (P1).** Capture `base` at read time; normalize authored edits to
`intent`; write both as additive optional payload fields. Old rows keep working on the old
path. `propose_edit`, `draft_field`, AI Check, and `commitFieldEdit` all switch to producing
`base`/`intent` here.

**Step 4 — Rendering and per-operation review (P3).** Compose per-operation suggestion marks
instead of whole-field strikethrough. Add the rewrite renderer and the conflict card.
Operation sub-ids (`${commentId}#${i}`), per-operation accept/reject, and partial apply with
a remainder all land here. Point the existing accept-all / dismiss-all
(`report-bulk-suggestion-actions.tsx`) at the merge path so its recursive re-locate becomes a
recursive re-merge.

**Step 5 — Model awareness.** Expose pending suggestions through `read_section`. Retire the
`draft_field` funnel copy in the system prompt, which P1/P3 have made obsolete.

**Estimate:** 1.5–2.5 weeks including the test bar. This area demands it — a wrong diff is a
silent data-loss bug in a regulated document, which is why Step 0 exists and why the flag
stays until the property tests are green on production-shaped fixtures.

**Interim risk:** until Step 3 lands, G.1 remains open and is the sharpest live bug. If the
schedule slips past ~3 weeks, land a standalone read-time hash check (record the field hash
at `read_section`, compare before writing, return `section_changed` and let the model
re-read) as a stopgap. It is hours of work and throwaway once P1 lands — do not build it
unless the slip is real.

---

## Decisions

**D1 — Late binding over frozen edits (P1).** The root cause. Everything else is downstream.

**D2 — Merge, not staleness (P2).** A hash answers "did anything change", which is the wrong
question. Three-way merge answers "what should this do now", which is the right one, and
yields auto-resolve and conflicts as free by-products.

**D3 — 0.5 classifies, it does not reject.** As a gate it causes the rewrites it exists to
prevent, because every rejection is funnelled into `draft_field`. Per operation, not
aggregate. Never applied as a gate to planner output — a genuine rewrite is legitimately one
82%-coverage operation.

**D4 — Coalescing gap 20, and this is the system's real tunable.** It controls what the user
perceives; coverage only controls presentation. Cheap to re-tune offline once base/intent
pairs are stored.

**D5 — Granularity is per block type.** Tables decompose into `TableOperation`s; prose gets
intra-block text diffing. Block-level replacement for prose would strike a whole paragraph
for a one-sentence change — the original complaint restated.

**D6 — The planner emits existing operation types only.** It never introduces a new way to
mutate a document. Every operation is applied by code that already exists and is already
tested. `edit_table` becomes the compilation target rather than a rival path.

**D7 — New module, `src/lib/suggestions/diff-plan.ts`.** Follows the existing
`locator.ts` / `table-operation.ts` seam: structural editing already lives outside the
locator. DRY governs single-sourcing knowledge, not minimizing file count.

**D8 — Additive optional payload fields, no migration, no backfill.** Readers prefer
`base`/`intent` when present and fall back to `deleteText`/`insertText` otherwise.

**D9 — Base stored inline, not as a `sectionContentVersions` reference.** That table is the
audit chain; product behaviour must not depend on it. Field-sized content is cheap.

**D10 — Per-operation review ships in v1. No all-or-nothing.** *(Reversed from an earlier
draft, which proposed shipping all-or-nothing and enabling per-operation later.)*

Two reasons the earlier position no longer holds:

1. **The cost argument was an artefact of the frozen-diff model.** Per-operation accept was
   expensive because accepting one operation invalidated the others' stored anchors. P2
   removes stored anchors entirely, so accepting an operation just moves `current` and the
   rest re-merge. The mechanism is the same one that runs on every keystroke.
2. **All-or-nothing recreates the problem being fixed.** "One bad operation, dismiss the
   whole draft, ask again" is the same dead end as "anchor drifted, card is dead." Shipping
   it would mean shipping a smaller version of the complaint.

Mechanics: each operation gets mark sub-id `${commentId}#${i}` via `InjectAttrs.id`
(`locator.ts:172`); `acceptSuggestionMarksById` / `stripSuggestionMarksById`
(`locator.ts:1334`, `:1377`) are already keyed by mark id and need no changes.

The one real objection to partial acceptance — that it produces text no single author wrote
as a whole — is answerable and does not block this. The engineer is the author of record,
reviews the result, and signs it; each accepted operation is individually recorded in the
audit trail. That is the same standing as editing by hand, which nobody objects to.

**D11 — Conflicts are never auto-resolved.** In a regulated document, silently choosing
between two versions of a contested paragraph is not acceptable behaviour.

**D12 — Sequential resolution is the universal rule.** Nothing is ever resolved against a
document state that predates a change already accepted — across cards (which
`acceptAllSuggestions` already does by re-locating recursively) and within a card (new).
Under P2 this needs no scheduling machinery: it falls out of re-merging against `current`.

**D13 — Partial application always, never total failure.** A suggestion applies every
operation it can and keeps the rest as a visible remainder. There is no code path in which
one difficult operation discards work the user already approved.

---

## Open questions

*Q1 (per-operation review) and Q2 (conflict granularity) are resolved — see D10 and the
conflict rules. They turned out to be the same question, and P2 made the expensive answer the
cheap one.*

**Q3 — Is the doc representation stable enough to diff?** Settled by Step 0's idempotence
test, deliberately scheduled first. Flagged here because a broad failure changes the design
(diff on markdown rather than TipTap JSON), not just the schedule.

**Q4 — Re-merge cadence in the editor.** Every keystroke is wasteful; only on blur is
sluggish. **Recommendation:** reuse the existing 1.5s auto-save debounce so the card refreshes
on the same beat the document saves, and re-merge unconditionally at accept time.

**Q5 — How prominent is a remainder?** With D13, accepting a card can leave it open with one
conflict. That is correct but it means Accept does not always mean "done", which is a change
in what the button promises. **Recommendation:** on partial apply, the toast says what
happened ("5 applied, 1 needs your input") and the card stays in place with the remainder
expanded. Do not silently shrink it — a card that quietly changes shape after a click is
worse than one that explains itself. Worth watching in the first design-partner session.
