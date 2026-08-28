import type { DocumentType, SectionType } from "@/db/schema";
import {
  type ChatSectionScope,
  sectionFillState,
  sectionLabel,
} from "@/lib/ai/chat/fields";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";

const DRAFT_REQUEST_RE =
  /\b(?:draft|write(?:\s+(?:up|out|the))?|prepare|populate|fill(?:\s+(?:in|out|the))?|complete|do this section)\b/i;

const EXPLICIT_REWRITE_RE =
  /\b(?:re-?write|replace(?:\s+(?:the|this|it))?|start over|from scratch|full(?:y)?\s+replace)\b/i;

export type AlreadyDraftedSection = {
  section: SectionType;
  fillState: "partial" | "filled";
};

/**
 * True when the engineer asked to produce a section (draft / fill / write),
 * not when they asked to replace it from scratch.
 */
export function isSectionDraftRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (EXPLICIT_REWRITE_RE.test(trimmed)) return false;
  return DRAFT_REQUEST_RE.test(trimmed);
}

/**
 * When "draft this section" lands on a field that already has content, the
 * assistant should read and review it — not search attachments or quiz the
 * engineer for facts it already has.
 */
export function detectAlreadyDraftedSection(input: {
  userText: string;
  sectionScope?: ChatSectionScope;
  documentType?: DocumentType;
  sections: Partial<Record<SectionType, Record<string, unknown>>>;
}): AlreadyDraftedSection | null {
  if (!isSectionDraftRequest(input.userText)) return null;

  const documentType = input.documentType ?? "investigation_report";
  const fromIntent = detectSectionIntentFromText(input.userText, documentType);
  const scope = input.sectionScope ?? "all";
  const section = fromIntent ?? (scope !== "all" ? scope : null);
  if (!section) return null;

  const fillState = sectionFillState(input.sections[section], section);
  if (fillState === "empty") return null;
  return { section, fillState };
}

export function alreadyDraftedBlock(
  already: AlreadyDraftedSection,
  mode: "plan" | "agent"
): string {
  const label = sectionLabel(already.section);
  const reviewThen =
    mode === "plan"
      ? `Call read_section on "${already.section}" FIRST. Do not call search_documents or ask_user yet.
Then compare the current text to that section's quality criteria and answer from it.
- No material gaps: say the section is already drafted, summarize what is there in one or two sentences, and ask whether they want a specific change. Do not invite a rewrite.
- Gaps found: name the gaps. Do not quiz them for facts already in the section.`
      : `Call read_section on "${already.section}" FIRST. Do not call search_documents or ask_user yet.
Then compare the current text to that section's quality criteria:
- No material gaps: do not rewrite and do not ask_user. Reply that the section is already drafted, summarize what is there in one or two sentences, and ask whether they want a specific change.
- Gaps found: search attachments only for the missing facts, then make a targeted propose_edit (or edit_table). Do not draft_field a full rewrite unless they asked to replace the section.`;

  return `## Already drafted (review first)
The engineer asked to draft **${label}** [${already.section}], which the context map marks **${already.fillState}**.
${reviewThen}
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
