import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSections, type DocumentType, type SectionType } from "@/db/schema";
import type { AuditActorSnapshot } from "@/lib/audit";
import { mergeSection } from "@/lib/sections-merge";
import { persistSectionContent } from "@/lib/reports/persist-section";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import {
  applyCommitToSectionContent,
  type CommitEditFailureStatus,
  type CommitEditInput,
} from "@/lib/suggestions/apply-commit-content";
import { extractFieldContent } from "@/lib/suggestions/suggestion-record";
import { mergeField } from "@/lib/suggestions/three-way-merge";
import { setPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import type { FieldContent } from "@/lib/suggestions/diff-plan";

export type TurnEditItem = {
  section: SectionType;
  targetField: string;
  reasoning: string;
};

export type {
  CommitEditFailureStatus,
  CommitEditInput,
};
export { applyCommitToSectionContent };

export type CommitEditResult =
  | { status: "applied"; section: SectionType; targetField: string; summary: string }
  | { status: "section_not_found"; message: string }
  | { status: CommitEditFailureStatus; hint?: string };

function writeFieldContent(
  content: Record<string, unknown>,
  section: SectionType,
  targetField: string,
  field: FieldContent
): Record<string, unknown> {
  if (typeof field === "string") {
    return setPlainTextFieldValue(content, targetField, field);
  }
  if (isRichTargetField(section, targetField)) {
    return setRichFieldValue(content, targetField, field);
  }
  return content;
}

export async function commitChatEdit(args: {
  reportId: string;
  actor: AuditActorSnapshot;
  documentType: DocumentType;
  section: SectionType;
  targetField: string;
  reasoning: string;
  input: CommitEditInput;
}): Promise<CommitEditResult> {
  const applied = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(reportSections)
      .where(
        and(
          eq(reportSections.reportId, args.reportId),
          eq(reportSections.section, args.section)
        )
      )
      .for("update");

    const previous = row
      ? (mergeSection(args.section, row.content) as Record<string, unknown>)
      : (mergeSection(args.section, {}) as Record<string, unknown>);

    const next = applyCommitToSectionContent({
      content: previous,
      section: args.section,
      targetField: args.targetField,
      documentType: args.documentType,
      input: args.input,
    });
    if (!next.ok) return next;

    let content = next.content;
    // Table ops already mutate the TipTap matrix. Running that result through
    // mergeField used to flatten cells into prose and drop demo DV columns.
    if (args.input.kind !== "table") {
      const base = extractFieldContent(previous, args.section, args.targetField);
      const intent = extractFieldContent(content, args.section, args.targetField);
      const merged = mergeField(base, base, intent);
      if (merged.status === "conflict") {
        return {
          ok: false as const,
          status: "conflict" as const,
          hint: "This edit conflicts with the current field. Re-read and retry.",
        };
      }
      content = writeFieldContent(
        previous,
        args.section,
        args.targetField,
        merged.merged
      );
    }

    await persistSectionContent({
      actor: args.actor,
      reportId: args.reportId,
      section: args.section,
      content,
      executor: tx,
    });
    return { ok: true as const, content };
  });

  if (!applied.ok) {
    return { status: applied.status, hint: applied.hint };
  }

  return {
    status: "applied",
    section: args.section,
    targetField: args.targetField,
    summary: args.reasoning,
  };
}
