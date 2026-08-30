import type { SectionType } from "@/db/schema";
import type { ParsedAiFixPayload } from "@/lib/ai/suggestion-gating";

/**
 * Same-turn image insert/remove cards. A "move the figure" request often
 * arrives as remove_image + insert_image + a second remove_image; those
 * must collapse onto one suggestion instead of stacking three gutter cards.
 */
export type TurnImageOp = {
  suggestionId: string;
  section: SectionType;
  targetField: string;
  payload: ParsedAiFixPayload;
  anchorText: string;
  src: string;
  removeIndex?: number;
};

export type SameTurnImageOps = {
  ops: TurnImageOp[];
};

export function createSameTurnImageOps(): SameTurnImageOps {
  return { ops: [] };
}

function sameField(
  op: TurnImageOp,
  section: SectionType,
  targetField: string
): boolean {
  return op.section === section && op.targetField === targetField;
}

export function recordImageOp(store: SameTurnImageOps, op: TurnImageOp): void {
  const existing = store.ops.find((item) => item.suggestionId === op.suggestionId);
  if (existing) {
    existing.payload = op.payload;
    existing.anchorText = op.anchorText;
    existing.src = op.src;
    existing.removeIndex = op.removeIndex;
    return;
  }
  store.ops.push(op);
}

/** Positioned insert (after a quoted paragraph) can absorb a matching remove. */
export function isPositionedImageOp(op: Pick<TurnImageOp, "anchorText">): boolean {
  return Boolean(op.anchorText.trim());
}

/**
 * Find an open same-turn figure card to reuse when inserting/moving.
 * Matches a prior remove of this live index, or a prior insert of this src
 * (so a later afterAnchor can reposition a pending append).
 */
export function findImageOpForMove(
  store: SameTurnImageOps,
  args: {
    section: SectionType;
    targetField: string;
    src?: string;
    removeIndex?: number;
  }
): TurnImageOp | undefined {
  return [...store.ops].reverse().find((op) => {
    if (!sameField(op, args.section, args.targetField)) return false;
    if (args.removeIndex != null && op.removeIndex === args.removeIndex) {
      return true;
    }
    if (args.src && op.src === args.src) return true;
    return false;
  });
}

/**
 * Find an open same-turn figure card to reuse when removing.
 * Matches a prior remove of this index, or a positioned insert of this src
 * (do not match an empty-anchor copy — that would restyle in place).
 */
export function findImageOpForRemove(
  store: SameTurnImageOps,
  args: {
    section: SectionType;
    targetField: string;
    src: string;
    removeIndex: number;
  }
): TurnImageOp | undefined {
  return [...store.ops].reverse().find((op) => {
    if (!sameField(op, args.section, args.targetField)) return false;
    if (op.removeIndex === args.removeIndex) return true;
    return op.src === args.src && isPositionedImageOp(op);
  });
}
