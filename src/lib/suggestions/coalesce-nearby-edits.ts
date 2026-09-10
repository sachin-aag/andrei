/**
 * Same-turn nearby `propose_edit` cards. Two locatable spans whose gap in
 * canonical field text is shorter than {@link COALESCING_GAP} fold into one
 * gutter card. No per-field card count — distant paragraphs stay separate.
 */
import type { JSONContent } from "@tiptap/core";
import type { DocumentType, SectionType } from "@/db/schema";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import type { ParsedAiFixPayload } from "@/lib/ai/suggestion-gating";
import {
  applyCommitToSectionContent,
  type CommitEditInput,
} from "@/lib/suggestions/apply-commit-content";
import {
  COALESCING_GAP,
  coalesceWordDiff,
  type FieldContent,
} from "@/lib/suggestions/diff-plan";
import {
  flattenForAnchor,
  locateEdit,
  locateScopedEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { getPlainTextFieldValue, setPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { extractFieldContent } from "@/lib/suggestions/suggestion-record";

export { COALESCING_GAP };

export type NearbyEditRange = { start: number; end: number };

export type NearbyCoalesceSkipReason =
  | "lead_in"
  | "table"
  | "image"
  | "second"
  | "cell_scope";

export function rangeGap(a: NearbyEditRange, b: NearbyEditRange): number {
  if (a.end <= b.start) return b.start - a.end;
  if (b.end <= a.start) return a.start - b.end;
  return 0;
}

export function rangesWithinCoalescingGap(
  a: NearbyEditRange,
  b: NearbyEditRange
): boolean {
  return rangeGap(a, b) < COALESCING_GAP;
}

export function unionRange(
  a: NearbyEditRange,
  b: NearbyEditRange
): NearbyEditRange {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

export function nearbyCoalesceSkipReason(args: {
  leadIn?: boolean;
  tableOperation?: unknown;
  insertImage?: unknown;
  removeImage?: unknown;
  second?: unknown;
  scope?: { kind?: string } | null;
}): NearbyCoalesceSkipReason | null {
  if (args.leadIn) return "lead_in";
  if (args.tableOperation) return "table";
  if (args.insertImage || args.removeImage) return "image";
  if (args.second) return "second";
  if (args.scope?.kind === "cell") return "cell_scope";
  return null;
}

function locateToRange(
  located: { status: string; deleteStart?: number; deleteEnd?: number },
  fieldLength: number
): NearbyEditRange | null {
  if (located.status === "append") {
    return { start: fieldLength, end: fieldLength };
  }
  if (located.status !== "located") return null;
  const start = located.deleteStart;
  const end = located.deleteEnd;
  if (start == null || end == null) return null;
  return { start, end };
}

export function rangeForSuggestionEditOnField(args: {
  fieldText: string;
  fieldDoc: JSONContent | null;
  edit: SuggestionEdit;
}): NearbyEditRange | null {
  if (args.fieldDoc) {
    const index = flattenForAnchor(args.fieldDoc);
    return locateToRange(locateScopedEdit(index, args.edit), index.text.length);
  }
  return locateToRange(locateEdit(args.fieldText, args.edit), args.fieldText.length);
}

function flattenFieldContent(field: FieldContent): string {
  if (typeof field === "string") return field;
  return flattenForAnchor(field).text;
}

function contentWithField(
  live: Record<string, unknown>,
  section: SectionType,
  targetField: string,
  field: FieldContent
): Record<string, unknown> {
  if (isRichTargetField(section, targetField)) {
    return setRichFieldValue(live, targetField, field as JSONContent);
  }
  return setPlainTextFieldValue(live, targetField, String(field));
}

export function combineSuggestionReasoning(existing: string, next: string): string {
  const left = existing.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right || left === right) return left;
  if (left.includes(right)) return left;
  return `${left} ${right}`;
}

export type FoldNearbyProposeEditArgs = {
  existingPayload: ParsedAiFixPayload;
  liveContent: Record<string, unknown>;
  section: SectionType;
  targetField: string;
  documentType: DocumentType;
  proposed: SuggestionEdit;
  reasoning: string;
};

export type FoldNearbyProposeEditResult = {
  payload: ParsedAiFixPayload;
};

/**
 * Apply a second located edit onto an existing same-turn card's stored
 * intent, then freeze one spanning hunk (bridge text included) so inline
 * preview paints both changes as a single red/green run.
 */
export function foldNearbyProposeEdit(
  args: FoldNearbyProposeEditArgs
): FoldNearbyProposeEditResult | null {
  if (
    args.existingPayload.suggestionBase === undefined ||
    args.existingPayload.suggestionIntent === undefined
  ) {
    return null;
  }
  const record = {
    base: args.existingPayload.suggestionBase as FieldContent,
    intent: args.existingPayload.suggestionIntent as FieldContent,
  };

  const input: CommitEditInput = { kind: "located", edit: args.proposed };
  const onIntent = applyCommitToSectionContent({
    content: contentWithField(
      args.liveContent,
      args.section,
      args.targetField,
      record.intent
    ),
    section: args.section,
    targetField: args.targetField,
    documentType: args.documentType,
    input,
  });
  if (!onIntent.ok) return null;

  const newIntent = extractFieldContent(
    onIntent.content,
    args.section,
    args.targetField
  );
  const hunks = coalesceWordDiff(
    flattenFieldContent(record.base),
    flattenFieldContent(newIntent)
  );
  if (hunks.length !== 1) return null;
  const hunk = hunks[0]!;
  if (!hunk.deleteText && !hunk.insertText) return null;

  return {
    payload: {
      ...args.existingPayload,
      deleteText: hunk.deleteText,
      insertText: hunk.insertText,
      reasoning: combineSuggestionReasoning(
        args.existingPayload.reasoning,
        args.reasoning
      ),
      scope: undefined,
      second: undefined,
      suggestionBase: record.base,
      suggestionIntent: newIntent,
    },
  };
}

export function liveFieldTextForRange(args: {
  section: SectionType;
  targetField: string;
  content: Record<string, unknown>;
}): { fieldText: string; fieldDoc: JSONContent | null } {
  if (isRichTargetField(args.section, args.targetField)) {
    const fieldDoc = getRichFieldValue(args.content, args.targetField);
    return { fieldText: flattenForAnchor(fieldDoc).text, fieldDoc };
  }
  return {
    fieldText: getPlainTextFieldValue(args.content, args.targetField),
    fieldDoc: null,
  };
}
