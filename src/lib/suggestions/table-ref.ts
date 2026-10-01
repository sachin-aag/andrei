import type { JSONContent } from "@tiptap/core";
import type { DocumentType } from "@/db/schema";
import { RICH_FIELD_PATHS } from "@/lib/ai/suggest-target-fields";
import { getWorkspaceSections } from "@/lib/document-types";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  cellPlainText,
  defaultTableCaptionTitle,
  filledTableNumberInDocument,
  TABLE_CAPTION_RE,
  type DocumentTableContent,
} from "@/lib/suggestions/table-operation";
import {
  defaultTableFieldForSection,
  isTableRefNode,
  tableRefAttrsFromNode,
  type TableRefAttrs,
} from "@/lib/tiptap/table-ref-markdown";
import { displaySectionLabel } from "@/types/sections";

export type TableRefTarget = {
  section: string;
  targetField: string;
  tableIndex: number;
};

export function tableRefMapKey(target: TableRefTarget): string {
  return `${target.section}\0${target.targetField}#${target.tableIndex}`;
}

/** One filled grid the engineer can insert as a Word-style cross-reference. */
export type InsertableTableRef = TableRefTarget & {
  n: number;
  title: string;
  sectionLabel: string;
};

type TableLocation = {
  table: JSONContent;
  parent: JSONContent;
  index: number;
};

function collectTableLocations(doc: JSONContent): TableLocation[] {
  const found: TableLocation[] = [];
  const walk = (node: JSONContent) => {
    const content = node.content;
    if (!content) return;
    content.forEach((child, index) => {
      if (child.type === "table") {
        found.push({ table: child, parent: node, index });
        return;
      }
      walk(child);
    });
  };
  walk(doc);
  return found;
}

function tableGridHasData(table: JSONContent): boolean {
  const rows = (table.content ?? []).filter((node) => node.type === "tableRow");
  for (let i = 1; i < rows.length; i += 1) {
    const cells = (rows[i]?.content ?? []).filter(
      (node) => node.type === "tableCell" || node.type === "tableHeader"
    );
    for (const cell of cells) {
      if (cellPlainText(cell)) return true;
    }
  }
  return false;
}

function captionTitleAboveTable(doc: JSONContent, tableIndex: number): string {
  const location = collectTableLocations(doc)[tableIndex];
  const prev = location?.parent.content?.[location.index - 1];
  if (!prev || prev.type !== "paragraph") return "";
  const text = flattenForAnchor(prev).text.trim();
  const match = TABLE_CAPTION_RE.exec(text);
  if (!match) return "";
  return text.slice(match[0].length).trim();
}

/**
 * Filled grids in document order, with live `Table N` and caption title.
 * Empty unused shells are omitted — the picker matches Word's Cross-reference
 * list (only captioned / numbered tables).
 */
export function listInsertableTableRefs(
  contents: readonly DocumentTableContent[]
): InsertableTableRef[] {
  const items: InsertableTableRef[] = [];
  for (const row of contents) {
    for (const { field, doc } of richFieldDocsForTableRefs(row.section, row.content)) {
      const targetField = field || defaultTableFieldForSection(row.section);
      const locations = collectTableLocations(doc);
      for (let tableIndex = 0; tableIndex < locations.length; tableIndex += 1) {
        const table = locations[tableIndex]?.table;
        if (!table || !tableGridHasData(table)) continue;
        const n = filledTableNumberInDocument({
          contents,
          target: { section: row.section, targetField, tableIndex },
        });
        if (typeof n !== "number") continue;
        const title =
          captionTitleAboveTable(doc, tableIndex) ||
          defaultTableCaptionTitle(row.section);
        items.push({
          n,
          section: row.section,
          targetField,
          tableIndex,
          title,
          sectionLabel: displaySectionLabel(row.section),
        });
      }
    }
  }
  return items.toSorted((a, b) => a.n - b.n || a.section.localeCompare(b.section));
}

export function resolveSectionKey(
  raw: string,
  documentType?: DocumentType | null
): string | null {
  const needle = raw.trim();
  if (!needle) return null;
  if (RICH_FIELD_PATHS[needle]) return needle;
  const lower = needle.toLowerCase();
  const known = Object.keys(RICH_FIELD_PATHS).find(
    (key) => key.toLowerCase() === lower
  );
  if (known) return known;
  if (!documentType) return null;
  const sections = getWorkspaceSections(documentType);
  const byKey = sections.find((section) => section.key.toLowerCase() === lower);
  if (byKey) return byKey.key;
  const byLabel = sections.find(
    (section) => section.label.toLowerCase() === lower
  );
  return byLabel?.key ?? null;
}

