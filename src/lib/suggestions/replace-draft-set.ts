import type { JSONContent } from "@tiptap/core";
import { and, eq, inArray, or } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { comments, reportSections } from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  serializeAiFixCommentContent,
  serializeAiRedraftCommentContent,
  sectionContentHash,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import { mergeSection } from "@/lib/sections-merge";
import { markdownHasTable, markdownToPlainText } from "@/lib/tiptap/markdown-to-doc";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import {
  diffFieldToEdits,
  splitMarkdownIntoBlocks,
  type DiffEdit,
} from "@/lib/suggestions/diff-redraft";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { fieldContentHash } from "@/lib/suggestions/validate-suggestion";

/** Prompt guidance only — never a reject or auto-split. */
export const GUIDANCE_MAX_PROSE_BLOCK_LINES = 15;

export type AuthoredDraftBlock = {
  topic: string;
  reason: string;
  markdown: string;
};

export type DraftSetCard = {
  id: string;
  payload: ParsedAiFixPayload;
  anchorText: string;
};

export type ReplaceDraftSetResult =
  | {
      status: "drafted";
      suggestionId: string;
      edits: number;
      supersededIds: string[];
    }
  | { status: "no_changes"; message: string; supersededIds: string[] }
  | { status: "section_not_found"; message: string };

/**
 * Flatten authored blocks into the markdown the field-diff sees, and map each
 * resulting proposed-block index back to the authored block that produced it.
 * Positional ownership is wrong: an authored block with an internal blank line
 * becomes two proposed blocks that still share one topic/reason.
 */
export function joinAuthoredBlocks(
  blocks: readonly AuthoredDraftBlock[]
): { markdown: string; owners: number[] } {
  const pieces: string[] = [];
  const owners: number[] = [];
  for (const [i, block] of blocks.entries()) {
    warnIfAuthoredBlockTooLong(block);
    for (const piece of splitMarkdownIntoBlocks(block.markdown)) {
      pieces.push(piece);
      owners.push(i);
    }
  }
  return { markdown: pieces.join("\n\n"), owners };
}

function warnIfAuthoredBlockTooLong(block: AuthoredDraftBlock): void {
  if (markdownHasTable(block.markdown)) return;
  const lines = block.markdown.replace(/\r\n?/g, "\n").split("\n").length;
  if (lines <= GUIDANCE_MAX_PROSE_BLOCK_LINES) return;
  console.warn(
    `[draft_field] authored block "${block.topic}" is ${lines} lines (guidance is ~${GUIDANCE_MAX_PROSE_BLOCK_LINES})`
  );
}

function firstAuthoredOwner(edit: DiffEdit, owners: readonly number[]): number {
  for (const proposed of edit.sourceBlocks ?? []) {
    const owner = owners[proposed];
    if (owner != null) return owner;
  }
  return 0;
}

function payloadFromEdit(
  edit: DiffEdit,
  ids: readonly string[],
  draft: { id: string; index: number; total: number },
  authored: AuthoredDraftBlock,
  contentHash: string
): ParsedAiFixPayload {
  if (edit.kind === "text") {
    return {
      deleteText: edit.deleteText,
      insertText: normalizeSuggestionInsertText(edit.insertText),
      reasoning: authored.reason,
      label: authored.topic,
      draft,
      scope: edit.scope,
      contentHashAtSuggestion: contentHash,
    };
  }
  return {
    deleteText: "",
    insertText: "",
    reasoning: authored.reason,
    label: authored.topic,
    draft,
    contentHashAtSuggestion: contentHash,
    blockEdit: {
      op: edit.op,
      anchor: edit.anchor,
      blockIndex: edit.blockIndex,
      proposedMarkdown: edit.proposedMarkdown,
      tableIndex: edit.tableIndex,
      rowIndex: edit.rowIndex,
      rowAnchor: edit.rowAnchor,
      blockCount: edit.blockCount,
      ...(edit.afterEditIndex !== undefined
        ? { afterSuggestionId: ids[edit.afterEditIndex] }
        : {}),
    },
  };
}

