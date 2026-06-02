Tier 1: Prompt Engineering

A. Tighten the partially_met definition (addresses 67.4% of disagreements)

This is the single highest-impact change. Replace: "partially_met": the criterion is addressed but with gaps, ambiguity, or missing specifics. With: "partially_met": the criterion is addressed with SUBSTANTIVE gaps — specific required elements (IDs, dates, SOP references, batch numbers, responsible persons) are missing or incomplete. Minor wording preferences, stylistic improvements, or rephrasing suggestions that do not add missing factual content are NOT gaps — rate "met" instead. Conversely, if the required content is entirely absent or addresses the wrong deviation/root cause, rate "not_met" — do not use partially_met as a middle ground when nothing relevant is present. Add a calibration rule: CALIBRATION: When in doubt between "met" and "partially_met", ask: "Is there a specific factual element (ID, date, SOP reference, batch number, tracking field) that the criterion asks for and the section does not provide?" If no, rate "met". If yes, rate "partially_met" only if OTHER required elements ARE present. If ALL required elements are missing, rate "not_met".

B. Fix analyze.fivewhy_completeness (addresses the 92% disagreement criterion)

The current criteria description defers to the system prompt for methodology detail, but the prompt is ambiguous about what makes a chain "complete." Add to the ANALYZE_PROMPT_ADDITION: 5-WHY COMPLETENESS STANDARD: A 5-Why chain is "met" when it: 1. Starts from the observed deviation (not a generic statement) 2. Each subsequent question logically follows from the prior answer 3. Reaches a root cause that is actionable (not just "human error") 4. Has a clear conclusion statement 5. Unused "Why" slots may be marked "Not Applicable" — this is acceptable

A 5-Why chain is "partially_met" when the chain reaches a plausible root cause but contains speculative/unsupported intermediate steps or skips logical levels.

A 5-Why chain is "not_met" when the chain is circular, contains repeated wording, jumps directly to "human error", or the conclusion contradicts the chain logic.

Do NOT penalize chains for having fewer than 5 questions if the root cause is reached logically. Do NOT penalize for having answers that reference OEM findings or external investigation results.

C. Add explicit N/A handling (addresses the 5 systematic N/A cases + prevents future drift)

Add to the common prompt: NOT-APPLICABLE SCENARIO: When a criterion evaluates properties of an action (tracking fields, expected outcome, achievability, linkage to root cause, effectiveness) and NO such action exists in the section:

If the section provides adequate rationale for why no action is needed, rate "met" with reasoning noting the rationale is adequate and the criterion is satisfied by the justified absence.
If the section provides NO rationale for the absence, rate "not_met". Do NOT rate "not_met" solely because an action does not exist when its absence is justified.
D. Add a CAPA deferral rule

CAPA DEFERRAL RULE: When the section states that responsibilities, due dates, or tracking details "shall be assigned in the CAPA form" without providing them in this section:

For tracking fields (unique number, responsible person, due date): rate "not_met" — the criterion asks whether THIS section contains the information.
For effectiveness verification: rate "partially_met" if the section at least states whether effectiveness verification is required and provides rationale, even if the method is deferred. Rate "not_met" if effectiveness is not mentioned at all.
E. Reward cross-section checking explicitly

Add to the IMPROVE_PROMPT_ADDITION and CONTROL_PROMPT_ADDITION: CROSS-SECTION TRACEABILITY: When evaluating whether actions address root causes, actively check the PRIOR SECTIONS context. If the Analyze section identifies

multiple contributing factors or root causes, each should be addressed by at

least one corrective/preventive action. Actions that address a different issue than the identified root cause should be rated "not_met" for the per_root_cause and linked_to_root_cause criteria.

F. Tighten define.initial_scope (77% disagreement)

Add to the criterion description in criteria.ts: The scope statement must include SPECIFIC identifiers (batch numbers, equipment IDs, material names). Saying "semi-finished and finished product batches were stored" without listing which batches is "partially_met". Saying "the scope is limited to Batch No. X, Y, Z" is "met". Completely omitting scope is "not_met".

Tier 2: Schema / Structural Changes

G. Add not_applicable status — same as before, changes the Zod enum to 4 values.

H. Weight criteria by section — the Control section has 14 criteria vs Define's 6. Consider whether some Control criteria should be conditional (only evaluated when preventive actions exist).

Tier 3: Algorithmic

I. Two-pass triage — a first pass determines which criteria apply to this report (does it have preventive actions? CAPA? etc.), then a second pass evaluates only applicable criteria.

J. Few-shot calibration — pick 2-3 of the most contentious reports (DEV-WH-25-003, DEV-PR-25-008) and create gold-standard human-reviewed evaluations. Include them as examples in the prompt. This anchors the partially_met boundary concretely.

K. Ensemble with majority vote — run 3 calls to the same model (or across models) and take majority. This is a safety net, not a fix.

L. Model selection — if you must pick one model, Claude Opus 4-7 has the best profile: moderate leniency, good cross-section checking, and the most nuanced use of partially_met. Gemini is too lenient/binary; GPT-5.5 over-hedges into partially_met.

Execution Priority

Priority: 1 Change: Tighten partially_met definition (A) Expected Impact: ~60-80 of 178 disagreements ──────────────────────────────────────── Priority: 2 Change: Fix 5-Why completeness standard (B) Expected Impact: ~12 disagreements ──────────────────────────────────────── Priority: 3 Change: Add N/A handling rule (C) Expected Impact: ~5-10 disagreements ──────────────────────────────────────── Priority: 4 Change: Add CAPA deferral rule (D) Expected Impact: ~13 disagreements ──────────────────────────────────────── Priority: 5 Change: Tighten initial_scope description (F) Expected Impact: ~10 disagreements ──────────────────────────────────────── Priority: 6 Change: Cross-section traceability (E) Expected Impact: quality improvement, fewer false-mets ──────────────────────────────────────── Priority: 7 Change: Few-shot calibration (J) Expected Impact: residual calibration ──────────────────────────────────────── Priority: 8 Change: not_applicable status (G) Expected Impact: structural fix for N/A ──────────────────────────────────────── Priority: 9 Change: Two-pass triage (I) Expected Impact: eliminates N/A problem entirely

Changes 1-5 are all prompt-only and should be testable with another sweep immediately. If agreement rises from 62% to ~80%+, you may not need the schema or algorithmic changes. prompt_upgrading.txt Displaying prompt_upgrading.txt.