export function resolveTableRefTarget(
  attrs: TableRefAttrs,
  containing: { section: string; targetField?: string },
  documentType?: DocumentType | null
): TableRefTarget {
  const section =
    resolveSectionKey(attrs.section, documentType) ??
    (attrs.section.trim() || containing.section);
  const targetField =
    attrs.targetField.trim() || defaultTableFieldForSection(section);
  return {
    section,
    targetField,
    tableIndex: attrs.tableIndex,
  };
}

function isTipTapDoc(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as JSONContent).type === "doc"
  );
}

export function richFieldDocsForTableRefs(
  section: string,
  content: unknown
): { field: string; doc: JSONContent }[] {
  if (!content || typeof content !== "object") return [];
  const paths = RICH_FIELD_PATHS[section];
  if (paths && paths.length > 0 && !isTipTapDoc(content)) {
    return paths.map((field) => ({
      field,
      doc: getRichFieldValue(content as Record<string, unknown>, field),
    }));
  }
  if (isTipTapDoc(content)) {
    return [{ field: "", doc: content }];
  }
  return [];
}

function tableCountInDoc(doc: JSONContent): number {
  let count = 0;
  const walk = (node: JSONContent) => {
    if (node.type === "table") count += 1;
    node.content?.forEach(walk);
  };
  walk(doc);
  return count;
}

function lookupOrdinal(
  contents: readonly DocumentTableContent[],
  target: TableRefTarget
): number | null {
  const n = filledTableNumberInDocument({ contents, target });
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function syncTableRefNode(
  node: JSONContent,
  containing: { section: string; targetField: string },
  contents: readonly DocumentTableContent[],
  documentType?: DocumentType | null
): void {
  if (!isTableRefNode(node)) return;
  const target = resolveTableRefTarget(
    tableRefAttrsFromNode(node),
    containing,
    documentType
  );
  const n = lookupOrdinal(contents, target);
  node.attrs = {
    section: target.section,
    targetField: target.targetField,
    tableIndex: target.tableIndex,
    n,
  };
}

function walkInline(
  node: JSONContent,
  visit: (child: JSONContent) => void
): void {
  visit(node);
  if (node.type === "table") return;
  node.content?.forEach((child) => walkInline(child, visit));
}

export function tableRefNumberMap(
  contents: readonly DocumentTableContent[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of contents) {
    for (const { field, doc } of richFieldDocsForTableRefs(row.section, row.content)) {
      const targetField = field || defaultTableFieldForSection(row.section);
      const count = tableCountInDoc(doc);
      for (let tableIndex = 0; tableIndex < count; tableIndex += 1) {
        const target = { section: row.section, targetField, tableIndex };
        const n = lookupOrdinal(contents, target);
        if (n != null) map.set(tableRefMapKey(target), n);
      }
    }
  }
  return map;
}

/** Word Update Fields: stamp identity + SEQ ordinal on every tableRef. */
export function syncTableRefsInContents(
  contents: readonly DocumentTableContent[],
  documentType?: DocumentType | null
): {
  contents: DocumentTableContent[];
  changedSections: string[];
} {
  const next: DocumentTableContent[] = contents.map((row) => ({
    section: row.section,
    content: structuredClone(row.content),
  }));

  for (const row of next) {
    if (!row.content || typeof row.content !== "object") continue;
    for (const { field, doc } of richFieldDocsForTableRefs(row.section, row.content)) {
      const working = structuredClone(doc);
      const containing = {
        section: row.section,
        targetField: field || defaultTableFieldForSection(row.section),
      };
      walkInline(working, (child) =>
        syncTableRefNode(child, containing, next, documentType)
      );
      if (field === "") {
        row.content = working;
      } else {
        row.content = setRichFieldValue(
          row.content as Record<string, unknown>,
          field,
          working
        );
      }
    }
  }

  const changedSections: string[] = [];
  for (let index = 0; index < contents.length; index += 1) {
    const before = contents[index];
    const after = next[index];
    if (!before || !after) continue;
    if (JSON.stringify(before.content) !== JSON.stringify(after.content)) {
      changedSections.push(after.section);
    }
  }
  return { contents: next, changedSections };
}