export function buildDraftSetCards(opts: {
  currentDoc: JSONContent;
  blocks: readonly AuthoredDraftBlock[];
  contentHash: string;
}): DraftSetCard[] {
  const { markdown, owners } = joinAuthoredBlocks(opts.blocks);
  const fallbackReason = opts.blocks[0]?.reason ?? "";
  const edits = diffFieldToEdits(opts.currentDoc, markdown, fallbackReason, owners);
  if (edits.length === 0) return [];

  const ids = edits.map(() => createId());
  const draftId = createId();
  return edits.map((edit, i) => {
    const authored = opts.blocks[firstAuthoredOwner(edit, owners)] ?? opts.blocks[0]!;
    const draft = { id: draftId, index: i + 1, total: edits.length };
    return {
      id: ids[i]!,
      payload: payloadFromEdit(edit, ids, draft, authored, opts.contentHash),
      anchorText: edit.kind === "text" ? edit.anchorText : "",
    };
  });
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function earliestCreatedAt(rows: readonly { createdAt: Date | string }[]): Date | null {
  if (rows.length === 0) return null;
  return rows.reduce<Date>((min, row) => {
    const at = asDate(row.createdAt);
    return at < min ? at : min;
  }, asDate(rows[0]!.createdAt));
}

function plainDraftMatchesLive(live: string, proposedMarkdown: string): boolean {
  return (
    collapseWhitespace(live) ===
    collapseWhitespace(markdownToPlainText(proposedMarkdown))
  );
}

/**
 * Atomically dismiss this field's open AI cards and insert a fresh set diffs
 * against the live field. Pending card bodies are never the diff baseline.
 */
export async function replaceFieldDraftSet(opts: {
  reportId: string;
  section: SectionType;
  targetField: string;
  kind: "rich" | "plain";
  blocks: readonly AuthoredDraftBlock[];
  extraSupersedeIds?: readonly string[];
}): Promise<ReplaceDraftSetResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(reportSections)
      .where(
        and(
          eq(reportSections.reportId, opts.reportId),
          eq(reportSections.section, opts.section)
        )
      );
    if (!row) {
      return { status: "section_not_found", message: "Section not found." };
    }

    const extraIds = (opts.extraSupersedeIds ?? []).filter((id) => id.trim().length > 0);
    const fieldOrExtra =
      extraIds.length > 0
        ? or(eq(comments.contentPath, opts.targetField), inArray(comments.id, extraIds))
        : eq(comments.contentPath, opts.targetField);

    const dismissed = await tx
      .update(comments)
      .set({ status: "dismissed" })
      .where(
        and(
          eq(comments.reportId, opts.reportId),
          eq(comments.section, opts.section),
          eq(comments.status, "open"),
          inArray(comments.kind, ["ai_fix", "ai_redraft"]),
          fieldOrExtra
        )
      )
      .returning({ id: comments.id, createdAt: comments.createdAt });

    const supersededIds = dismissed.map((d) => d.id);
    const inheritedCreatedAt = earliestCreatedAt(dismissed);
    const content = mergeSection(opts.section, row.content) as Record<string, unknown>;
    const { markdown } = joinAuthoredBlocks(opts.blocks);
    const proposed = normalizeSuggestionInsertText(markdown);

    if (opts.kind === "plain") {
      const live = getPlainTextFieldValue(content, opts.targetField);
      if (plainDraftMatchesLive(live, proposed)) {
        return {
          status: "no_changes",
          message: "The draft matches the current content — there is nothing to change.",
          supersededIds,
        };
      }
      const suggestionId = createId();
      await tx.insert(comments).values({
        id: suggestionId,
        reportId: opts.reportId,
        sectionId: row.id,
        section: opts.section,
        authorId: AI_AUTHOR_ID,
        content: serializeAiRedraftCommentContent({
          markdown: proposed,
          reasoning: opts.blocks[0]?.reason ?? "",
          fieldHashAtSuggestion: fieldContentHash(
            opts.section,
            content,
            opts.targetField
          ),
        }),
        anchorText: "",
        contentPath: opts.targetField,
        fromPos: null,
        toPos: null,
        status: "open",
        kind: "ai_redraft",
        evaluationId: null,
        ...(inheritedCreatedAt ? { createdAt: inheritedCreatedAt } : {}),
      });
      return {
        status: "drafted",
        suggestionId,
        edits: 1,
        supersededIds,
      };
    }

    const cards = buildDraftSetCards({
      currentDoc: getRichFieldValue(content, opts.targetField),
      blocks: opts.blocks,
      contentHash: sectionContentHash(opts.section, content),
    });
    if (cards.length === 0) {
      return {
        status: "no_changes",
        message: "The draft matches the current content — there is nothing to change.",
        supersededIds,
      };
    }

    for (const [i, card] of cards.entries()) {
      await tx.insert(comments).values({
        id: card.id,
        reportId: opts.reportId,
        sectionId: row.id,
        section: opts.section,
        authorId: AI_AUTHOR_ID,
        content: serializeAiFixCommentContent(card.payload),
        anchorText: card.anchorText,
        contentPath: opts.targetField,
        fromPos: null,
        toPos: null,
        status: "open",
        kind: "ai_fix",
        evaluationId: null,
        ...(i === 0 && inheritedCreatedAt ? { createdAt: inheritedCreatedAt } : {}),
      });
    }

    return {
      status: "drafted",
      suggestionId: cards[0]!.id,
      edits: cards.length,
      supersededIds,
    };
  });
}
