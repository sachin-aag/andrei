import type { JSONContent } from "@tiptap/core";
import type { DocumentType, SectionType } from "@/db/schema";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { getWorkspaceSections } from "@/lib/document-types";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  applyTableOperation,
  renumberFilledTableCaptions,
  type DocumentTableContent,
  type TableOperation,
} from "@/lib/suggestions/table-operation";
import {
  listInsertableTableRefs,
  syncTableRefsInContents,
  tableRefNumberMap,
  type InsertableTableRef,
} from "@/lib/suggestions/table-ref";
import { normalizeRichField } from "@/lib/tiptap/rich-text";
import type { CommentRecord } from "@/types/report";

export type TableNumberComment = Pick<
  CommentRecord,
  "id" | "section" | "content" | "contentPath" | "status" | "kind" | "createdAt"
>;

function commentTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Workspace sections in document order that have content in `sections`. */
export function orderedSectionContents(args: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
}): DocumentTableContent[] {
  return getWorkspaceSections(args.documentType).flatMap((section) => {
    const content = args.sections[section.key];
    if (content === undefined) return [];
    return [{ section: section.key, content }];
  });
}

type PendingTableOperation = {
  comment: TableNumberComment;
  operation: TableOperation;
};

type SectionOverlay = {
  pending: readonly PendingTableOperation[];
  content: unknown;
};

/**
 * Overlaid section content keyed by the live section object. Typing in one
 * section must not re-apply every other section's pending table suggestions.
 * A few entries per section: the provider and the active-suggestion preview
 * (`exceptCommentId`) ask for different pending sets.
 */
const SECTION_OVERLAY_CACHE_SIZE = 4;
const sectionOverlayCache = new WeakMap<object, SectionOverlay[]>();

function samePendingOperations(
  a: readonly PendingTableOperation[],
  b: readonly PendingTableOperation[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index]!.comment;
    return (
      entry.comment.id === other.id &&
      entry.comment.content === other.content &&
      entry.comment.contentPath === other.contentPath
    );
  });
}

function applyPendingToSection(
  section: string,
  content: Record<string, unknown>,
  pending: readonly PendingTableOperation[]
): unknown {
  // One working doc per field: re-reading and re-cloning the whole section
  // for every card made 60 open cards cost 60 section clones.
  const docs = new Map<string, JSONContent>();
  for (const { comment, operation } of pending) {
    const field = comment.contentPath ?? "table";
    if (!isRichTargetField(section, field)) continue;
    const previous = docs.get(field);
    const current = previous
      ? normalizeRichField(previous, { preserveHeadings: true })
      : structuredClone(getRichFieldValue(content, field));
    const applied = applyTableOperation(current, operation, {
      section,
      targetField: field,
    });
    if (!applied.ok) continue;
    docs.set(field, applied.doc);
  }
  let next = content;
  for (const [field, doc] of docs) {
    next = setRichFieldValue(next, field, doc);
  }
  return next;
}

function overlaidSectionContent(
  section: string,
  content: unknown,
  pending: readonly PendingTableOperation[]
): unknown {
  if (!content || typeof content !== "object") return content;
  const cached = sectionOverlayCache.get(content);
  const hit = cached?.find((entry) =>
    samePendingOperations(entry.pending, pending)
  );
  if (hit) return hit.content;
  const overlaid = applyPendingToSection(
    section,
    content as Record<string, unknown>,
    pending
  );
  sectionOverlayCache.set(
    content,
    [{ pending, content: overlaid }, ...(cached ?? [])].slice(
      0,
      SECTION_OVERLAY_CACHE_SIZE
    )
  );
  return overlaid;
}

/**
 * Apply other open `edit_table` suggestions onto section copies so a
 * pending Media Fill fill occupies an ordinal before Monitoring is numbered.
 * Failures are skipped; only `tableHasData` on the copy matters. Sections
 * with no pending card keep their live content object — callers must not
 * mutate the returned contents.
 */
