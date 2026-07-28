# AI Suggestion System — Architecture, Complexity & Redesign

**Status:** analysis + proposal (no code changed)
**Author:** engineering review, 2026-07-27
**Scope:** the pipeline that generates AI "fix" suggestions and inserts them into a report section when a human accepts.

---

## 0. TL;DR

The suggestion system anchors LLM-produced text against a rich (TipTap/ProseMirror) document. To match an anchor it must flatten the document to a searchable string. **There are four independent flatteners in the codebase, each with different separator rules.** The Accept button is gated by one of them (`richJsonToPlainText`, which emits *markdown*), but the edit is physically inserted using a different one (`collectTextRefs`, which emits *space-joined text*). They agree only for flat single-paragraph prose. For tables, lists, and content near images/equations — the bulk of an investigation report — they diverge, producing two failure modes:

- **Accept fails and the suggestion stays** (card UI throws, comment never resolved).
- **Accept silently discards the suggestion with no change applied** (inline-widget UI no-ops but marks the comment resolved).

Both are the same root cause. The fix is to **collapse to a single locator** used identically by generation-gating, preview, and apply. This document specifies that redesign (Strategy A) concretely. (Of the four flatteners, only two are actually wired into the live path — §11 shows the other two are dead code, which is part of the LOC reduction.)

### How to read this (for the implementing engineer)

Read in this order: **§9** (the QMS invariants you must not violate) → **§2, §7** (why it breaks,
with a traced proof) → **§10** (the module and signatures to build) → **§12** (the ordered,
test-gated steps with "definition of done") → **§11** (what to delete) → **§13** (traps that
re-introduce the bug). §1/§3/§4 are background; §5/§6 are the design rationale §10–§13 make
concrete; §8 is the branch caveat.

### Contents

- §0 TL;DR · §1 How it works today · §2 Root defect (four flatteners) · §3 Bugs (ranked) · §4 Complexity
- §5 Redesign (Strategy A) · §6 Sequencing · §7 Traced proof of Bug 1 · §8 Branch applicability
- **§9 QMS invariants** · **§10 Reference implementation** · **§11 Dead-code / LOC inventory** · **§12 Migration steps** · **§13 Pitfalls**

---

## 1. How the system works today

Two phases; note there are **two separate accept UIs**.

### 1.1 Generation — `POST /api/reports/[reportId]/suggestions` (`route.ts`)

1. `generateSuggestionsForSection()` calls Gemini and returns
   `{ criterionKey, targetField, anchorText, deleteText, insertText, reasoning }`.
2. Each candidate is gated:
   - rich fields: `plain = richJsonToPlainText(fieldDoc, { tableFormat: "markdown" })`, then `canLocateEditInPlainText(plain, edit)` (`route.ts:177`).
   - plain fields: `getPlainTextFieldValue(...)`, then the same `canLocateEditInPlainText`.
   - Non-locatable/ambiguous candidates are **dropped**.
3. Survivors are persisted as `comments` rows (`kind: "ai_fix"` / `ai_redraft`) carrying `anchorText`, `contentPath`, and a serialized `{ deleteText, insertText, contentHashAtSuggestion }`. **The document itself is untouched.** `fromPos` / `toPos` are stored as `null`.

### 1.2 Accept — client-side, two surfaces

**Card UI** (`suggestion-card.tsx`)
- `handleAccept` (line 576) re-gates with `validateSuggestionLocate` (line 579). On failure → toast, return.
- `applyCardToDocument` (line 482):
  - redraft → `applyRedraftToSection` (whole-field replace).
  - rich `ai_fix` → `applyNarrativeSuggestion(doc, id, edit)` → `injectSuggestionMarks` **then** `acceptSuggestionMarksById`.
  - plain `ai_fix` → `applyStructuredFieldSuggestion` → `applyPlainTextEdit`.
- Then PATCH `/sections/[section]` and `patchCommentStatus(..., "resolved")`.

**Inline editor widgets** (`tiptap-section-field.tsx`)
- A `useEffect` (line 680) *previews* the active suggestion by calling `injectSuggestionMarks` into the **live editor doc** (line 731). Preview marks are intentionally **not** persisted to section state (line 745).
- The widget's `onAccept` (line 608) → `applySuggestionInEditor(id, "accept")` → `acceptSuggestionMarksById(editor.getJSON(), id)` (line 580) → PATCH → `persistSuggestion(..., "resolved")`.

### 1.3 Apply mechanics (`suggestion-inject.ts`)

`injectSuggestionMarks(doc, edit, attrs)` returns
`{ doc, insertFromPos, insertToPos, anchored, located }`. It:
- flattens the doc via `collectTextRefs` (its own flattener),
- locates `anchorText`/`deleteText` with `findAnchorInText` (exact → collapsed → unicode-normalized layers),
- splits text nodes, adds `suggestionDelete`/`suggestionInsert` marks,
- **returns the doc UNCHANGED with `located:false` when the anchor/delete target can't be found** (by design, to avoid silent misplacement).

