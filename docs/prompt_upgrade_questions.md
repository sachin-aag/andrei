# Prompt Upgrade — Decision Questions

Review each question below. Mark your answer or adjust the suggested assumption.
Once finalized, we'll translate these into prompt changes.

---

## A. Tighten `partially_met` definition

**Problem:** 67.4% of disagreements stem from models interpreting `partially_met` differently. The current definition ("addressed but with gaps, ambiguity, or missing specifics") is too vague.

### A1. What counts as a "gap"?

**Q:** Should stylistic/wording improvements count as gaps that warrant `partially_met`?

**Suggested answer:** No. Only missing *factual elements* (IDs, dates, SOP references, batch numbers, responsible persons, tracking numbers) are gaps. Minor rewording preferences that don't add missing factual content should still be rated `met`.

### A2. When does `partially_met` become `not_met`?

**Q:** If a criterion requires multiple factual elements and *all* are missing, should that be `partially_met` or `not_met`?

**Suggested answer:** `not_met`. Use `partially_met` only when *some* required elements are present but others are missing. If the section says nothing relevant to the criterion at all, that's `not_met`, not a middle-ground `partially_met`.

### A3. Calibration tiebreaker

**Q:** When the model is uncertain between `met` and `partially_met`, what test should it apply?

**Suggested answer:** Ask: "Is there a specific factual element (ID, date, SOP reference, batch number, tracking field) that the criterion explicitly asks for and the section does not provide?" If no → `met`. If yes → `partially_met` (but only if other required elements *are* present).

---

## B. 5-Why completeness standard (`analyze.fivewhy_completeness`)

**Problem:** 92% disagreement on this criterion. The prompt doesn't define what makes a chain "complete."

### B1. Starting point

**Q:** Must the 5-Why chain start from the specific observed deviation, or can it start from a general statement?

**Suggested answer:** Must start from the specific observed deviation described in Define/Measure. A generic starting point like "Equipment failed" without referencing the actual event is insufficient.

### B2. Chain length

**Q:** Must the chain have exactly 5 "why" questions?

**Suggested answer:** No. Fewer (as short as 3) or more (up to 8) are acceptable as long as the chain logically reaches the root cause. This is already in the current prompt but should be reinforced in the criterion-specific guidance.

### B3. What is an acceptable root cause?

**Q:** Is "human error" an acceptable root cause?

**Suggested answer:** No, not by itself. The chain must reach a *procedural or systemic gap* that made the human error possible (e.g., "no interlock on the valve" or "SOP did not require a verification step"). Stopping at "human error" without a procedural gap = `not_met`.
// not yet fed B3 in

### B4. Speculative steps

**Q:** If the chain reaches a plausible root cause but some intermediate steps are speculative or skip logical levels, what rating?

**Suggested answer:** `partially_met`. The chain shows analytical effort but lacks rigour in the middle.

### B5. Circular or contradictory chains

**Q:** If the chain repeats wording across whys, goes in circles, or the conclusion contradicts the chain logic, what rating?

**Suggested answer:** `not_met`.

### B6. External references in answers

**Q:** Should chains be penalized for referencing OEM findings or external investigation results in their answers?

**Suggested answer:** No. OEM reports and external investigation findings are valid evidence within the chain.

### B7. Unused Why slots

**Q:** If the root cause is reached in 3 whys and the remaining slots say "Not Applicable", is that acceptable?

**Suggested answer:** Yes. Unused slots marked N/A are fine as long as the chain logically concluded.

// not yet fed b6, b7

---

## C. N/A handling

**Problem:** 5 systematic cases where a criterion evaluates properties of an action (tracking fields, outcomes, achievability) but no such action exists.

### C1. Justified absence

**Q:** If a section explicitly explains *why* no action is needed (e.g., "no preventive action required because the root cause was a one-time equipment failure with no recurrence mechanism"), should criteria about action properties (tracking ID, due date, etc.) be rated `met` or `not_met`?

**Suggested answer:** `met` — with reasoning noting the rationale is adequate and the criterion is satisfied by the justified absence.

### C2. Unjustified absence

**Q:** If no action exists and the section gives *no* explanation for why, what rating for action-property criteria?

**Suggested answer:** `not_met` — silence on both the action and the rationale for its absence is a gap.

### C3. Should we add a `not_applicable` status?

**Q:** Instead of forcing `met`/`not_met` for genuinely inapplicable criteria, should we add a fourth status value?

**Suggested answer:** Defer this (Tier 2 change). For now, handle it via the prompt rule above. If we still see issues after the prompt changes, revisit adding `not_applicable` to the schema.

---

## D. CAPA deferral rule

**Problem:** Some sections say "responsibilities and dates shall be assigned in the CAPA form" without providing them inline. Models disagree on whether this counts.

### D1. Deferred tracking fields

**Q:** If the section says tracking fields (CAPA number, responsible person, due date) "will be assigned in the CAPA form", should the criterion be `met` because the intent is there, or `not_met` because *this section* doesn't contain the info?

**Suggested answer:** `not_met`. The criterion asks whether *this section* contains the information. A promise to fill it elsewhere doesn't satisfy the criterion.

### D2. Deferred effectiveness verification

**Q:** If the section mentions that effectiveness verification is required but defers the method to the CAPA form, what rating?

