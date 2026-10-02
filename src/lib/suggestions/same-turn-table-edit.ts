import type { SectionType } from "@/db/schema";
import type { ParsedAiFixPayload } from "@/lib/ai/suggestion-gating";
import type {
  EditCellsOperation,
  InsertRowsOperation,
} from "@/lib/suggestions/merge-insert-rows";

/**
 * Same-turn `edit_table` insert_rows / scaffold edit_cells cards. Comment
 * mocks (and a live parallel tool step) often cannot see the first open
 * card yet, so a later insert_rows in the same table folds using this store.
 */
export type TurnTableInsert = {
  suggestionId: string;
  section: SectionType;
  targetField: string;
  operation: InsertRowsOperation | EditCellsOperation;
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

export function insertRowsQueueKey(
  section: SectionType,
  targetField: string,
  tableIndex: number
): string {
  return `${section}\0${targetField}\0${tableIndex}`;
}

/**
 * Per-table tails so sequential `insert_rows` / scaffold `edit_cells` on
 * the same table fold onto one card. Different tables stay parallel —
 * a global `edit_table` tail stalled RTM cell fills behind Qual Docs
 * inserts until the 270s abort.
 */
export type InsertRowsQueues = Map<string, Promise<void>>;

export function createInsertRowsQueues(): InsertRowsQueues {
  return new Map();
}

export function enqueueInsertRows<T>(
  queues: InsertRowsQueues,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const tail = queues.get(key) ?? Promise.resolve();
  const next = tail.then(fn, fn);
  queues.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}
