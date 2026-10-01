import type { DocumentType, SectionType } from "@/db/schema";
import {
  type ChatSectionScope,
  sectionFillState,
  sectionHasEmptyIdentityValueCells,
  sectionLabel,
} from "@/lib/ai/chat/fields";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";
import type { ChatUserIntentKind } from "@/lib/ai/chat/user-intent";

const EXPLICIT_REWRITE_RE =
  /\b(?:re-?write|replace(?:\s+(?:the|this|it))?|start over|from scratch|full(?:y)?\s+replace)\b/i;

/**
 * The engineer named a document change to land now ("insert the suggestion",
 * "edit the document"). That is the task — not a review that stops at a summary.
 */
const EXPLICIT_DOCUMENT_EDIT_RE =
  /\b(?:insert|apply|land)\b.{0,60}\b(?:the\s+)?(?:suggestion|edit|change|update)\b|\bedit the document\b|\bmake the edit\b|\bput (?:it|that|this) in the (?:document|report|table|section)\b|\b(?:suggestion|card)s?\b.{0,40}\b(?:not landing|did(?:n't| not) land|aren'?t landing|never land(?:ed|ing)?)\b|\brefus(?:e|ing|ed) to (?:make |do |apply )?(?:an |the )?(?:edit|change|write)\b|\bonly summar(?:ising|izing|ised|ized)\b/i;

export type AlreadyDraftedSection = {
  section: SectionType;
  fillState: "partial" | "filled";
  /** Named rows still lack a document / SOP / reference number. */
  emptyIdentityCells?: boolean;
};

export type AlreadyDraftedGapHint = {
  status: "partially_met" | "not_met";
  label: string;
  reasoning?: string;
};

export type AlreadyDraftedGapHints =
  | { kind: "not_evaluated" }
  | { kind: "all_met" }
  | { kind: "gaps"; gaps: AlreadyDraftedGapHint[] };

const GAP_REASONING_MAX_CHARS = 200;

type GapEvaluationRow = {
  section: string;
  status: string;
  bypassed?: boolean | null;
  criterionLabel?: string | null;
  reasoning?: string | null;
};

function trimGapReasoning(reasoning: string | null | undefined): string | undefined {
  const trimmed = reasoning?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= GAP_REASONING_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, GAP_REASONING_MAX_CHARS - 1)}…`;
}

/**
 * Cached AI Check rows for one section, shaped for the already-drafted review
 * block. When the section was never evaluated, returns not_evaluated so the
 * model relies on the criteria outline after read_section.
 */
export function alreadyDraftedGapHints(
  section: SectionType,
  evaluations: readonly GapEvaluationRow[]
): AlreadyDraftedGapHints {
  const active = evaluations.filter(
    (row) => row.section === section && !row.bypassed
  );
  if (active.length === 0) return { kind: "not_evaluated" };

  const gaps: AlreadyDraftedGapHint[] = [];
  for (const row of active) {
    if (row.status !== "partially_met" && row.status !== "not_met") continue;
    const label = row.criterionLabel?.replace(/\s+/g, " ").trim();
    if (!label) continue;
    gaps.push({
      status: row.status,
      label,
      reasoning: trimGapReasoning(row.reasoning),
    });
  }

  if (gaps.length === 0) return { kind: "all_met" };
  return { kind: "gaps", gaps };
}

function formatGapHintsBlock(
  hints: AlreadyDraftedGapHints,
  emptyIdentityCells: boolean
): string {
  if (hints.kind === "not_evaluated") {
    return "AI Check: this section has not been evaluated yet — use the quality criteria list after read_section.";
  }
  if (hints.kind === "all_met" && emptyIdentityCells) {
    return "AI Check: all criteria met for this section — still fill empty identity cells (blank document / SOP / reference numbers on named rows). That is the draft request.";
  }
  if (hints.kind === "all_met") {
    return "AI Check: all criteria met for this section — strong signal there are no material gaps unless read_section clearly contradicts it.";
  }
  const lines = hints.gaps.map((gap) => {
    const status = gap.status === "not_met" ? "not met" : "partial";
    const reasoning = gap.reasoning ? ` — ${gap.reasoning}` : "";
    return `- ${status}: ${gap.label}${reasoning}`;
  });
  return `AI Check flagged for this section (gap hints — confirm against read_section before editing):\n${lines.join("\n")}`;
}

const GAP_REVIEW_RULES = `Gap rules:
- Material gap only: a criterion clearly not met, or a required fact the section structure says must appear when true. Ignore "could be more detailed" without a failing criterion.
- Empty cells they asked to fill (missing columns / blank DQ, IQ, OQ, PQ, or Remarks) are material gaps even when AI Check is all met. Empty required identity cells (blank Reference Number, SOP Number, or Document Number on a named row) are material gaps when they asked to draft or fill the section — including a bare "draft 1.3". A half-filled identity table is not already drafted. A filled family cell they asked to detail (13.6 → 13.6 – Gasket material verified as PTFE) is the same gap — overwrite it from the cited protocol. Search attachments for each empty row name; fill only cells a cited page supports; write NA when that family was searched and the parameter is not there. Do not paste a mapping table in chat.
- No padding: do not expand length; respect the section structure and any length the engineer asked for. Current text length is a soft ceiling unless they want more.
- Omit-if conflict: if filling a gap would violate an omit-if rule, ask once whether to include it (yes/no) — do not quiz them for facts already in the section or evidence.`;

/**
 * True when the engineer explicitly asked to replace a section from scratch.
 * That is the escape hatch from the already-drafted read-first gate.
 */
export function isExplicitSectionRewrite(text: string): boolean {
  return EXPLICIT_REWRITE_RE.test(text.trim());
}

/** True when this turn is "put that change in the document", not a review. */
export function isExplicitDocumentEdit(text: string): boolean {
  return EXPLICIT_DOCUMENT_EDIT_RE.test(text.replace(/\s+/g, " ").trim());
}

/**
 * When a write lands on a field that already has content, the assistant should
 * read and review it — not search attachments or quiz the engineer for facts
 * it already has. Gated on write intent + fill state (not draft/fill verbs),
 * so "remove VCS from Purpose" still forces read_section first.
 */
export function detectAlreadyDraftedSection(input: {
  userText: string;
  userIntentKind: ChatUserIntentKind;
  sectionScope?: ChatSectionScope;
  documentType?: DocumentType;
  sections: Partial<Record<SectionType, Record<string, unknown>>>;
}): AlreadyDraftedSection | null {
  if (input.userIntentKind !== "write") return null;
  if (isExplicitSectionRewrite(input.userText)) return null;

  const documentType = input.documentType ?? "investigation_report";
  const fromIntent = detectSectionIntentFromText(
    input.userText,
    documentType,
    { sections: input.sections }
  );
  const scope = input.sectionScope ?? "all";
  const section = fromIntent ?? (scope !== "all" ? scope : null);
  if (!section) return null;

  const fillState = sectionFillState(input.sections[section], section);
  if (fillState === "empty") return null;
  const emptyIdentityCells = sectionHasEmptyIdentityValueCells(
    input.sections[section],
    section
  );
  return {
    section,
    fillState: emptyIdentityCells ? "partial" : fillState,
    ...(emptyIdentityCells ? { emptyIdentityCells: true } : {}),
  };
}

/** Drop draft_field while the already-drafted gate is active. */
export function withoutDraftFieldTools(
  activeTools: readonly string[]
): string[] {
  return activeTools.filter((name) => name !== "draft_field");
}

export function alreadyDraftedBlock(
  already: AlreadyDraftedSection,
  mode: "plan" | "agent",
  gapHints: AlreadyDraftedGapHints = { kind: "not_evaluated" }
): string {
  const label = sectionLabel(already.section);
  const emptyIdentity = already.emptyIdentityCells === true;
  const reviewThen =
    mode === "plan"
      ? `Call read_section on "${already.section}" FIRST. Do not call search_documents or ask_user yet.