`acceptSuggestionMarksById` then removes delete-marked text and unwraps insert-marked text.

---

## 2. Root architectural defect: four incompatible flatteners

Matching an anchor requires `JSONContent → string`. Four separate implementations do this, each with different separators:

| # | Function | File:line | Block separator | Tables | Lists | Images/eqn |
|---|----------|-----------|-----------------|--------|-------|-----------|
| 1 | `richJsonToPlainText` | `rich-text.ts:207` | `\n\n` | **full markdown** (`\| a \| b \|` + `--- ` rows, merged cells expanded) | `1. ` / `• ` / `- ` prefixes | `[image]` / `[equation]` tokens |
| 2 | `collectTextRefs` | `suggestion-inject.ts:86` | **single space** (11 container types) | space-joined cells, **no pipes** | **no** prefixes | contributes **nothing** |
| 3 | `replaceTextInDoc` collector | `rich-text.ts:449` | space for *some* nodes (doc/para/heading/tableCell) only | partial | no | no |
| 4 | `findAnchorRangeInDoc` | `find-anchor.ts:27` | **no separator at all** (raw concat) | raw concat | no | no |

Flattener **#1** is used to (a) build the LLM prompt and (b) gate the Accept button. Flattener **#2** is used to actually insert the edit. **They are not subtly different — they are different string models of the same document.**

The invariant that would make this correct — *"all flatteners emit byte-identical anchor spaces"* — is:
- never stated in one place,
- enforced only by a warning comment (`suggestion-inject.ts:59`) and one repro test (`accept-misplacement-repro.test.ts`),
- **unsatisfiable by construction**, because #1 deliberately emits markdown for the LLM while #2 must map to ProseMirror text offsets.

The existing repro test was "fixed" by adding `blockquote`/`listItem` to #2's separator set — a band-aid covering two block types while leaving the largest divergences (table pipes, list-number prefixes, image tokens) intact.

---

## 3. Concrete bugs (ranked)

