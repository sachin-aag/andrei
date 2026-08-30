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