Then compare the current text to that section's quality criteria (and AI Check hints below, if any) and answer from it.
${
  emptyIdentity
    ? `- Empty identity cells: those named rows still need document / SOP / reference numbers. That is the draft — name the empty rows. Do not say the section is already drafted.`
    : `- No material gaps: say the section is already drafted, summarize what is there in one or two sentences, and ask whether they want a specific change. Do not invite a rewrite.`
}
- Gaps found: name the gaps. Do not quiz them for facts already in the section.`
      : `Call read_section on "${already.section}" FIRST. Do not call search_documents or ask_user yet.
Then compare the current text to that section's quality criteria (and AI Check hints below, if any):
- They asked to insert, apply, or edit the document (a cell, a row, or wording they already described): that is the change. After read_section, call edit_table for a table or propose_edit for prose. Do not stop at a summary. Do not paste a markdown table or the replacement text for them to copy. Do not say write tools are disabled or that this session is read-only.
${
  emptyIdentity
    ? `- Empty identity cells (blank Reference Number / SOP Number / Document Number on a named row): that is the draft they asked for. After read_section, search attachments for each empty row name (Purchase Order, Design Specification / Data Sheet, …) and edit_table only those cells. Do not overwrite filled identifiers. Do not say the section is already drafted.`
    : `- No specific change and no material gaps: do not rewrite and do not ask_user. Reply that the section is already drafted, summarize what is there in one or two sentences, and ask whether they want a specific change.`
}
- Gaps found, and they did not already name the change: search attachments only for the missing facts, then make a targeted propose_edit (or edit_table). Do not draft_field a full rewrite unless they asked to replace the section.`;

  return `## Already drafted (review first)
The engineer asked to draft **${label}** [${already.section}], which the context map marks **${already.fillState}**.
${formatGapHintsBlock(gapHints, emptyIdentity)}
${reviewThen}
${GAP_REVIEW_RULES}
Never call ask_user for a fact already in the section, retrieved evidence, or a hint you would write. If you know the answer, use it. The hint field is an expected format, never the answer itself.`;
}

/**
 * First model step: force a read of the current section so search/ask cannot
 * run before the assistant has seen what is already there.
 */
export function alreadyDraftedReadStep(opts: {
  stepsTaken: number;
  alreadyDrafted: boolean;
  hasReadSectionTool: boolean;
}):
  | {
      activeTools: ["read_section"];
      toolChoice: { type: "tool"; toolName: "read_section" };
    }
  | undefined {
  if (opts.stepsTaken !== 0 || !opts.alreadyDrafted || !opts.hasReadSectionTool) {
    return undefined;
  }
  return {
    activeTools: ["read_section"],
    toolChoice: { type: "tool", toolName: "read_section" },
  };
}
