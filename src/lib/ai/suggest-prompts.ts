import type { CriterionStatus, SectionType } from "@/db/schema";
import { SUGGEST_TARGET_FIELD_PATTERNS } from "@/lib/ai/suggest-target-fields";

export const SUGGEST_PROMPT_VERSION = "suggest-v3" as const;

/** Google model for suggestion generation (stronger reasoning + verbatim anchors). */
export const SUGGEST_GOOGLE_MODEL_ID = "gemini-3.1-pro-preview" as const;

export const SUGGEST_TEMPERATURE = 0.4 as const;

export function buildSuggestionSystemPrompt(section: SectionType): string {
  const fields = SUGGEST_TARGET_FIELD_PATTERNS[section].join(", ");
  const fieldHint =
    section === "improve"
      ? '\n- For IMPROVE, targetField MUST be "correctiveActions" (the corrective action editor). Do not use "narrative".'
      : section === "control"
        ? '\n- For CONTROL, targetField MUST be "preventiveActions". Do not use "narrative".'
        : "";
  return `You are a pharmaceutical QA writing assistant. You produce precise, minimal text edits for investigation report sections.

RULES:
- Output JSON only, matching the provided schema.
- Each suggestion fixes ONE failing criterion listed in the user message.
- anchorText MUST be a verbatim substring from SECTION CONTENT (current section only). Copy punctuation and spacing exactly. Use a long enough span (roughly a full clause) so it appears only once in the section.
- deleteText MUST be a verbatim substring of anchorText (or "" for pure insert).
- insertText is the replacement prose (or "" for pure delete). At least one of deleteText or insertText must be non-empty.
- For pure inserts after a word, start insertText with a leading space when it continues the same sentence (e.g. insertText: " regarding the root cause").
- targetField MUST be one of: ${fields || "narrative"}.${fieldHint}
- For unknown facts use bracket placeholders: [Label: <to be filled>] (same as the editor). Do NOT use bare <to be filled: …> without square brackets.
- Assume the author will fill existing placeholders later. Treat them as standing in for the labeled fact — do NOT replace [Label: <to be filled>] with invented concrete text (e.g. do not change [SOP number: <to be filled>] to SOP/DP/QC/045).
- If the only change needed for a criterion is filling an existing placeholder, do not return a suggestion that edits that token; suggest edits elsewhere only when other prose gaps remain.
- Guidance-only brackets like [batch number] are OK when inserting new missing text; do not overwrite existing placeholders.
- Do not speculate beyond what the criterion requires. Keep edits minimal.
- If the section already has a [Label: <to be filled>] (or similar) for a missing fact, do not add another placeholder for the same fact.
- Do not suggest fixes for criteria not listed in FAILING CRITERIA.
- Criteria marked PARTIALLY MET still have concrete gaps — produce a minimal edit for each one listed, same as NOT MET.
- Return exactly one suggestion per criterion key in FAILING CRITERIA (no omissions).

NEW-PARAGRAPH INSERTS:
When the content you are adding is topically distinct from all existing paragraphs (i.e. it would naturally begin a new paragraph in formal writing — e.g. a regulatory notification statement after a root-cause conclusion, a scope statement after an event description), set anchorText to "" (empty string). This triggers end-of-section paragraph insertion. Do NOT inline-append to an existing sentence just because it is nearby.

CRITERION-SPECIFIC PLACEMENT RULES:
- measure.regulatory_notification: This is always a new-paragraph insert. Set anchorText to "". The inserted sentence must explicitly state EITHER (a) regulatory notification was not required, with a brief rationale tied to the nature of the deviation (e.g., no product impact, calibration only), OR (b) regulatory notification was required and provide the details. For unknown regulatory details, use: "[Regulatory notification: <to be filled>]".

OPERATIONS (implicit from deleteText/insertText):
- replace: both deleteText and insertText non-empty
- insert: deleteText empty, insertText non-empty (anchor locates where to insert after)
- delete: insertText empty, deleteText non-empty`;
}

export function buildSuggestionUserPrompt({
  section,
  contentStr,
  priorBlock,
  failingCriteria,
}: {
  section: SectionType;
  contentStr: string;
  priorBlock: string;
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
"""${priorBlock}

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

Return one suggestion object per failing criterion key listed above.`;
}
