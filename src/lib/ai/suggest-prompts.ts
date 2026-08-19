import type { CriterionStatus, SectionType } from "@/db/schema";
import { SUGGEST_TARGET_FIELD_PATTERNS } from "@/lib/ai/suggest-target-fields";
import {
  dvFixedTableFormatGuidance,
  isDvTableOnlySection,
  isDvTableSection,
} from "@/lib/document-types/design-verification/sections";

export const SUGGEST_PROMPT_VERSION = "suggest-v13-scoped-cell-list-edits" as const;

/** Google model for suggestion generation (stronger reasoning + verbatim anchors). */
export const SUGGEST_GOOGLE_MODEL_ID = "gemini-3.1-pro-preview" as const;

export const SUGGEST_TEMPERATURE = 0.4 as const;

/**
 * Reasoning depth for suggestion generation. Measured: "medium" is ~2x faster
 * than "high" (~16s vs ~33s on the pro model) with no observed quality loss;
 * "low" gives no further latency benefit.
 */
export const SUGGEST_THINKING_LEVEL = "medium" as const;

function fieldHintForSection(section: SectionType): string {
  if (section === "improve") {
    return '\n- For IMPROVE, targetField MUST be "correctiveActions" (the corrective action editor). Do not use "narrative".';
  }
  if (section === "control") {
    return '\n- For CONTROL, targetField MUST be "preventiveActions". Do not use "narrative".';
  }
  if (section === "measure") {
    return '\n- For MEASURE, targetField MUST be "narrative" — it is the section\'s only editable field.';
  }
  if (isDvTableOnlySection(section)) {
    return '\n- For this matrix section, targetField MUST be "table". Preserve the seeded column headers; edit cell values only.';
  }
  return "";
}

export function buildSuggestionSystemPrompt(section: SectionType): string {
  const fields = SUGGEST_TARGET_FIELD_PATTERNS[section].join(", ");
  const fieldHint = fieldHintForSection(section);
  const tableFormatBlock = isDvTableSection(section)
    ? `\n\n${dvFixedTableFormatGuidance({ section, surface: "suggest" })}`
    : "";
  return `You are a quality documentation writing assistant. You produce precise, minimal text edits for investigation report sections.

RULES:
- Output JSON only, matching the provided schema.
- Each suggestion fixes ONE failing criterion listed in the user message.
- For PROSE, anchorText MUST be a verbatim substring from SECTION CONTENT (current section only). Copy punctuation and spacing exactly. Use a long enough span (roughly a full clause) so it appears only once in the section. SECTION CONTENT prose uses plain text only — no markdown table pipes, no list numbers, no [equation]/[image] tokens.
- For a TABLE CELL or LIST ITEM, do NOT use a long anchor. Instead set "scope" to the coordinate shown in SECTION CONTENT: a cell tagged [r,c] → scope {"kind":"cell","row":r,"col":c}; a list item tagged [i] → scope {"kind":"listItem","index":i}. Leave anchorText "". Put ONLY that cell/item's current text in deleteText (or "" to set an empty cell) and the new text in insertText. Never quote the [r,c] / [i] tags, and never let deleteText span two cells or two items.
- deleteText MUST be a verbatim substring of anchorText (or, for a scoped cell/item edit, the current text of that one cell/item; or "" for a pure insert).
- insertText is the replacement prose (or "" for pure delete). At least one of deleteText or insertText must be non-empty.
- For pure inserts after a word, start insertText with a leading space when it continues the same sentence (e.g. insertText: " regarding the root cause").
- targetField MUST be one of: ${fields || "narrative"}.${fieldHint}
- For unknown facts use bracket placeholders: [Label: <to be filled>] (same as the editor). Do NOT use bare <to be filled: …> without square brackets.
- Assume the author will fill existing placeholders later. Treat them as standing in for the labeled fact — do NOT replace [Label: <to be filled>] with invented concrete text (e.g. do not change [Procedure reference: <to be filled>] to a specific document number).
- If the only change needed for a criterion is filling an existing placeholder, do not return a suggestion that edits that token; suggest edits elsewhere only when other prose gaps remain.
- Guidance-only brackets like [batch number] are OK when inserting new missing text; do not overwrite existing placeholders.
- Do not speculate beyond what the criterion requires. Keep edits minimal.
- insertText MUST match the writing style, voice, and terminology already present in the section. Do NOT echo the criterion question back as prose (e.g. do not write "The expected outcome of the preventive action is X, which can be verified by Y" — instead continue the action description naturally, stating what will result and how it will be confirmed using the same vocabulary as the surrounding text).
- Do NOT prefix insertText with document field or section labels (e.g. "Final Comments:", "Interim Plan:", "Preventive Action:", "Regulatory notification:", "Recommended Lot Disposition:", "Effectiveness Verification:", "Conclusion Final Decision:"). These labels are already part of the document template structure. Only insert the prose content itself.
- Do NOT introduce the term "CAPA" in insertText unless the section content already uses that exact term. If the section describes actions as an SOP revision, corrective action, or preventive action without calling them a CAPA, refer to them by the same terminology used in the section.
- If the section already has a [Label: <to be filled>] (or similar) for a missing fact, do not add another placeholder for the same fact.
- Do not suggest fixes for criteria not listed in FAILING CRITERIA.
- Criteria marked PARTIALLY MET still have concrete gaps — produce a minimal edit for each one listed, same as NOT MET.
- Return exactly one suggestion per criterion key in FAILING CRITERIA (no omissions).

NEW-PARAGRAPH INSERTS:
When the content you are adding is topically distinct from all existing paragraphs (i.e. it would naturally begin a new paragraph in formal writing — e.g. a regulatory notification statement after a root-cause conclusion, a scope statement after an event description), set anchorText to "" (empty string). This triggers end-of-section paragraph insertion. Do NOT inline-append to an existing sentence just because it is nearby.

CRITERION-SPECIFIC PLACEMENT RULES:
- measure.regulatory_notification: targetField MUST be "narrative". This is always a new-paragraph insert. Set anchorText to "". The inserted sentence must explicitly state EITHER (a) regulatory notification was not required, with a brief rationale tied to the nature of the deviation (e.g., no product impact, calibration only), OR (b) regulatory notification was required and provide the details. For unknown regulatory details, use: "[Regulatory notification: <to be filled>]".
- improve.effectiveness / control.effectiveness: When effectiveness verification is required, the inserted text must include all four elements: (1) trigger — when verification starts (e.g., "following approval of the revised SOP"); (2) cadence/count — derive from the calibration or activity schedule already described in the section content or prior sections (e.g., if the section mentions monthly calibration, use "next [N] monthly calibrations"); (3) measurable pass criterion — use the specific acceptance limit from the section (e.g., "blank TOC NMT 100 ppb"); (4) responsible person as "[Responsible person: <to be filled>]". Do not state the outcome as "can be verified by X" — state it as "will be verified by [person] by checking [metric] across [count] [cadence] following [trigger]".

OPERATIONS (implicit from deleteText/insertText):
- replace: both deleteText and insertText non-empty
- insert: deleteText empty, insertText non-empty (anchor locates where to insert after)
- delete: insertText empty, deleteText non-empty${tableFormatBlock}`;
}

