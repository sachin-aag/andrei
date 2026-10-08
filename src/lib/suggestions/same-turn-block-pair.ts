import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import {
  parseAiFixCommentContent,
  serializeAiFixCommentContent,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import type { PairedBlockKind } from "@/lib/suggestions/block-insert";

export type TurnLeadIn = {
  suggestionId: string;
  section: SectionType;
  targetField: string;
  payload: ParsedAiFixPayload;
  used: boolean;
};

export type TurnBlock = {
  suggestionId: string;
  section: SectionType;
  targetField: string;
  kind: PairedBlockKind;
  payload: ParsedAiFixPayload;
  used: boolean;
};

export type SameTurnBlockPairing = {
  leadIns: TurnLeadIn[];
  blocks: TurnBlock[];
};

export function createSameTurnBlockPairing(): SameTurnBlockPairing {
  return { leadIns: [], blocks: [] };
}

export function isAppendLeadIn(args: {
  anchorText?: string;
  deleteText?: string;
  insertText?: string;
  insertImage?: unknown;
  tableOperation?: unknown;
}): boolean {
  return (
    !(args.anchorText ?? "").trim() &&
    !(args.deleteText ?? "").trim() &&
    Boolean((args.insertText ?? "").trim()) &&
    !args.insertImage &&
    !args.tableOperation
  );
}

export function isAppendBlock(args: {
  anchorText?: string;
  afterAnchor?: string;
}): boolean {
  return !(args.anchorText ?? "").trim() && !(args.afterAnchor ?? "").trim();
}

function sameField(
  a: { section: SectionType; targetField: string },
  section: SectionType,
  targetField: string
): boolean {
  return a.section === section && a.targetField === targetField;
}

function normalizeAfterAnchorNeedle(afterAnchor: string): string {
  return afterAnchor
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function insertTextContainsAnchor(insertText: string, afterAnchor: string): boolean {
  const needle = normalizeAfterAnchorNeedle(afterAnchor);
  if (!needle) return false;
  const hay = insertText.replace(/\s+/g, " ").trim().toLowerCase();
  return hay.includes(needle);
}

function sameCommentField(a: CommentRecord, b: CommentRecord): boolean {
  return a.section === b.section && (a.contentPath ?? "") === (b.contentPath ?? "");
}

function createTableAfterAnchor(payload: ParsedAiFixPayload): string {
  const op = payload.tableOperation;
  if (!op || op.kind !== "create_table") return "";
  return typeof op.afterAnchor === "string" ? op.afterAnchor.trim() : "";
}

function isCommentAppendLeadIn(
  comment: CommentRecord,
  payload: ParsedAiFixPayload
): boolean {
  return isAppendLeadIn({
    anchorText: comment.anchorText,
    deleteText: payload.deleteText,
    insertText: payload.insertText,
    insertImage: payload.insertImage,
    tableOperation: payload.tableOperation,
  });
}

function findAfterAnchorLeadIn(
  comment: CommentRecord,
  payload: ParsedAiFixPayload,
  open: readonly CommentRecord[]
): CommentRecord | null {
  const afterAnchor = createTableAfterAnchor(payload);
  if (!afterAnchor) return null;
  return (
    open.find((item) => {
      if (item.id === comment.id || !sameCommentField(item, comment)) return false;
      const itemPayload = parseAiFixCommentContent(item.content);
      return (
        isCommentAppendLeadIn(item, itemPayload) &&
        insertTextContainsAnchor(itemPayload.insertText, afterAnchor)
      );
    }) ?? null
  );
}

function findAfterAnchorBlock(
  comment: CommentRecord,
  payload: ParsedAiFixPayload,
  open: readonly CommentRecord[]
): CommentRecord | null {
  if (!isCommentAppendLeadIn(comment, payload)) return null;
  return (
    open.find((item) => {
      if (item.id === comment.id || !sameCommentField(item, comment)) return false;
      const afterAnchor = createTableAfterAnchor(parseAiFixCommentContent(item.content));
      return (
        Boolean(afterAnchor) &&
        insertTextContainsAnchor(payload.insertText, afterAnchor)
      );
    }) ?? null
  );
}

export function takeUnusedLeadIn(
  pairing: SameTurnBlockPairing,
  section: SectionType,
  targetField: string
): TurnLeadIn | undefined {
  const hit = [...pairing.leadIns]
    .reverse()
    .find((item) => !item.used && sameField(item, section, targetField));
  if (hit) hit.used = true;
  return hit;
}

export function hasUnusedLeadInMatchingAnchor(
  pairing: SameTurnBlockPairing,
  section: SectionType,
  targetField: string,
  afterAnchor: string
): boolean {
  return pairing.leadIns.some(
    (item) =>
      !item.used &&
      sameField(item, section, targetField) &&
      insertTextContainsAnchor(item.payload.insertText, afterAnchor)
  );
}

/** Pair create_table afterAnchor with a heading that is still an open same-turn card. */
export function takeUnusedLeadInMatchingAnchor(
  pairing: SameTurnBlockPairing,
  section: SectionType,
  targetField: string,
  afterAnchor: string
): TurnLeadIn | undefined {
  const hit = [...pairing.leadIns]
    .reverse()
    .find(
      (item) =>
        !item.used &&
        sameField(item, section, targetField) &&
        insertTextContainsAnchor(item.payload.insertText, afterAnchor)
    );
  if (hit) hit.used = true;
  return hit;
}

export function takeUnusedBlock(
  pairing: SameTurnBlockPairing,
  section: SectionType,
  targetField: string
): TurnBlock | undefined {
  const hit = [...pairing.blocks]
    .reverse()
    .find((item) => !item.used && sameField(item, section, targetField));
  if (hit) hit.used = true;
  return hit;
}

export function recordLeadIn(
  pairing: SameTurnBlockPairing,
  item: Omit<TurnLeadIn, "used">
): void {
  pairing.leadIns.push({ ...item, used: false });
}

export function recordBlock(
  pairing: SameTurnBlockPairing,
  item: Omit<TurnBlock, "used">
): void {
  pairing.blocks.push({ ...item, used: false });
}

export function withPairedBlock(
  payload: ParsedAiFixPayload,
  blockId: string,
  kind: PairedBlockKind
): ParsedAiFixPayload {
  return {
    ...payload,
    pairedBlockSuggestionId: blockId,
    placeBeforePairedBlock: kind,
  };
}

export function withPlaceAfterLeadIn(
  payload: ParsedAiFixPayload,
  leadInId: string
): ParsedAiFixPayload {
  return { ...payload, placeAfterSuggestionId: leadInId };
}

export function findOpenBlockPair(
  comment: CommentRecord,
  openComments: readonly CommentRecord[]
): { leadIn: CommentRecord; block: CommentRecord } | null {
  const payload = parseAiFixCommentContent(comment.content);
  const open = openComments.filter(
    (item) => item.status === "open" && !item.parentId
  );
  if (payload.placeAfterSuggestionId) {
    const leadIn = open.find((item) => item.id === payload.placeAfterSuggestionId);
    if (leadIn) return { leadIn, block: comment };
  }
  if (payload.pairedBlockSuggestionId) {
    const block = open.find((item) => item.id === payload.pairedBlockSuggestionId);
    if (block) return { leadIn: comment, block };
  }
  const afterAnchorLeadIn = findAfterAnchorLeadIn(comment, payload, open);
  if (afterAnchorLeadIn) return { leadIn: afterAnchorLeadIn, block: comment };
  const afterAnchorBlock = findAfterAnchorBlock(comment, payload, open);
  if (afterAnchorBlock) return { leadIn: comment, block: afterAnchorBlock };
  return null;
}

/** Lead-in first, then its table/image, then everyone else in original order. */
export function sortCommentsForPairedApply(
  comments: readonly CommentRecord[]
): CommentRecord[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const leadInOfBlock = new Map<string, string>();
  for (const comment of comments) {
    const payload = parseAiFixCommentContent(comment.content);
    if (
      payload.placeAfterSuggestionId &&
      byId.has(payload.placeAfterSuggestionId)
    ) {
      leadInOfBlock.set(comment.id, payload.placeAfterSuggestionId);
    }
    if (
      payload.pairedBlockSuggestionId &&
      byId.has(payload.pairedBlockSuggestionId)
    ) {
      leadInOfBlock.set(payload.pairedBlockSuggestionId, comment.id);
    }
    const implicit = findOpenBlockPair(comment, comments);
    if (implicit && implicit.leadIn.id !== implicit.block.id) {
      leadInOfBlock.set(implicit.block.id, implicit.leadIn.id);
    }
  }
  const placed = new Set<string>();
  const ordered: CommentRecord[] = [];
  for (const comment of comments) {
    if (placed.has(comment.id)) continue;
    const leadInId = leadInOfBlock.get(comment.id);
    if (leadInId && !placed.has(leadInId)) {
      const leadIn = byId.get(leadInId);
      if (leadIn) {
        ordered.push(leadIn);
        placed.add(leadIn.id);
      }
    }
    ordered.push(comment);
    placed.add(comment.id);
    const payload = parseAiFixCommentContent(comment.content);
    const blockId = payload.pairedBlockSuggestionId;
    if (blockId && !placed.has(blockId)) {
      const block = byId.get(blockId);
      if (block) {
        ordered.push(block);
        placed.add(block.id);
      }
    }
  }
  return ordered;
}

export function serializePairedPayload(payload: ParsedAiFixPayload): string {
  return serializeAiFixCommentContent(payload);
}
