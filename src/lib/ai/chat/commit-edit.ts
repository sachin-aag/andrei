import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { reportSections, type DocumentType, type SectionType } from "@/db/schema";
import type { AuditActorSnapshot } from "@/lib/audit";
import { mergeSection } from "@/lib/sections-merge";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { persistSectionContent } from "@/lib/reports/persist-section";
import { applyRedraftToSection } from "@/lib/suggestions/apply-redraft";
import { PlaceholderPreservationError } from "@/lib/placeholders/preservation";
import {
  applyAndAcceptRichEdit,
  applyEditToPlainText,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { getPlainTextFieldValue, setPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  applyTableOperation,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

export type TurnEditItem = {
  section: SectionType;
  targetField: string;
  reasoning: string;
};

export type CommitEditFailureStatus =
  | "not_found"
  | "ambiguous"
  | "cross_cell"
  | "bad_scope"
  | "too_large"
  | "no_table"
  | "stale"
  | "fixed_schema"
  | "invalid"
  | "empty_edit"
  | "placeholder_conflict";

export type CommitEditResult =
  | { status: "applied"; section: SectionType; targetField: string; summary: string }
  | { status: "section_not_found"; message: string }
  | { status: CommitEditFailureStatus; hint?: string };

export type CommitEditInput =
  | {
      kind: "located";
      edit: SuggestionEdit;
    }
  | {
      kind: "redraft";
      markdown: string;
      allowDropFilledPlaceholders?: boolean;
    }
  | {
      kind: "table";
      operation: TableOperation;
    };

export function applyCommitToSectionContent(args: {
  content: Record<string, unknown>;
  section: SectionType;
  targetField: string;
  documentType: DocumentType;
  input: CommitEditInput;
}):
  | { ok: true; content: Record<string, unknown> }
  | { ok: false; status: CommitEditFailureStatus; hint?: string } {
  const { content, section, targetField, documentType, input } = args;
  const headingNodes = documentType === "generic_document";

  switch (input.kind) {
    case "located": {
      if (isRichTargetField(section, targetField)) {
        const fieldDoc = getRichFieldValue(content, targetField);
        const applied = applyAndAcceptRichEdit(
          fieldDoc,
          createId(),
          input.edit
        );
        if (applied.status !== "located" && applied.status !== "append") {
          return { ok: false, status: applied.status };
        }
        return { ok: true, content: setRichFieldValue(content, targetField, applied.doc) };
      }
      const fieldText = getPlainTextFieldValue(content, targetField);
      const applied = applyEditToPlainText(fieldText, input.edit);
      if (applied.status !== "located" && applied.status !== "append") {
        return { ok: false, status: applied.status };
      }
      return {
        ok: true,
        content: setPlainTextFieldValue(content, targetField, applied.text),
      };
    }
    case "redraft":
      try {
        return {
          ok: true,
          content: applyRedraftToSection(
            content,
            section,
            targetField,
            input.markdown,
            {
              headingNodes,
              allowDropFilledPlaceholders: input.allowDropFilledPlaceholders,
            }
          ),
        };
      } catch (error) {
        if (error instanceof PlaceholderPreservationError) {
          return {
            ok: false,
            status: "placeholder_conflict",
            hint: error.message,
          };
        }
        throw error;
      }
    case "table": {
      const fieldDoc = getRichFieldValue(content, targetField);
      const applied = applyTableOperation(fieldDoc, input.operation, {
        section,
        targetField,
      });
      if (!applied.ok) {
        return { ok: false, status: applied.status, hint: applied.hint };
      }
      return { ok: true, content: setRichFieldValue(content, targetField, applied.doc) };
    }
    default: {
      const _exhaustive: never = input;
      return _exhaustive;
    }
  }
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

    await persistSectionContent({
      actor: args.actor,
      reportId: args.reportId,
      section: args.section,
      content: next.content,
      executor: tx,
    });
    return next;
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