**Suggested answer:** `partially_met` — the section at least acknowledges that effectiveness verification is needed and provides rationale. `not_met` only if effectiveness isn't mentioned at all.

### D3. Does "deferred to CAPA" count as a rationale for absence?

**Q:** Should "will be addressed in CAPA form" be treated as a valid rationale under the N/A handling rule (C1)?

**Suggested answer:** No. Deferral to another document is not the same as explaining why something is unnecessary. Deferral means the information *is* required but simply not present here.

---

## E. Cross-section traceability

**Problem:** Models sometimes rate corrective/preventive actions as `met` even when they don't address the root causes identified in Analyze.

### E1. Root cause tracing

**Q:** When evaluating Improve/Control actions, should the model actively check whether each action traces back to a root cause identified in the Analyze section?

**Suggested answer:** Yes. If Analyze identifies multiple contributing factors, each should be addressed by at least one action. An action that addresses a *different* issue than the identified root cause should be `not_met` for root-cause linkage criteria.

### E2. Which criteria does this apply to?

**Q:** Which specific criteria should require cross-section checking?

**Suggested answer:** At minimum: `improve.per_root_cause`, `improve.linked_to_root_cause`, `control.linked_to_root_cause`, and any criterion that explicitly mentions "root cause" in its description.

---

## F. `define.initial_scope` (77% disagreement)

**Problem:** Models disagree on what constitutes an adequate scope statement.

### F1. Specificity requirement

**Q:** Does the scope need to name specific identifiers (batch numbers, equipment IDs, material names)?

**Suggested answer:** Yes. "Semi-finished and finished product batches were stored" without listing which batches = `partially_met`. "Scope limited to Batch No. X, Y, Z" = `met`. Completely omitting scope = `not_met`.

### F2. SCADA scope exception

**Q:** For SCADA-related deviations, is naming the system + affected time periods sufficient without specific equipment IDs?

**Suggested answer:** Yes. This exception is already in the current prompt and should be preserved.

---

## G-I. Structural / algorithmic changes (Tier 2-3)

These are not prompt-only changes — they require code changes. Answer these to decide whether to pursue them after the prompt fixes.

### G1. `not_applicable` schema status

**Q:** After applying prompt changes A-F, if N/A handling still causes >5% of disagreements, should we add a fourth status?

**Suggested answer:** Yes, but only if the prompt-level fix doesn't resolve it. Estimate: 1-2 hours of schema + UI work.

### H1. Conditional criteria

**Q:** Should Control criteria about preventive actions only be evaluated when preventive actions actually exist?

**Suggested answer:** Yes in principle, but defer to two-pass triage (I1) which handles this more cleanly. For now, the N/A handling rule (C) covers the main cases.

### I1. Two-pass triage

**Q:** Should we implement a first pass that determines which criteria apply (does the report have preventive actions? CAPA? etc.) before the second pass evaluates?

**Suggested answer:** Defer. This is the cleanest long-term solution but requires non-trivial code changes. Try prompt fixes first.

---

## J. Few-shot calibration

### J1. Gold-standard examples

**Q:** Should we include 2-3 human-reviewed evaluation examples in the prompt to anchor the `partially_met` boundary?

**Suggested answer:** Yes, but as a Tier 2 follow-up after the prompt changes are tested. Pick the most contentious reports (DEV-WH-25-003, DEV-PR-25-008) and create gold-standard evaluations.

### J2. Prompt length concern

**Q:** Adding few-shot examples will significantly increase prompt token count. Is that acceptable?

**Suggested answer:** Yes, within reason. 2-3 examples at ~200 tokens each is ~600 tokens — negligible compared to the section content. Keep examples concise: just the criterion key, section snippet, correct status, and 1-sentence reasoning.

---

## K-L. Ensemble and model selection

### K1. Majority vote

**Q:** Should we run 3 evaluation calls and take majority vote as a safety net?

**Suggested answer:** Not yet. This 3x's the cost and latency. Try prompt fixes first. Revisit only if agreement plateaus below 80%.

### L1. Model selection

**Q:** Current model is Gemini 3.1-flash-lite. The analysis suggests Claude Opus 4-7 has the best evaluation profile. Should we switch?

**Suggested answer:** Not yet. Flash-lite is chosen for cost and speed (36 criteria × many reports). First tighten the prompts — if Gemini still underperforms after prompt fixes, test Claude as a follow-up. The cost difference is significant (~10-20x).

---

## Implementation priority (confirm or reorder)

| # | Change | Prompt-only? | Expected impact |
|---|--------|-------------|-----------------|
| 1 | Tighten `partially_met` definition (A) | Yes | ~60-80 of 178 disagreements |
| 2 | Fix 5-Why completeness standard (B) | Yes | ~12 disagreements |
| 3 | Add N/A handling rule (C) | Yes | ~5-10 disagreements |
| 4 | Add CAPA deferral rule (D) | Yes | ~13 disagreements |
| 5 | Tighten `initial_scope` description (F) | Yes | ~10 disagreements |
| 6 | Cross-section traceability (E) | Yes | Quality improvement |
| 7 | Few-shot calibration (J) | Yes | Residual calibration |
| 8 | `not_applicable` status (G) | No (schema) | Structural fix |
| 9 | Two-pass triage (I) | No (code) | Eliminates N/A problem |

**Q:** Does this priority order look right? Should anything move up or down?
