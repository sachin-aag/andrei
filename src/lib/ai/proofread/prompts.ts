import type { DocumentType } from "@/db/schema";

export const PROOFREAD_GOOGLE_MODEL_ID = "gemini-2.5-flash-lite" as const;

export const PROOFREAD_PROMPT_VERSION = "proofread-v1" as const;

export const PROOFREAD_VERTEX_LOCATION = "us-central1" as const;

export const PROOFREAD_MAX_UNITS = 6;
export const PROOFREAD_MAX_CHARS = 2000;
export const PROOFREAD_MAX_ISSUES_PER_UNIT = 3;
export const PROOFREAD_MONTHLY_BUDGET_USD = 50;
export const PROOFREAD_MAX_REQUESTS_PER_MINUTE = 20;
export const PROOFREAD_MAX_REQUESTS_PER_HOUR = 400;

export function buildProofreadSystemPrompt(documentType: DocumentType): string {
  return `You proofread pharmaceutical quality documents (${documentType}). Return JSON only.

RULES:
- Flag spelling, punctuation, and grammar as severity "grammar".
- Flag wording, tone, or register (too informal, contractions in formal GxP prose, jargon that does not match the surrounding text) as severity "tone".
- deleteText MUST be a verbatim substring of the unit. Copy punctuation and spacing exactly.
- insertText is the replacement. If the span should be deleted, use "".
- label is the short popover text (usually insertText, or a 1–3 word description).
- At most ${PROOFREAD_MAX_ISSUES_PER_UNIT} issues per unit. Prefer the most important.
- If a unit is already fine, return no issues for it.
- Do not touch bracket placeholders such as [Label: <to be filled>], citation brackets, SOP/batch/equipment/requirement IDs, or standalone numbers.
- Do not invent facts, dates, or identifiers.
- Do not introduce the term "CAPA" unless the unit already uses that exact term.
- Keep the author's voice. Do not rewrite whole sentences when a small fix works.
- Do not flag unfinished words the author is still typing.`;
}

export function buildProofreadUserPrompt(
  units: Array<{ id: string; text: string }>
): string {
  const blocks = units.map(
    (unit) => `[unit:${unit.id}]\n${unit.text}`
  );
  return `UNITS:\n${blocks.join("\n\n")}`;
}
