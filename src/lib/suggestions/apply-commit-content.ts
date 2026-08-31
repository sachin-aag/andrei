import { createId } from "@paralleldrive/cuid2";
import type { DocumentType, SectionType } from "@/db/schema";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { PlaceholderPreservationError } from "@/lib/placeholders/preservation";
import { applyRedraftToSection } from "@/lib/suggestions/apply-redraft";
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

export type CommitEditFailureStatus =
  | "not_found"
  | "ambiguous"
  | "cross_cell"
  | "bad_scope"
  | "no_table"
  | "stale"
  | "fixed_schema"
  | "invalid"
  | "empty_edit"
  | "conflict"
  | "placeholder_conflict";

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