export function overlayPendingTableOperations(args: {
  contents: readonly DocumentTableContent[];
  comments: readonly TableNumberComment[];
  exceptCommentId?: string;
}): DocumentTableContent[] {
  const pendingBySection = new Map<string, PendingTableOperation[]>();
  const pending = args.comments
    .filter(
      (comment) =>
        comment.id !== args.exceptCommentId &&
        comment.status === "open" &&
        comment.kind === "ai_fix" &&
        Boolean(comment.section)
    )
    .flatMap((comment) => {
      const operation = parseAiFixCommentContent(comment.content).tableOperation;
      if (!operation || !comment.section) return [];
      return [{ comment, operation }];
    })
    .sort(
      (a, b) =>
        commentTime(a.comment.createdAt) - commentTime(b.comment.createdAt)
    );
  for (const entry of pending) {
    const section = entry.comment.section;
    if (!section) continue;
    const list = pendingBySection.get(section);
    if (list) list.push(entry);
    else pendingBySection.set(section, [entry]);
  }

  return args.contents.map((row) => {
    const sectionPending = pendingBySection.get(row.section);
    return {
      section: row.section,
      content: sectionPending
        ? overlaidSectionContent(row.section, row.content, sectionPending)
        : row.content,
    };
  });
}

/** Ordered workspace contents plus pending table-ops, excluding `exceptCommentId`. */
export function documentContentsFromReportState(args: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
  comments: readonly TableNumberComment[];
  exceptCommentId?: string;
}): DocumentTableContent[] {
  return overlayPendingTableOperations({
    contents: orderedSectionContents({
      documentType: args.documentType,
      sections: args.sections,
    }),
    comments: args.comments,
    exceptCommentId: args.exceptCommentId,
  });
}

export type LiveTableRefNumbers = {
  map: ReadonlyMap<string, number>;
  insertable: readonly InsertableTableRef[];
};

let lastLiveTableRefNumbers: LiveTableRefNumbers | null = null;

function sameNumberMap(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, n] of a) {
    if (b.get(key) !== n) return false;
  }
  return true;
}

function sameInsertable(
  a: readonly InsertableTableRef[],
  b: readonly InsertableTableRef[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index]!;
    return (
      item.n === other.n &&
      item.section === other.section &&
      item.targetField === other.targetField &&
      item.tableIndex === other.tableIndex &&
      item.title === other.title &&
      item.sectionLabel === other.sectionLabel
    );
  });
}

/**
 * Live `Table N` for the workspace. Returns the previous `map` / `insertable`
 * objects when the numbering did not change, so a keystroke in a narrative
 * does not re-render every table reference and context menu.
 */
export function liveTableRefNumbers(args: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
  comments: readonly TableNumberComment[];
}): LiveTableRefNumbers {
  const contents = documentContentsFromReportState(args);
  const map = tableRefNumberMap(contents);
  const insertable = listInsertableTableRefs(contents);
  const last = lastLiveTableRefNumbers;
  const next: LiveTableRefNumbers = {
    map: last && sameNumberMap(last.map, map) ? last.map : map,
    insertable:
      last && sameInsertable(last.insertable, insertable)
        ? last.insertable
        : insertable,
  };
  lastLiveTableRefNumbers = next;
  return next;
}

/**
 * Live filled-grid SEQ: rewrite captions in workspace order. Pending
 * suggestion overlays are not applied — N follows persisted (plus just-applied)
 * grids, like Word after Insert Caption.
 */
export function cascadeFilledTableCaptionsInSections(args: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
}): {
  sections: Partial<Record<string, unknown>>;
  changedSections: string[];
} {
  const captioned = renumberFilledTableCaptions(
    orderedSectionContents({
      documentType: args.documentType,
      sections: args.sections,
    })
  );
  const synced = syncTableRefsInContents(captioned.contents, args.documentType);
  const sections: Partial<Record<string, unknown>> = { ...args.sections };
  for (const row of synced.contents) {
    sections[row.section] = row.content;
  }
  const changedSections = [
    ...new Set([...captioned.changedSections, ...synced.changedSections]),
  ];
  return { sections, changedSections };
}

export function relatedSectionContentsAfterCascade(args: {
  primarySection: string;
  changedSections: readonly string[];
  sections: Readonly<Partial<Record<string, unknown>>>;
}): Partial<Record<SectionType, Record<string, unknown>>> {
  const related: Partial<Record<SectionType, Record<string, unknown>>> = {};
  for (const key of args.changedSections) {
    if (key === args.primarySection) continue;
    const content = args.sections[key];
    if (content && typeof content === "object" && !Array.isArray(content)) {
      related[key as SectionType] = content as Record<string, unknown>;
    }
  }
  return related;
}
