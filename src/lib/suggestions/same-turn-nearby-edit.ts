import type { SectionType } from "@/db/schema";
import type { ParsedAiFixPayload } from "@/lib/ai/suggestion-gating";
import {
  COALESCING_GAP,
  rangeGap,
  type NearbyEditRange,
} from "@/lib/suggestions/coalesce-nearby-edits";

/**
 * Same-turn prose `propose_edit` cards, so a later call in the same field
 * can fold into an existing card when the locatable ranges sit within
 * {@link COALESCING_GAP} characters.
 */
export type TurnNearbyEdit = {
  suggestionId: string;
  section: SectionType;
  targetField: string;
  range: NearbyEditRange;
  payload: ParsedAiFixPayload;
};

export type SameTurnNearbyEdits = {
  edits: TurnNearbyEdit[];
};

export function createSameTurnNearbyEdits(): SameTurnNearbyEdits {
  return { edits: [] };
}

export function recordNearbyEdit(
  store: SameTurnNearbyEdits,
  edit: TurnNearbyEdit
): void {
  const existing = store.edits.find(
    (item) => item.suggestionId === edit.suggestionId
  );
  if (existing) {
    existing.range = edit.range;
    existing.payload = edit.payload;
    return;
  }
  store.edits.push(edit);
}

/** Closest same-field card whose range gap is shorter than the coalescing gap. */
export function findNearbyTurnEdit(
  store: SameTurnNearbyEdits,
  args: {
    section: SectionType;
    targetField: string;
    range: NearbyEditRange;
  }
): TurnNearbyEdit | undefined {
  let best: TurnNearbyEdit | undefined;
  let bestGap = Infinity;
  for (const edit of store.edits) {
    if (edit.section !== args.section || edit.targetField !== args.targetField) {
      continue;
    }
    const gap = rangeGap(edit.range, args.range);
    if (gap >= COALESCING_GAP || gap >= bestGap) continue;
    best = edit;
    bestGap = gap;
  }
  return best;
}
