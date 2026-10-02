import type { SectionType } from "@/db/schema";
import type { ParsedAiFixPayload } from "@/lib/ai/suggestion-gating";
import type { InsertRowsOperation } from "@/lib/suggestions/merge-insert-rows";

/**
 * Same-turn `edit_table` insert_rows cards. Comment mocks (and a live
 * parallel tool step) often cannot see the first open card yet, so a later
 * insert_rows in the same table folds using this store.
 */
export type TurnTableInsert = {
  suggestionId: string;
  section: SectionType;
  targetField: string;
  operation: InsertRowsOperation;
  payload: ParsedAiFixPayload;
};

export type SameTurnTableInserts = {
  inserts: TurnTableInsert[];
};

export function createSameTurnTableInserts(): SameTurnTableInserts {
  return { inserts: [] };
}

function sameField(
  op: TurnTableInsert,
  section: SectionType,
  targetField: string
): boolean {
  return op.section === section && op.targetField === targetField;
}

export function recordTableInsert(
  store: SameTurnTableInserts,
  insert: TurnTableInsert
): void {
  const existing = store.inserts.find(
    (item) => item.suggestionId === insert.suggestionId
  );
  if (existing) {
    existing.operation = insert.operation;
    existing.payload = insert.payload;
    return;
  }
  store.inserts.push(insert);
}

/** Latest open same-table insert_rows card this turn. */
export function findTableInsertForFold(
  store: SameTurnTableInserts,
  args: {
    section: SectionType;
    targetField: string;
    tableIndex: number;
  }
): TurnTableInsert | undefined {
  return [...store.inserts].reverse().find((op) => {
    if (!sameField(op, args.section, args.targetField)) return false;
    return op.operation.tableIndex === args.tableIndex;
  });
}
