# AI Suggestion System — Architecture, Complexity & Redesign

**Status:** analysis + proposal (no code changed)
**Author:** engineering review, 2026-07-27
**Scope:** the pipeline that generates AI "fix" suggestions and inserts them into a report section when a human accepts.

---

## 0. TL;DR

The suggestion system anchors LLM-produced text against a rich (TipTap/ProseMirror) document. To match an anchor it must flatten the document to a searchable string. **There are four independent flatteners in the codebase, each with different separator rules.** The Accept button is gated by one of them (`richJsonToPlainText`, which emits *markdown*), but the edit is physically inserted using a different one (`collectTextRefs`, which emits *space-joined text*). They agree only for flat single-paragraph prose. For tables, lists, and content near images/equations — the bulk of an investigation report — they diverge, producing two failure modes:

- **Accept fails and the suggestion stays** (card UI throws, comment never resolved).
- **Accept silently discards the suggestion with no change applied** (inline-widget UI no-ops but marks the comment resolved).

Both are the same root cause. The fix is to **collapse to a single locator** used identically by generation-gating, preview, and apply, and to anchor the LLM against *that exact string*. This document specifies that redesign (Strategy A) concretely.

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

Introduce a single `flattenForAnchor(doc): { text, map }` where `map` lets any index in `text` be translated back to a ProseMirror position (as `find-anchor.ts` already does with `flatToPm`). Separator policy is stated **once**, here, and nowhere else:

- Every text node contributes its characters.
- A single `\n` is inserted between block-level siblings (paragraph, heading, listItem, tableRow, blockquote child, etc.).
- Inline atoms (image, equation) contribute a **stable sentinel** (`￼`, the Unicode object-replacement char) so anchors can be adjacent to them deterministically.
- Matching always runs through the existing `findAnchorInText` layered matcher (exact → collapsed → unicode) over this one string.

Because there is only one string, "the button says it's applyable" and "the injector can place it" become the *same computation*.

### 5.3 Module shape

```
src/lib/suggestions/locator.ts        // NEW — the single source of truth
  flattenForAnchor(doc): AnchorIndex           // { text: string; toPmRange(start,end): PmRange }
  locateEdit(doc, edit): LocateResult          // { status: "located"|"not_found"|"ambiguous"; range?: PmRange }
  applyEditToDoc(doc, edit, attrs): ApplyResult // uses locateEdit, then marks; never re-implements matching
```

`edit` is the existing `{ anchorText, deleteText, insertText }`. `locateEdit` returns everything both the gate and the apply need. `applyEditToDoc` replaces the body of `injectSuggestionMarks` but delegates *all* matching to `locateEdit` — it never flattens the doc itself.

### 5.4 Who calls what (after)

| Caller | Today | After |
|--------|-------|-------|
| Generation gate (`route.ts`) | `richJsonToPlainText` + `canLocateEditInPlainText` | `locateEdit(doc, edit).status` |
| Accept gate (`validate-suggestion.ts`) | `richJsonToPlainText` + `canLocateEditInPlainText` | `locateEdit(doc, edit).status` |
| Card apply (`apply-narrative-suggestion.ts`) | `injectSuggestionMarks` (own flattener) | `applyEditToDoc` (delegates to `locateEdit`) |
| Preview (`tiptap-section-field.ts:731`) | `injectSuggestionMarks(...).doc` (ignores `located`) | `applyEditToDoc`; **respect `status`** — no preview, no acceptable mark when `not_found` |
| Plain-text fields | `applyPlainTextEdit` | unchanged string-domain path, but share the same `findAnchorInText`/ambiguity rule as `locateEdit` for consistency (fixes Bug 5) |

`richJsonToPlainText(..., "markdown")` **stays** — but only for two non-matching jobs: (1) rendering tables for the *LLM prompt's human-readable context*, and (2) DOCX/diff export. Crucially, the **anchor the LLM is told to copy** must come from `flattenForAnchor`, not from the markdown render, so what the model anchors against is exactly what the locator searches. (In the prompt: show markdown for readability *and* provide the canonical anchor string the model must quote from.)

### 5.5 Collapse the two accept surfaces (fixes Bug 3)

Make one writer. Recommended: the **card** owns application; the inline widget's `onAccept` calls the same `applyEditToDoc` on section state (not on editor-local JSON), then lets the external-value sync repaint the editor. Preview remains editor-local and read-only. This removes the "editor JSON vs section state" divergence entirely.

### 5.6 Fail loudly and correctly (fixes Bugs 1 & 2)

- `applyEditToDoc` returns a discriminated result; callers must handle `not_found`/`ambiguous` explicitly.
- Because the gate and apply now share `locateEdit`, a suggestion can **never** be gated-applyable but apply-unlocatable. Bug 1's "enabled but throws" becomes impossible.
- The preview path checks `status` before offering accept, so Bug 2's silent resolve-without-change becomes impossible.
- If a doc genuinely changed between gate and click (concurrent edit), `locateEdit` returns `not_found`/`ambiguous` at click time → show the existing `suggestionStaleMessage`, keep the card, do **not** resolve.

### 5.7 Migration plan (incremental, each step shippable)

1. **Add `locator.ts`** with `flattenForAnchor` + `locateEdit`, ported from `find-anchor.ts` + the `findAnchorInText` layers. Unit-test it against the `accept-misplacement-repro.test.ts` cases **plus** new table/list/image cases.
2. **Repoint the two gates** (`route.ts`, `validate-suggestion.ts`) to `locateEdit`. Ship. (Now the button reflects reality; some previously-enabled-but-broken suggestions correctly show as stale — an immediate UX improvement.)
3. **Reimplement `injectSuggestionMarks` internals** to call `locateEdit` for matching (keep the mark-splitting code). Delete `collectTextRefs`. Ship.
4. **Fix the preview** to respect `status` (`tiptap-section-field.ts:731`). Ship.
5. **Unify accept surfaces** on `applyEditToDoc` over section state. Remove the editor-local accept path. Ship.
6. **Delete dead flatteners** (`collectTextRefs`, `replaceTextInDoc`'s ad-hoc collector if unused after chat is repointed) and the warning comment at `suggestion-inject.ts:59` — the invariant no longer needs guarding because it no longer exists.

### 5.8 What this explicitly does *not* solve

Concurrent rebasing: if two users edit the same field between generation and accept, `locateEdit` can only say "still there / gone / ambiguous." That's correct and safe (never misplaces), but it will drop more suggestions under heavy concurrent editing. If that becomes a problem, adopt **Strategy B** (position-based suggestions): resolve `{from,to}` once at generation into the existing `fromPos`/`toPos` columns and rebase them with a ProseMirror `StepMap`/diff before accept, so accept is a pure position replacement. Strategy A is a prerequisite for B (both need the single locator), so this is a roadmap item, not a fork.

---

## 6. Recommended sequencing

1. Steps 1–4 above (tactical + core consolidation) — kills the two CRITICAL data-loss bugs.
2. Step 5 — removes the dual-surface class of bugs.
3. Step 6 — pays down the complexity debt.
4. Strategy B — only if concurrent-edit suggestion loss is observed in practice.

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

### 7.5 The assertion (illustrative — add during migration Step 1)

The proof, written as it would appear in a test, asserts the *contradiction between gate and
injector* rather than a UI outcome — that contradiction is the bug:

```ts
// Illustrative only. To be added as a real test in Step 1 of §5.7, then made to pass
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
