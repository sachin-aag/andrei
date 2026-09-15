import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import {
  spanForSuggestionComment,
  suggestionApplySpanContains,
  suggestionApplySpansHaveEqualRanges,
  type SuggestionApplySpan,
} from "@/lib/suggestions/suggestion-overlap";
import type { TableOperation } from "@/lib/suggestions/table-operation";

export const SUPERSEDED_BY_PREFIX = "superseded_by:";

export type SupersessionPair = {
  supersededId: string;
  supersededBy: string;
};

function isWholeFieldIntent(comment: CommentRecord): boolean {
  return comment.kind === "ai_redraft";
}

function coveringSpan(args: {
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
}): SuggestionApplySpan | null {
  const span = spanForSuggestionComment(args);
  if (!span) return null;
  if (isWholeFieldIntent(args.comment) || args.comment.kind === "ai_redraft") {
    return { ...span, wholeField: true };
  }
  // Table ops advertise wholeField for bulk-overlap clustering; supersession
  // uses range containment, so strip that flag.
  const payload = parseAiFixCommentContent(args.comment.content);
  if (payload.tableOperation || payload.tableOperationInvalid) {
    return { ...span, wholeField: false };
  }
  return span;
}

function isNewer(b: CommentRecord, a: CommentRecord): boolean {
  if (b.createdAt !== a.createdAt) return b.createdAt > a.createdAt;
  return b.id > a.id;
}

function tableOpFromComment(comment: CommentRecord): TableOperation | null {
  if (comment.kind !== "ai_fix") return null;
  const payload = parseAiFixCommentContent(comment.content);
  if (payload.tableOperationInvalid || !payload.tableOperation) return null;
  return payload.tableOperation;
}

/**
 * Same field + same table. `create_table` is a distinct virtual index so a
 * pending new table does not wipe edits to an existing one, and vice versa.
 */