### BUG 1 — Accept fails and the suggestion stays. **CRITICAL**
Anchor spans/includes structured content → #1 and #2 disagree:
- `validateSuggestionLocate` (uses #1) → `canApply: true`, button enabled.
- `applyNarrativeSuggestion` → `injectSuggestionMarks` (uses #2) → not found → `located:false` → **throws** `"Suggestion could not be located in the current text"` (`apply-narrative-suggestion.ts:74`).
- Catch (`suggestion-card.tsx:620`) shows `"Could not apply suggestion"`, calls `refresh()`, **never patches the comment** → card reappears. Deterministic on retry.

Reliably fires for **table cells (6M grids, CAPA registers), numbered/bulleted lists (5-Why), and anchors adjacent to images/equations**.

### BUG 2 — Silent no-op accept that discards the suggestion. **CRITICAL**
Preview effect ignores `located`: `json = injectSuggestionMarks(...).doc;` (`tiptap-section-field.tsx:731`). On divergence the doc is returned unchanged (no marks). `onAccept` → `acceptSuggestionMarksById` finds no marks → **no-op on the document**, but still saves and calls `persistSuggestion(id, "resolved")`. The suggestion **vanishes with zero change applied and no error**.

### BUG 3 — Two accept surfaces, two code paths, can diverge. **HIGH**
Card re-injects from unmarked section state (`applyNarrativeSuggestion`); widget accepts marks already in the editor (`acceptSuggestionMarksById`). Preview marks aren't persisted to section state (`tiptap-section-field.tsx:745`), so if the editor doc and `sections[section]` drift (typing + autosave timing), the two Accept buttons produce different results for the "same" suggestion.

### BUG 4 — Exact-vs-collapsed occurrence mismatch. **MEDIUM**
`countOccurrences` counts in **collapsed** space but `findAnchorInText` returns the **exact-match** index first (`normalize-for-anchor.ts:39,81`). A needle unique when collapsed but shaped differently exact can validate as unambiguous yet locate at a different span than counted → off-by-one placement.

### BUG 5 — Ambiguity handled inconsistently (plain fields). **MEDIUM**
`canLocateEditInPlainText` rejects `anchorCount > 1` outright, but `locatePlainTextDeleteSpan` falls back to `locateUniqueSpan(value, del)` over the whole field when anchor scoping fails (`locate-plain-text-edit.ts:59`). Gate and apply can disagree on which span to edit.

### BUG 6 — `normalizeSuggestionInsertText` applied 3×. **LOW**
route → `buildSuggestionEdit` → `injectSuggestionMarks`. Idempotent, so harmless, but a smell.

---

## 4. Complexity assessment

~3,500 LOC across the core path; **4** doc-flatteners; **3** locate/validate entry points invoked from **17** call sites; **2** parallel accept UIs. The editor is treated as the source of truth *and* the edit is re-derived in server shape and reconciled on the client. Every seam between those requires the string models to agree, and they can't. The design cannot be made correct by patching separator sets; it needs consolidation.

---

## 5. Redesign — Strategy A: one locator, one string model

### 5.1 Principle

There is exactly **one** function that maps `(doc, anchor) → position range`, and the LLM is anchored against **the exact string that function searches**. Generation-gating, preview, and apply all consume the same locator and the same string. The other three flatteners are deleted (or reduced to non-matching roles: export rendering, LLM *display*).

### 5.2 The canonical anchor string

Introduce a single `flattenForAnchor(doc): AnchorIndex` producing one string plus an **exact
offset → text-node map** for in-place mutation (no ProseMirror positions — §13.5). The separator
policy is stated **once**, in this function, and nowhere else. The exact policy and types are in
§10.2; the essential rules are: text nodes contribute their characters verbatim; a single `\n`
between block siblings and a single space between inline siblings/atoms; and **no synthetic
characters** (no markdown pipes, list numbers, or `[equation]` tokens — the applier cannot
reproduce them, §13.1). Matching runs through the `findAnchorInText` layers (exact → collapsed →
unicode) over this one string, returning an exact range via an index map (not a regex remap).

Because there is only one string, "the button says it's applyable" and "the applier can place it"
become the *same computation*.

### 5.3 Module shape (summary — full signatures in §10)

```
src/lib/suggestions/locator.ts        // NEW — the single source of truth
  flattenForAnchor(doc): AnchorIndex            // { text; resolve(start,end) } — string-offset only, NO PM positions (§13.5)
  locateEdit(text, edit): LocateResult          // status: located | not_found | ambiguous | cross_block, + exact start/end
  applyEditToRichDoc(doc, edit, attrs)          // gets range from locateEdit, then splits/marks text nodes
  applyEditToPlainText(text, edit)              // gets range from locateEdit, then splices the string
```

`edit` is the existing `{ anchorText, deleteText, insertText }`. Everything operates in the
JSON + string domain — **no ProseMirror positions** (they are unused today, §11, and there is no
server-side schema, §13.5). `locateEdit` is the one predicate both gates and both appliers share;
the appliers never flatten or match on their own. See §10 for the exact types.

### 5.4 Who calls what (after)

| Caller | Today | After |
|--------|-------|-------|
| Generation gate (`route.ts`) | `richJsonToPlainText` + `canLocateEditInPlainText` | `locateEdit(flattenForAnchor(doc).text, edit).status` |
| Accept gate (`validate-suggestion.ts`) | `richJsonToPlainText` + `canLocateEditInPlainText` | `locateEdit(...).status` |
| Card apply (`apply-narrative-suggestion.ts`) | `injectSuggestionMarks` (own flattener) | `applyEditToRichDoc` (delegates to `locateEdit`) |
| Preview (`tiptap-section-field.ts:731`) | `injectSuggestionMarks(...).doc` (ignores `located`) | `applyEditToRichDoc`; **respect `status`** — no preview/no acceptable mark unless `located` |
| Plain-text fields | `applyPlainTextEdit` | `applyEditToPlainText` — same `locateEdit` predicate as rich (fixes Bug 5) |

`richJsonToPlainText(..., "markdown")` **stays** for two non-matching jobs: (1) the
**evaluation** prompt (`contextForPrompt`, shared with eval — must not change, see §9.4) and
(2) DOCX/diff export.

**The correctness guarantee comes from `gate ≡ apply`, not from prompt engineering.** Because
the generation gate, the accept gate, and the apply all call the *same* `locateEdit`, a
suggestion the applier cannot place exactly is *dropped at generation* and *disabled at accept*
— it can never be misapplied. This means the prompt representation only affects **yield** (how
many suggestions survive), never **correctness**. See §9 for why this matters for a QMS. The
optional yield optimization (feeding the model the canonical anchor string) is §12 Step 6 and
is safe to defer.

### 5.5 Collapse the two accept surfaces (fixes Bug 3)

Make one writer: a single `acceptSuggestion(reportId, section, comment)` service (§10.4) that
both the card and the inline widget call. It runs locate → apply → save → audit → flip-status
atomically over section state (never editor-local JSON); the widget then lets the external-value
sync repaint the editor. Preview remains editor-local and read-only. This removes the "editor
JSON vs section state" divergence entirely.

### 5.6 Fail loudly and correctly (fixes Bugs 1 & 2)

- The appliers return a discriminated `status`; callers must handle `not_found`/`ambiguous`/`cross_block` explicitly.
- Because the gate and apply now share `locateEdit`, a suggestion can **never** be gated-applyable but apply-unlocatable. Bug 1's "enabled but throws" becomes impossible.
- The preview path checks `status` before offering accept, so Bug 2's silent resolve-without-change becomes impossible.
- If a doc genuinely changed between gate and click (concurrent edit), `locateEdit` returns `not_found`/`ambiguous` at click time → show the existing `suggestionStaleMessage`, keep the card, do **not** resolve.

### 5.7 Migration plan (overview)

At a glance: (1) add `locator.ts`, (2) repoint both gates to `locateEdit`, (3) add the
`gate ≡ apply` property test, (4) move the appliers onto `locateEdit`, (5) unify the two accept
UIs behind one `acceptSuggestion` service, (6) optional prompt yield tweak, (7) delete dead code.

**The authoritative, test-gated, step-by-step version a junior should follow is §12** (with
"definition of done" per step). §10 gives the module signatures; §11 lists exactly what to
delete; §13 lists the traps. Read §9 (QMS invariants) first.

### 5.8 What this explicitly does *not* solve

Concurrent rebasing: if two users edit the same field between generation and accept, `locateEdit` can only say "still there / gone / ambiguous." That's correct and safe (never misplaces), but it will drop more suggestions under heavy concurrent editing. If that becomes a problem, adopt **Strategy B** (position-based suggestions): resolve `{from,to}` once at generation into the existing `fromPos`/`toPos` columns and rebase them with a ProseMirror `StepMap`/diff before accept, so accept is a pure position replacement. Strategy A is a prerequisite for B (both need the single locator), so this is a roadmap item, not a fork.

---

## 6. Recommended sequencing

Follow the **§12 steps in order** (each shippable). In priority terms:
1. §12 Steps 1–4 (locator + both gates + property test + appliers) — kills the two CRITICAL
   data-loss bugs and establishes the `gate ≡ apply` invariant.
2. §12 Step 5 — removes the dual-surface class of bugs (Bug 3).
3. §12 Steps 6–7 — yield tweak + dead-code deletion (the LOC reduction).
4. Strategy B (§5.8) — only if concurrent-edit suggestion loss is observed in practice.

Do **not** continue patching `collectTextRefs`' separator set; the next structured-content case reopens the same bug.

---

## 7. Executable proof of Bug 1 (traced, not yet committed)

This section is the "minimal failing test" for Bug 1, presented as a hand-trace so it can be
verified by reading alone. It is deterministic and does **not** depend on the LLM quoting
anything unusual, because the token it anchors to (`[equation]`) is exactly what the model is
shown and exactly what the injector cannot produce.

### 7.1 Why the model even sees `[equation]`

The suggestion prompt serializes section content with
`richJsonToPlainText(value, { tableFormat: "markdown" })` (`section-context.ts:62`; also
lines 153–201 for the structured fields). That flattener emits `[equation]` / `[image]`
sentinels (`rich-text.ts:224–232`) and full markdown tables with `|` pipes
(`rich-text.ts:337`). So the model is *told* the document text is
`"See [equation] for the assay calculation."` and is asked to quote from it. Both the
generation gate (`route.ts:177`) and the accept gate (`validate-suggestion.ts:102`) then
validate the returned anchor against that same markdown string.

### 7.2 The input

A narrative field with one inline equation:

```jsonc
// doc
{ "type": "doc", "content": [
  { "type": "paragraph", "content": [
    { "type": "text", "text": "See " },
    { "type": "mathInline" },
    { "type": "text", "text": " for the assay calculation." }
  ]}
]}
```

A pure-insert suggestion the model would plausibly return (add an equation label):

```jsonc
// edit
{ "anchorText": "See [equation] for", "deleteText": "", "insertText": " (Eq. 1)" }
```

### 7.3 The divergence (the crux)

The two flatteners produce different strings for the *same* doc:

| Flattener | Output for this doc |
|-----------|---------------------|
| #1 `richJsonToPlainText(doc, {tableFormat:"markdown"})` — gates + LLM | `See [equation] for the assay calculation.` |
| #2 `collectTextRefs(doc)` — the injector (`suggestion-inject.ts:86`) | `See    for the assay calculation.` (equation node contributes **no text**; sibling separators leave a whitespace gap) |

### 7.4 The two outcomes

**Gate** — `canLocateEditInPlainText("See [equation] for the assay calculation.", edit)`
takes the pure-insert branch (`suggestion-inject.ts:634`): `anchorText` is found in the
string → returns `{ ok: true }`. **Accept button is enabled.**

**Injector** — `injectSuggestionMarks(doc, edit, attrs)` takes the pure-insert-with-anchor
branch (`suggestion-inject.ts:325`): `findRangeInFlat("See    for the assay calculation.",
"See [equation] for")` searches for `[equation]` in a string that has no such substring
(exact, collapsed, and unicode-normalized layers all miss) → returns `notLocated` →
`{ located: false }` (line 328).

**Caller** — `applyNarrativeSuggestion` sees `injected.located === false` and **throws**
`"Suggestion could not be located in the current text"` (`apply-narrative-suggestion.ts:74`).
`handleAccept`'s catch (`suggestion-card.tsx:620`) shows `"Could not apply suggestion"`,
calls `refresh()`, and **never calls `patchCommentStatus`** → the comment stays `open` → the
card reappears unchanged. Retrying is deterministic; it never applies. **This is the reported
symptom.**

### 7.5 The assertion (becomes the §12 Step 3 property test)

The proof, written as it would appear in a test, asserts the *contradiction between gate and
injector* rather than a UI outcome — that contradiction is the bug:

```ts
// Illustrative only. This becomes the §12 Step 3 "gate ≡ apply" property test, made to pass
// by the single-locator consolidation. Do NOT hand-edit collectTextRefs to satisfy it.
const doc = /* §7.2 doc */;
const edit = { anchorText: "See [equation] for", deleteText: "", insertText: " (Eq. 1)" };

const plain = richJsonToPlainText(doc, { tableFormat: "markdown" });
const gateSaysApplyable = canLocateEditInPlainText(plain, edit).ok;   // true
const injectorLocated  = injectSuggestionMarks(doc, edit, ATTRS).located; // false (current)

// The invariant that SHOULD hold but does not today:
expect(injectorLocated).toBe(gateSaysApplyable);   // ❌ fails on current code (false !== true)
```

After Strategy A, both values are computed by the **same** `locateEdit`, so the assertion
holds by construction and can never regress.

### 7.6 Corroborating case (tables)

The same contradiction reproduces without equations whenever an anchor includes a markdown
structural character the model was shown. Given a 6M/CAPA table row rendered by #1 as
`| Man | operator not trained |`, an anchor of `"Man | operator not trained"` (pipe included,
because that is what the model saw) is:

- **locatable in #1** — the pipe is present in the markdown string; and
- **not locatable in #2** — `collectTextRefs` joins cells with a space
  (`Man operator not trained …`), so the pipe is absent → `notLocated` → same throw.

Merged cells make it worse: #1 *repeats* a merged value across every covered row
(`rich-text.ts:364`) while #2 emits it once, so occurrence counts (and therefore the
`ambiguous` verdict) also disagree between gate and injector.

### 7.7 Relationship to the existing repro test

`accept-misplacement-repro.test.ts` already encodes this class for the **blockquote** case
and was made to pass by adding `blockquote`/`listItem` to `collectTextRefs`' separator set.
The equation and table cases above are the same defect in block types that band-aid does not
cover — which is exactly why per-type separator patching is the wrong fix and §5's single
locator is the right one.

---

## 8. Branch applicability (`main` / `feat/whitelabel` / `demo/insert`)

This document was written against **`demo/insert`**. The **root cause (§2) and the Strategy A
redesign (§5) apply identically to all three branches** — both flatteners exist everywhere:
`renderTableAsMarkdown` (#1) and `collectTextRefs` (#2) are present on `main`,
`feat/whitelabel`, and `demo/insert`. But the doc's specifics do **not** transfer verbatim.

### 8.1 Branch topology (at time of writing)

- `feat/whitelabel` is a **strict ancestor** of `demo/insert` (0 commits ahead, 5 behind).
- `main` is **20 commits behind** `demo/insert`.
- The 5 commits `demo/insert` is ahead of `feat/whitelabel` (`5ff19f2` AI chat, `76c0c7a` +
  `1cd1967` redrafts, `d70df7c` "insertion fixes", plus a chore) are what touched the
  suggestion subsystem. `feat/whitelabel` inherits all of it on fast-forward; `main` is further
  back.

### 8.2 What differs from this doc on `main` / `feat/whitelabel`

| Item | `demo/insert` (this doc) | `main` / `feat/whitelabel` |
|------|--------------------------|-----------------------------|
| Redraft feature (`apply-redraft.ts`, `redraft-preview.ts`) | present | **absent** — §1.2, §5.4, and redraft mentions in §7 do not apply |
| `suggestion-inject.ts` | current | **−114 lines** (older) — all §-line refs are wrong |
| `suggestion-card.tsx` / `validate-suggestion.ts` / `rich-text.ts` / `tiptap-section-field.ts` | current | **−112 / −39 / −27 / −25 lines** — accept-handler and gate line refs differ |
| `section-context.ts` | current | same on `feat/whitelabel`; **−14 lines** on `main` |
| Injector failure mode | **fail-loud** (`notLocated()` + `located` flag; `applyNarrativeSuggestion` throws) | **older, silent** (no `notLocated`/`located`; no throw; `appendAtEnd` path) |

### 8.3 The behavioral consequence — Bug 1 looks different

Same root cause, different symptom:

- **`demo/insert`:** anchor divergence → `located:false` → `applyNarrativeSuggestion` **throws**
  → catch shows an error toast and the comment is never resolved → **the card stays** (the §3
  Bug 1 write-up).
- **`main` / `feat/whitelabel`:** the older injector has no `located` gate and does not throw →
  the edit is **silently appended at the end of the field / misplaced** rather than failing.
  This is the *"text landed in the wrong place"* / *"had to accept several times"* symptom —
  same defect, quieter and arguably worse (silent corruption vs. a visible error).

Bug 2 (preview ignores `located`, §3) is specific to `demo/insert`'s exact code because the
`located` field does not exist on the older branches; the equivalent silent misplacement occurs
in the preview path there too.

### 8.4 Recommendation

Implement the §5 redesign on the branch furthest ahead — **`demo/insert`** — which already has
the fail-loud guard and band-aid separators and is therefore the cleaner base. `feat/whitelabel`
picks it up on fast-forward; `main` would first need these commits (or the redesign applied
directly) even to reach the fail-loud state. When reading this doc against `main` or
`feat/whitelabel`: trust §2 and §5, ignore the redraft-specific bullets, do not trust line
numbers, and expect Bug 1 as **silent misplacement** rather than a stuck card.

---

## 9. Correctness model & QMS invariants

This tool edits controlled records in a **medical-device QMS** (21 CFR Part 11 / ALCOA+). An AI
edit that lands in the wrong place is not a UX papercut — it is a data-integrity defect in a
GxP record. The redesign must therefore satisfy these invariants, each of which is *testable*:

1. **Fail-closed (ALCOA "Accurate").** If the locator cannot resolve an edit to **exactly one**
   character range, the apply **refuses** and surfaces it. It never approximates, never falls
   back to "append at the end," never guesses between multiple matches. Silent misplacement
   (today's `main`/`whitelabel` behavior, §8.3) is the specific failure this kills.
2. **Gate ≡ apply.** The predicate that enables the Accept button is the *same function* that
   performs placement. This is the single most important invariant; it makes "enabled but can't
   apply" (Bug 1) and "no-op accept that resolves the comment" (Bug 2) structurally impossible.
   Enforced by a property test (§12 Step 3).
3. **Deterministic (ALCOA "Consistent").** Same `(doc, edit)` → same result, always. No wall-clock,
   no randomness, no regex re-search whose result depends on backtracking. The current
   `mapCollapsedIndexToOriginal` regex remap (`normalize-for-anchor.ts:64`) is replaced by an
   exact index map (§10.2), removing Bug 4.
4. **Attributable & reconstructible.** Every applied suggestion already records a
   `suggestion_applied` audit event and a `sectionContentVersions` snapshot (§ audit subsystem).
   Keep that. The apply must run **before** the status flips to `resolved`, and the two must not
   be able to diverge (a save that succeeds while the status write fails, or vice-versa, is a
   reconciliation bug — see §10.4, the single `acceptSuggestion` service).
5. **No blast radius into evaluation.** The suggestion refactor must not alter the **evaluation**
   prompt or its content hash. Changing `contextForPrompt` would silently re-rank traffic
   lights and invalidate the eval cache — a validation event in a QMS. Keep suggestion changes
   inside the suggestion pipeline (§9.4 lists the exact shared seam).

### 9.4 Shared-code seam to respect

`contextForPrompt` (`section-context.ts`) is used by **both** `evaluateSection()` and
`generateSuggestionsForSection()`. **Do not edit it** for this work. If §12 Step 6 (yield
optimization) is done, add a *new* suggestion-only serializer; leave the eval path byte-identical.

---

## 10. Reference implementation

### 10.1 Target module layout

```
src/lib/suggestions/
  locator.ts            # NEW — the ONLY matcher + the ONLY rich-doc flattener used for matching
    flattenForAnchor(doc): AnchorIndex
    locateEdit(text, edit): LocateResult
    applyEditToRichDoc(doc, edit, attrs): { doc, status }   // replaces injectSuggestionMarks internals
    applyEditToPlainText(text, edit): { text, status }      // replaces applyPlainTextEdit internals
  accept-suggestion.ts  # NEW — the ONE service both UIs call (§10.4)
```

Everything else in `src/lib/suggestions/*` and `src/lib/tiptap/suggestion-*` either delegates to
`locator.ts` or is deleted (§11).

### 10.2 `flattenForAnchor` — one canonical string, exact position map

This is `collectTextRefs` (already in `suggestion-inject.ts:86`) promoted to the single source
of truth, with an **exact** offset→node map so no re-search is ever needed.

```ts
export type AnchorIndex = {
  text: string;                       // canonical anchor string
  // For any [start,end) in `text`, the text nodes + local offsets it covers,
  // for in-place mutation. No ProseMirror positions (they are unused — §11).
  resolve(start: number, end: number): TextSlice[];
};

// Separator policy — STATED ONCE, HERE, AND NOWHERE ELSE:
//  - each text node contributes its characters verbatim;
//  - a single "\n" between block-level siblings (paragraph, heading, listItem,
//    tableRow, blockquote child, table);
//  - a single " " between inline siblings, and for each inline atom
//    (image, equation) so text on both sides stays separated but matchable;
//  - NO markdown pipes, NO list numbers, NO "[equation]" tokens (the applier
//    cannot reproduce synthetic characters, so the matcher must not invent them).
export function flattenForAnchor(doc: JSONContent): AnchorIndex;
```

Matching layers (exact → collapsed-whitespace → unicode-normalized) are kept from
`findAnchorInText`, **but** the returned range is always an exact `[start,end)` in `text` via a
precomputed `collapsedToRaw: number[]` map (the technique already in `find-anchor.ts:41`), never
a regex remap. This is the one place normalization lives.

### 10.3 `locateEdit` — the shared predicate + range

```ts
export type LocateResult =
  | { status: "located"; start: number; end: number }   // exact, unique
  | { status: "not_found" }
  | { status: "ambiguous" }                              // >1 match — never auto-pick
  | { status: "cross_block" };                           // spans a block boundary — reject (§13.2)

export function locateEdit(text: string, edit: SuggestionEdit): LocateResult;
```

- **Both** gates (`route.ts` generation, `validate-suggestion.ts` accept) call `locateEdit` and
  key off `status`.
- **Both** appliers (`applyEditToRichDoc`, `applyEditToPlainText`) call `locateEdit` to get the
  range, then splice. Rich splices the JSON text nodes via `AnchorIndex.resolve`; plain splices
  the raw string. **Neither applier re-implements matching.**
- Rich fields feed `flattenForAnchor(doc).text`; plain fields feed the raw field string. One
  predicate, two thin appliers.

### 10.4 `acceptSuggestion` — one service, two UIs (kills Bug 3)

```ts
// Called by BOTH suggestion-card.tsx and the tiptap-section-field inline widget.
// Atomic: locate → apply → save → audit → flip status. Any failure short-circuits
// BEFORE the status flip, so a comment is never resolved without its edit landing.
export async function acceptSuggestion(reportId, section, comment): Promise<AcceptOutcome>;
```

The inline widget stops mutating editor-local JSON; it calls `acceptSuggestion` and lets the
external-value sync repaint. Preview stays editor-local and read-only, and preview offers Accept
only when `locateEdit(...).status === "located"` (kills Bug 2).

### 10.5 What `injectSuggestionMarks` becomes

Its matching (`collectTextRefs` + `findRangeInFlat` + the branchy anchor/delete logic) moves into
`locateEdit`. Its mark-splitting (`splitTextNode`, `insertAfterRef`, mark cleanup) stays. Its
**PM-position outputs are deleted** (`indexPmPositions`, `insertFromPos`, `insertToPos`,
`anchored`) — verified unused in §11. Result type shrinks to `{ doc, status }`.

---

## 11. Dead-code & LOC-reduction inventory (verified)

Each item below was confirmed unused by grep across `src/**` including tests. Deleting them is
safe and is most of the 3,500 → target reduction.

| Delete | File / symbol | Evidence | ~LOC |
|--------|---------------|----------|------|
| Flattener #4 (whole file) | `src/lib/tiptap/find-anchor.ts` (`findAnchorRangeInDoc`) | **zero** references anywhere (no import of the module) | 76 |
| Flattener #3 | `replaceTextInDoc` in `rich-text.ts` + its test | referenced **only** by `rich-text.test.ts` | ~110 + test |
| Injector PM positions | `indexPmPositions`, `insertFromPos`/`insertToPos`/`anchored` fields, pos calc in every return | **zero** consumers of these fields | ~70 |
| Duplicate matchers (merge, not delete) | `canLocateEditInPlainText`, `locateUniqueSpan`, `locatePlainTextDeleteSpan`, `collectTextRefs`+`findRangeInFlat` | all become one `locateEdit` | net −200+ |
| Second flatten-for-matching | `richJsonToPlainText`-as-matcher usage in gates | replaced by `flattenForAnchor` | callers only |

**Net expectation:** two files removed, ~350 LOC of dead code deleted outright, and the
matcher/flattener surface collapses from 4 implementations to 1. Keep `richJsonToPlainText`
itself (still needed for eval + export) but it is no longer part of the *matching* path.

> Before deleting, re-run the grep in §11 on the branch you are working on — line numbers and a
> few call sites differ on `main`/`feat/whitelabel` (§8). The *unused* status of #3/#4 holds on
> all three, but confirm on your branch.

---

## 12. Step-by-step migration (for the implementing engineer)

Each step is independently shippable and gated by a green test suite. Do them in order. "DoD" =
definition of done.

**Step 0 — Characterization tests (safety net).** Before touching anything, add snapshot tests
that capture *current* correct behavior on the cases that already work (single-paragraph edits,
the existing `accept-misplacement-repro.test.ts` cases). These must stay green through every
later step. *DoD:* `pnpm test` green; snapshots committed.

**Step 1 — Introduce `locator.ts` (`flattenForAnchor` + `locateEdit`).** Port `collectTextRefs`
+ the `findAnchorInText` layers into it with the exact index map (§10.2). Unit-test against:
single-paragraph, cross-list-item, table-cell, inline-equation, merged-cell, and every case in
`accept-misplacement-repro.test.ts`. *DoD:* new tests green; nothing else wired yet.

**Step 2 — Repoint the two gates to `locateEdit`.** `route.ts` (generation) and
`validate-suggestion.ts` (accept) now key off `locateEdit(...).status`. *DoD:* existing gate
tests green; some previously-enabled-but-broken suggestions now correctly show stale (expected,
and an immediate UX win).

**Step 3 — Add the `gate ≡ apply` property test.** For a generated corpus of docs (prose, lists,
tables, equations, nested), assert `locateEdit(...).status === "located"` **iff**
`applyEditToRichDoc(...).status === "located"`. This is the invariant from §9.2. *DoD:* property
test green; it must remain in CI permanently.

**Step 4 — Reimplement the appliers on `locateEdit`.** Rewrite `applyEditToRichDoc` (the guts of
`injectSuggestionMarks`, keeping mark-splitting) and `applyEditToPlainText` (replacing
`applyPlainTextEdit`) to get their range from `locateEdit`. Delete the PM-position machinery
(§11). *DoD:* Step 0 snapshots still green; Bug-1 equation/table repros from §7 now apply
correctly instead of throwing; result type is `{ doc, status }`.

**Step 5 — Introduce `acceptSuggestion` and unify the two UIs.** Both `suggestion-card.tsx` and
the inline widget call it; the widget stops mutating editor-local JSON; preview offers Accept
only when located. *DoD:* accepting from either surface produces identical saved content and
identical audit events; Bug 3 characterization test green.

**Step 6 — (Optional, yield only) Align the suggestion prompt.** Feed the model the editable
current section as `flattenForAnchor(doc).text` so its verbatim anchors are copied from the exact
string the locator searches. **Add a new suggestion-only serializer — do not touch
`contextForPrompt` (§9.4).** Bump the suggestion `PROMPT_VERSION`. *DoD:* eval prompt/hash
unchanged (diff `contextForPrompt` = empty); suggestion drop-rate for table/list fields measured
before/after.

**Step 7 — Delete dead code.** Remove `find-anchor.ts`, `replaceTextInDoc` (+ test), and the
warning comment at `suggestion-inject.ts:59` (the invariant it guarded no longer exists). *DoD:*
grep for each symbol returns zero; `pnpm typecheck` + `pnpm test` green; LOC delta recorded.

---

## 13. Pitfalls that would reintroduce the bug (read before coding)

1. **Never let the matcher invent characters the tree lacks.** `flattenForAnchor` must not emit
   markdown pipes, list numbers, or `[equation]` — the applier can't reproduce them, so any
   anchor containing them becomes unlocatable. This is the exact §2 divergence; do not "help"
   the model by enriching the anchor string.
2. **Reject cross-block anchors — don't try to place them.** An anchor spanning a paragraph/cell/
   list-item boundary has no unambiguous insertion point. Return `status: "cross_block"` and drop
   it at generation. Extending separator sets to "make it match" is the band-aid that created the
   current fragility (§7.7).
3. **Two representations = two sources of truth.** If Step 6 shows the model markdown *and* a
   canonical string, it will sometimes copy from the wrong one. Show the editable field's anchor
   text in exactly one representation (the canonical one). Read-only prior-section context may
   stay markdown because anchors may not come from there.
4. **Do not resolve the comment before the edit is saved.** Order is locate → apply → save →
   audit → flip status, all in `acceptSuggestion`. A `resolved` comment with no applied edit is a
   silent record defect (§9.4).
5. **Don't reach for ProseMirror positions.** They're unused today and there is no server-side
   schema (`getSchema` appears nowhere at runtime). Staying in the JSON+string domain is simpler
   and avoids client/server schema-parity drift. Position-based suggestions (Strategy B, §5.8)
   are a separate, later project with its own schema-parity design.
6. **Keep normalization in one function.** Exactly one place (`flattenForAnchor`/`locateEdit`)
   may collapse whitespace or normalize unicode. If a caller pre-normalizes and the locator
   normalizes again, offsets drift (a variant of Bug 4).
