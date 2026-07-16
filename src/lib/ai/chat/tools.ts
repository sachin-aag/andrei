import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { comments, reportSections } from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { mergeSection } from "@/lib/sections-merge";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  serializeAiFixCommentContent,
  sectionContentHash,
} from "@/lib/ai/suggestion-gating";
import { isAllowedTargetField } from "@/lib/ai/suggest-target-fields";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  CHAT_EDITABLE_SECTIONS,
  type ChatSectionScope,
  chatSectionsInScope,
  chatTargetFields,
  isChatEditableSection,
  sectionFieldPlainText,
} from "@/lib/ai/chat/fields";
import { checkProposedEdit, proposedEditHint } from "@/lib/ai/chat/propose-edit";

export type ProposeEditResult =
  | {
      status: "proposed";
      suggestionId: string;
      section: SectionType;
      targetField: string;
      summary: string;
    }
  | { status: "not_editable"; message: string }
  | { status: "invalid_section"; message: string }
  | { status: "invalid_field"; message: string; allowedFields: string[] }
  | { status: "section_not_found"; message: string }
  | { status: "not_found"; hint: string }
  | { status: "ambiguous"; hint: string }
  | { status: "too_large"; hint: string };

async function loadMergedSection(
  reportId: string,
  section: SectionType
): Promise<{ sectionId: string; content: Record<string, unknown> } | null> {
  const [row] = await db
    .select()
    .from(reportSections)
    .where(
      and(eq(reportSections.reportId, reportId), eq(reportSections.section, section))
    );
  if (!row) return null;
  return {
    sectionId: row.id,
    content: mergeSection(section, row.content) as Record<string, unknown>,
  };
}

/**
 * Build the drafting-chat tool set for a report. Tools reuse the existing
 * suggestion pipeline: `propose_edit` creates an open `ai_fix` comment (no
 * evaluation link) exactly like the /suggestions route, so the report's
 * existing inline diff + accept/reject UI renders it unchanged.
 */
export function buildChatTools(opts: {
  reportId: string;
  canEdit: boolean;
  sectionScope?: ChatSectionScope;
}): ToolSet {
  const { reportId, canEdit } = opts;
  const sectionScope = opts.sectionScope ?? "all";
  const allowedSections = chatSectionsInScope(sectionScope);
  const sectionEnum = allowedSections as [SectionType, ...SectionType[]];
  const allSectionEnum = CHAT_EDITABLE_SECTIONS as [SectionType, ...SectionType[]];
  const scopeHint =
    sectionScope === "all"
      ? ""
      : ` Only section "${sectionScope}" is in scope for this chat.`;

  const tools: ToolSet = {
    read_section: tool({
      description:
        `Read the current text of an editable section so you can quote exact anchors. Optionally pass specific field paths; otherwise all editable fields are returned.${scopeHint}`,
      inputSchema: z.object({
        section: z.enum(sectionEnum).describe("Section to read."),
        fields: z
          .array(z.string())
          .optional()
          .describe("Optional in-section field paths, e.g. ['rootCause.narrative']."),
      }),
      execute: async ({ section, fields }) => {
        if (!isChatEditableSection(section)) {
          return { error: "invalid_section" as const };
        }
        const loaded = await loadMergedSection(reportId, section);
        if (!loaded) return { error: "section_not_found" as const };

        const all = chatTargetFields(section);
        const requested =
          fields && fields.length > 0
            ? all.filter((f) => fields.includes(f.targetField))
            : all;

        return {
          section,
          fields: requested.map((f) => {
            const text = sectionFieldPlainText(loaded.content, section, f.targetField);
            const trimmed = text.replace(/\s+/g, " ").trim();
            return {
              targetField: f.targetField,
              kind: f.kind,
              charCount: trimmed.length,
              isEmpty: trimmed.length === 0,
              text,
            };
          }),
        };
      },
    }),

    propose_edit: tool({
      description:
        `Propose ONE targeted, reviewable edit to a single field. The edit appears as an inline tracked-change the engineer accepts or rejects. Read the field first so the anchor is exact.${scopeHint}`,
      inputSchema: z.object({
        section: z.enum(sectionEnum),
        targetField: z
          .string()
          .describe("In-section field path, e.g. 'narrative' or 'rootCause.narrative'."),
        anchorText: z
          .string()
          .default("")
          .describe("Verbatim span from the current text; '' appends at end of field."),
        deleteText: z
          .string()
          .default("")
          .describe("Exact substring to remove (subset of anchor), or '' to only insert."),
        insertText: z
          .string()
          .default("")
          .describe("New text to add, or '' to only delete."),
        reasoning: z
          .string()
          .max(300)
          .describe("One short sentence explaining the edit (shown to the engineer)."),
      }),
      execute: async ({
        section,
        targetField,
        anchorText,
        deleteText,
        insertText,
        reasoning,
      }): Promise<ProposeEditResult> => {
        if (!canEdit) {
          return {
            status: "not_editable",
            message:
              "This report is not editable in its current state, so edits cannot be proposed.",
          };
        }
        if (!isChatEditableSection(section)) {
          return { status: "invalid_section", message: `Unknown section '${section}'.` };
        }
        if (!isAllowedTargetField(section, targetField)) {
          return {
            status: "invalid_field",
            message: `'${targetField}' is not an editable field of ${section}.`,
            allowedFields: chatTargetFields(section).map((f) => f.targetField),
          };
        }

        const loaded = await loadMergedSection(reportId, section);
        if (!loaded) {
          return { status: "section_not_found", message: "Section not found." };
        }

        const fieldText = sectionFieldPlainText(loaded.content, section, targetField);
        const check = checkProposedEdit(fieldText, { anchorText, deleteText, insertText });
        if (check.status !== "ok") {
          return { status: check.status, hint: proposedEditHint(check) } as ProposeEditResult;
        }

        const suggestionId = createId();
        const normalizedInsert = normalizeSuggestionInsertText(insertText);
        await db.insert(comments).values({
          id: suggestionId,
          reportId,
          sectionId: loaded.sectionId,
          section,
          authorId: AI_AUTHOR_ID,
          content: serializeAiFixCommentContent({
            deleteText,
            insertText: normalizedInsert,
            reasoning,
            contentHashAtSuggestion: sectionContentHash(section, loaded.content),
          }),
          anchorText,
          contentPath: targetField,
          fromPos: null,
          toPos: null,
          status: "open",
          kind: "ai_fix",
          evaluationId: null,
        });

        return {
          status: "proposed",
          suggestionId,
          section,
          targetField,
          summary: reasoning,
        };
      },
    }),
  };

  if (sectionScope !== "all") {
    const currentSection = sectionScope;
    tools.suggest_section_scope = tool({
      description:
        "Suggest changing the section focus dropdown when the engineer's request is about a different section than the current focus. Does not change scope — the UI shows a one-click switch.",
      inputSchema: z.object({
        suggestedSection: z
          .enum(allSectionEnum)
          .describe("Section the engineer should switch the dropdown to."),
        reason: z
          .string()
          .max(200)
          .describe("One short sentence explaining the mismatch."),
      }),
      execute: async ({ suggestedSection, reason }) => ({
        status: "suggested" as const,
        currentSection,
        suggestedSection,
        reason,
      }),
    });
  }

  return tools;
}