export function buildSuggestionUserPrompt({
  section,
  contentStr,
  priorBlock,
  evidenceBlock,
  failingCriteria,
}: {
  section: SectionType;
  contentStr: string;
  priorBlock: string;
  evidenceBlock?: string;
  failingCriteria: Array<{
    key: string;
    label: string;
    reasoning: string;
    status: CriterionStatus;
  }>;
}): string {
  const statusLabel = (status: CriterionStatus) =>
    status === "not_met" ? "NOT MET" : status === "partially_met" ? "PARTIALLY MET" : status;

  return `SECTION: ${section.toUpperCase()}

SECTION CONTENT (editable — anchorText must come from here only):
"""
${contentStr}
"""${priorBlock}${evidenceBlock ?? ""}

FAILING CRITERIA TO FIX (one suggestion per criterion listed; NOT MET items are highest priority):
${failingCriteria
  .map(
    (c, i) =>
      `${i + 1}. [${c.key}] ${c.label} (${statusLabel(c.status)})\n   Evaluation reasoning: ${c.reasoning}`
  )
  .join("\n")}

EXAMPLES:

Replace:
{
  "criterionKey": "define.datetime",
  "targetField": "narrative",
  "anchorText": "On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation",
  "deleteText": "DD/MM/YYYY at approximately HH:MM hrs",
  "insertText": "[detection date: <to be filled>] at approximately [time: <to be filled>] hrs",
  "reasoning": "Adds explicit date/time placeholders where the prose was vague."
}

Pure insert:
{
  "criterionKey": "define.initial_scope",
  "targetField": "narrative",
  "anchorText": "Initial scope was limited to Line 3 filling operations.",
  "deleteText": "",
  "insertText": " The investigation was later expanded to include Line 4.",
  "reasoning": "Adds scope expansion required by the criterion."
}

Pure delete:
{
  "criterionKey": "define.what_happened",
  "targetField": "narrative",
  "anchorText": "The operator likely forgot the interlock, which probably caused the deviation.",
  "deleteText": "likely forgot the interlock, which probably caused",
  "insertText": "",
  "reasoning": "Removes speculative language."
}

Table cell edit (SECTION CONTENT shows "[2,3] Pass"):
{
  "criterionKey": "traceability.result_recorded",
  "targetField": "table",
  "anchorText": "",
  "deleteText": "Pass",
  "insertText": "Fail — see attachment 3",
  "scope": { "kind": "cell", "row": 2, "col": 3 },
  "reasoning": "Records the actual result for this test in its cell."
}

Return one suggestion object per failing criterion key listed above.`;
}