function tableSupersessionKey(comment: CommentRecord): string | null {
  const op = tableOpFromComment(comment);
  if (!op) return null;
  const path = comment.contentPath ?? "";
  if (op.kind === "create_table") return `${path}::create`;
  return `${path}::${op.tableIndex}`;
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** Existing rows at `row` shift down when inserting after `afterRow`. Append does not shift. */
function rowShiftsAfterInsert(afterRow: number | undefined, row: number): boolean {
  if (afterRow === undefined) return false;
  return row > afterRow;
}

function colShiftsAfterInsert(afterCol: number | undefined, col: number): boolean {
  if (afterCol === undefined) return false;
  return col > afterCol;
}

function sameOptionalIndex(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a === b;
}

function editCellsCoverOlder(
  newer: Extract<TableOperation, { kind: "edit_cells" }>,
  older: Extract<TableOperation, { kind: "edit_cells" }>
): boolean {
  const keys = new Set(newer.cells.map((cell) => cellKey(cell.row, cell.col)));
  return older.cells.every((cell) => keys.has(cellKey(cell.row, cell.col)));
}

function insertRowsInvalidates(
  newer: Extract<TableOperation, { kind: "insert_rows" }>,
  older: TableOperation
): boolean {
  switch (older.kind) {
    case "edit_cells":
      return older.cells.some((cell) =>
        rowShiftsAfterInsert(newer.afterRow, cell.row)
      );
    case "insert_rows":
      if (sameOptionalIndex(newer.afterRow, older.afterRow)) return true;
      return (
        older.afterRow !== undefined &&
        rowShiftsAfterInsert(newer.afterRow, older.afterRow)
      );
    case "delete_rows":
      return older.rows.some((row) =>
        rowShiftsAfterInsert(newer.afterRow, row.row)
      );
    case "insert_column":
    case "delete_column":
    case "delete_table":
    case "create_table":
      return false;
    default: {
      const _exhaustive: never = older;
      return _exhaustive;
    }
  }
}

function deleteRowsInvalidates(
  newer: Extract<TableOperation, { kind: "delete_rows" }>,
  older: TableOperation
): boolean {
  const deleted = new Set(newer.rows.map((row) => row.row));
  switch (older.kind) {
    case "edit_cells":
      return older.cells.some((cell) => deleted.has(cell.row));
    case "insert_rows":
      return older.afterRow !== undefined && deleted.has(older.afterRow);
    case "delete_rows":
      return older.rows.every((row) => deleted.has(row.row));
    case "insert_column":
    case "delete_column":
    case "delete_table":
    case "create_table":
      return false;
    default: {
      const _exhaustive: never = older;
      return _exhaustive;
    }
  }
}

function insertColumnInvalidates(
  newer: Extract<TableOperation, { kind: "insert_column" }>,
  older: TableOperation
): boolean {
  switch (older.kind) {
    case "edit_cells":
      return older.cells.some((cell) =>
        colShiftsAfterInsert(newer.afterCol, cell.col)
      );
    case "insert_column":
      if (sameOptionalIndex(newer.afterCol, older.afterCol)) return true;
      return (
        older.afterCol !== undefined &&
        colShiftsAfterInsert(newer.afterCol, older.afterCol)
      );
    case "delete_column":
      return colShiftsAfterInsert(newer.afterCol, older.col);
    case "insert_rows":
    case "delete_rows":
    case "delete_table":
    case "create_table":
      return false;
    default: {
      const _exhaustive: never = older;
      return _exhaustive;
    }
  }
}

function deleteColumnInvalidates(
  newer: Extract<TableOperation, { kind: "delete_column" }>,
  older: TableOperation
): boolean {
  switch (older.kind) {
    case "edit_cells":
      return older.cells.some((cell) => cell.col >= newer.col);
    case "insert_column":
      return older.afterCol !== undefined && older.afterCol >= newer.col;
    case "delete_column":
      return older.col >= newer.col;
    case "insert_rows":
    case "delete_rows":
    case "delete_table":
    case "create_table":
      return false;
    default: {
      const _exhaustive: never = older;
      return _exhaustive;
    }
  }
}

function editCellsInvalidates(
  newer: Extract<TableOperation, { kind: "edit_cells" }>,
  older: TableOperation
): boolean {
  switch (older.kind) {
    case "edit_cells":
      return editCellsCoverOlder(newer, older);
    case "insert_rows":
    case "delete_rows":
    case "insert_column":
    case "delete_column":
    case "delete_table":
    case "create_table":
      return false;
    default: {
      const _exhaustive: never = older;
      return _exhaustive;
    }
  }
}

/**
 * True when applying `newer` covers or invalidates `older` on the same table.
 * Complementary ops (fill existing row 1, then append rows) stay both open.
 */
function tableOpInvalidates(newer: TableOperation, older: TableOperation): boolean {
  switch (newer.kind) {
    case "create_table":
      return older.kind === "create_table";
    case "delete_table":
      return true;
    case "insert_rows":
      return insertRowsInvalidates(newer, older);
    case "delete_rows":
      return deleteRowsInvalidates(newer, older);
    case "insert_column":
      return insertColumnInvalidates(newer, older);
    case "delete_column":
      return deleteColumnInvalidates(newer, older);
    case "edit_cells":
      return editCellsInvalidates(newer, older);
    default: {
      const _exhaustive: never = newer;
      return _exhaustive;
    }
  }
}

function rememberNewest(
  bestBySuperseded: Map<string, string>,
  open: readonly CommentRecord[],
  supersededId: string,
  newer: CommentRecord
): void {
  const current = bestBySuperseded.get(supersededId);
  if (!current) {
    bestBySuperseded.set(supersededId, newer.id);
    return;
  }
  const currentComment = open.find((c) => c.id === current);
  if (currentComment && isNewer(newer, currentComment)) {
    bestBySuperseded.set(supersededId, newer.id);
  }
}

/**
 * A is superseded by B when B is newer, targets the same field, and B's
 * operation ranges fully cover A's. Equal ranges do not count as covering —
 * a second shrink of the same saved span stacks instead of replacing.
 * A whole-field intent (draft_field / redraft) supersedes every older open
 * suggestion on that field.
 * Two table ops on the same field and tableIndex: the newer rewrites the
 * older only when it covers or invalidates those coordinates (insert after the
 * header shifts row 1; appending rows does not dismiss a fill of row 1).
 */
export function findSupersededSuggestions(args: {
  section: SectionType;
  comments: readonly CommentRecord[];
  sectionContent: Record<string, unknown>;
}): SupersessionPair[] {
  const open = args.comments.filter(
    (comment) =>
      !comment.parentId &&
      comment.status === "open" &&
      comment.section === args.section
  );
  const spans = new Map<string, SuggestionApplySpan>();
  for (const comment of open) {
    const span = coveringSpan({
      section: args.section,
      comment,
      sectionContent: args.sectionContent,
    });
    if (span) spans.set(comment.id, span);
  }

  const bestBySuperseded = new Map<string, string>();
  for (const b of open) {
    const spanB = spans.get(b.id);
    if (!spanB) continue;
    for (const a of open) {
      if (a.id === b.id) continue;
      if (!isNewer(b, a)) continue;
      const spanA = spans.get(a.id);
      if (!spanA) continue;
      if (!suggestionApplySpanContains(spanB, spanA)) continue;
      if (suggestionApplySpansHaveEqualRanges(spanB, spanA)) continue;
      rememberNewest(bestBySuperseded, open, a.id, b);
    }
  }

  for (const b of open) {
    const keyB = tableSupersessionKey(b);
    if (!keyB) continue;
    for (const a of open) {
      if (a.id === b.id) continue;
      if (!isNewer(b, a)) continue;
      const keyA = tableSupersessionKey(a);
      if (keyA !== keyB) continue;
      const opA = tableOpFromComment(a);
      const opB = tableOpFromComment(b);
      if (!opA || !opB || !tableOpInvalidates(opB, opA)) continue;
      rememberNewest(bestBySuperseded, open, a.id, b);
    }
  }

  return [...bestBySuperseded.entries()].map(([supersededId, supersededBy]) => ({
    supersededId,
    supersededBy,
  }));
}

export function suggestionsSupersededBy(
  comment: CommentRecord,
  args: {
    section: SectionType;
    comments: readonly CommentRecord[];
    sectionContent: Record<string, unknown>;
  }
): CommentRecord[] {
  const ids = new Set(
    findSupersededSuggestions(args)
      .filter((pair) => pair.supersededBy === comment.id)
      .map((pair) => pair.supersededId)
  );
  return args.comments.filter((c) => ids.has(c.id));
}

export function resolutionReasonSupersededBy(commentId: string): string {
  return `${SUPERSEDED_BY_PREFIX}${commentId}`;
}

export function parseSupersededById(reason: string | undefined): string | null {
  if (!reason?.startsWith(SUPERSEDED_BY_PREFIX)) return null;
  const id = reason.slice(SUPERSEDED_BY_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function parseResolutionReason(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as { resolutionReason?: unknown };
    if (parsed && typeof parsed.resolutionReason === "string") {
      return parsed.resolutionReason;
    }
  } catch {
    // plain content
  }
  return undefined;
}

export function withSupersededSuggestionIds(
  content: string,
  ids: readonly string[]
): string {
  const unique = [
    ...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (unique.length === 0) {
        const rest = { ...parsed };
        delete rest.supersededSuggestionIds;
        return JSON.stringify(rest);
      }
      return JSON.stringify({ ...parsed, supersededSuggestionIds: unique });
    }
  } catch {
    // wrap plain content
  }
  if (unique.length === 0) return content;
  return JSON.stringify({ insertText: content, supersededSuggestionIds: unique });
}

export function supersededSuggestionIdsFromContent(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as { supersededSuggestionIds?: unknown };
    if (!Array.isArray(parsed.supersededSuggestionIds)) return [];
    return [
      ...new Set(
        parsed.supersededSuggestionIds.flatMap((id) =>
          typeof id === "string" && id.trim() ? [id.trim()] : []
        )
      ),
    ];
  } catch {
    return [];
  }
}

export function withResolutionReason(content: string, reason: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, resolutionReason: reason });
    }
  } catch {
    // wrap plain content
  }
  return JSON.stringify({ insertText: content, resolutionReason: reason });
}

export function stripResolutionReason(content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rest = { ...parsed };
      delete rest.resolutionReason;
      return JSON.stringify(rest);
    }
  } catch {
    // plain content
  }
  return content;
}

export function isSupersededDismissal(comment: Pick<CommentRecord, "status" | "content">): boolean {
  if (comment.status !== "dismissed") return false;
  return parseSupersededById(parseResolutionReason(comment.content)) !== null;
}

export function formatSupersedesBadge(count: number): string {
  if (count <= 0) return "";
  return count === 1
    ? "This replaced 1 older suggestion"
    : `This replaced ${count} older suggestions`;
}

/** Chat tool-line suffix. Leading space so it concatenates onto the proposed line. */
export function formatReplacedOlderSuggestionsNote(count: number): string {
  if (count <= 0) return "";
  return count === 1
    ? " It replaced an older suggestion."
    : ` It replaced ${count} older suggestions.`;
}
