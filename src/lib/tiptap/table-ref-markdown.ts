import type { JSONContent } from "@tiptap/core";
import { RICH_FIELD_PATHS } from "@/lib/ai/suggest-target-fields";

export const TABLE_REF_NODE_TYPE = "tableRef";

/** `[[table]]` or `[[table:elr_monitoring.table#0]]`. */
export const TABLE_REF_TOKEN_RE = /\[\[table(?::([^\]]+))?\]\]/gi;

export type TableRefAttrs = {
  /** Empty = the section that contains this node. */
  section: string;
  /** Empty = that section's default table field (`table` when present). */
  targetField: string;
  tableIndex: number;
  /** Live SEQ ordinal; null until cascade/resolve. */
  n: number | null;
};

export function defaultTableFieldForSection(section: string): string {
  const paths = RICH_FIELD_PATHS[section];
  if (paths?.includes("table")) return "table";
  if (paths?.[0]) return paths[0];
  return "narrative";
}

const KNOWN_SECTION_KEYS = new Set(Object.keys(RICH_FIELD_PATHS));

const KNOWN_FIELD_NAMES = new Set(
  Object.values(RICH_FIELD_PATHS).flatMap((paths) => paths ?? [])
);

function isKnownSectionKey(raw: string): boolean {
  return KNOWN_SECTION_KEYS.has(raw);
}

function isRelativeFieldSpec(path: string): boolean {
  if (isKnownSectionKey(path)) return false;
  if (path === "table" || path.startsWith("table#")) return true;
  return KNOWN_FIELD_NAMES.has(path);
}

/**
 * Parse `elr_monitoring`, `elr_monitoring.table#1`, `table`, or a label such as
 * `Monitoring`. Labels stay as written — resolve them at cascade, not here.
 * This module must not import `@/lib/document-types`.
 */
export function parseTableRefSpec(spec: string | undefined): TableRefAttrs {
  if (!spec?.trim()) {
    return { section: "", targetField: "", tableIndex: 0, n: null };
  }
  const trimmed = spec.trim();
  const hashSplit = trimmed.split("#");
  const path = hashSplit[0] ?? "";
  const parsedIndex = hashSplit[1] ? Number.parseInt(hashSplit[1], 10) : 0;
  const tableIndex =
    Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
  const dot = path.indexOf(".");
  if (dot >= 0) {
    return {
      section: path.slice(0, dot),
      targetField: path.slice(dot + 1),
      tableIndex,
      n: null,
    };
  }
  if (isKnownSectionKey(path)) {
    return { section: path, targetField: "", tableIndex, n: null };
  }
  if (isRelativeFieldSpec(path)) {
    return { section: "", targetField: path, tableIndex, n: null };
  }
  return { section: path, targetField: "", tableIndex, n: null };
}

export function tableRefDisplayText(
  attrs: Partial<TableRefAttrs> | null | undefined
): string {
  const n = attrs?.n;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) {
    return `Table ${n}`;
  }
  return "the table";
}

export function tableRefNode(
  attrs: TableRefAttrs,
  extraMarks?: JSONContent["marks"]
): JSONContent {
  const node: JSONContent = {
    type: TABLE_REF_NODE_TYPE,
    attrs: {
      section: attrs.section,
      targetField: attrs.targetField,
      tableIndex: attrs.tableIndex,
      n: attrs.n,
    },
  };
  if (extraMarks?.length) node.marks = extraMarks;
  return node;
}

export function isTableRefNode(node: JSONContent | undefined | null): boolean {
  return node?.type === TABLE_REF_NODE_TYPE;
}

export function tableRefAttrsFromNode(node: JSONContent): TableRefAttrs {
  const attrs = node.attrs ?? {};
  const tableIndex = Number(attrs.tableIndex);
  const n = attrs.n;
  return {
    section: typeof attrs.section === "string" ? attrs.section : "",
    targetField: typeof attrs.targetField === "string" ? attrs.targetField : "",
    tableIndex: Number.isFinite(tableIndex) && tableIndex >= 0 ? tableIndex : 0,
    n: typeof n === "number" && Number.isFinite(n) ? n : null,
  };
}
