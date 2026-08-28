import type { JSONContent } from "@tiptap/core";
import { diffWords } from "diff";
import type { DocumentType, SectionType } from "@/db/schema";
import { chatTargetFields, sectionLabel } from "@/lib/ai/chat/fields";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { DOCUMENT_REVISION_METADATA_SECTION } from "@/lib/document-revisions/constants";

export type InlineDiffPart = {
  type: "equal" | "insert" | "delete";
  value: string;
};

export type InlineTableCellDiff = {
  parts: InlineDiffPart[];
};

export type InlineTableDiff = {
  rows: InlineTableCellDiff[][];
};

export type InlineFieldDiff = {
  targetField: string;
  kind: "text" | "table";
  parts?: InlineDiffPart[];
  table?: InlineTableDiff;
};

export type InlineSectionDiff = {
  section: string;
  label: string;
  fields: InlineFieldDiff[];
};

export type RevisionSectionSnapshot = {
  section: string;
  content: Record<string, unknown>;
  contentHash: string;
};

function wordDiff(fromText: string, toText: string): InlineDiffPart[] {
  if (fromText === toText) {
    return fromText ? [{ type: "equal", value: fromText }] : [];
  }
  return diffWords(fromText, toText).map((part) => {
    if (part.added) return { type: "insert" as const, value: part.value };
    if (part.removed) return { type: "delete" as const, value: part.value };
    return { type: "equal" as const, value: part.value };
  });
}

function cellText(cell: JSONContent | undefined): string {
  if (!cell) return "";
  return flattenForAnchor(cell).text.replace(/\s+/g, " ").trim();
}

function tablesFromDoc(doc: JSONContent): string[][][] {
  const tables: string[][][] = [];
  const walk = (node: JSONContent | undefined) => {
    if (!node) return;
    if (node.type === "table") {
      const rows: string[][] = [];
      for (const row of node.content ?? []) {
        if (row.type !== "tableRow") continue;
        rows.push((row.content ?? []).map((cell) => cellText(cell)));
      }
      tables.push(rows);
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return tables;
}

function diffTables(from: string[][], to: string[][]): InlineTableDiff {
  const rowCount = Math.max(from.length, to.length);
  const colCount = Math.max(
    ...from.map((row) => row.length),
    ...to.map((row) => row.length),
    0
  );
  const rows: InlineTableCellDiff[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const cells: InlineTableCellDiff[] = [];
    for (let c = 0; c < colCount; c++) {
      cells.push({
        parts: wordDiff(from[r]?.[c] ?? "", to[r]?.[c] ?? ""),
      });
    }
    rows.push(cells);
  }
  return { rows };
}

function diffRichField(
  fromContent: Record<string, unknown>,
  toContent: Record<string, unknown>,
  section: SectionType,
  targetField: string
): InlineFieldDiff | null {
  const fromDoc = getRichFieldValue(fromContent, targetField);
  const toDoc = getRichFieldValue(toContent, targetField);
  const fromTables = tablesFromDoc(fromDoc);
  const toTables = tablesFromDoc(toDoc);
  if (fromTables.length === 1 && toTables.length === 1) {
    const table = diffTables(fromTables[0]!, toTables[0]!);
    const changed = table.rows.some((row) =>
      row.some((cell) => cell.parts.some((part) => part.type !== "equal"))
    );
    if (!changed) return null;
    return { targetField, kind: "table", table };
  }
  const fromText = flattenForAnchor(fromDoc).text;
  const toText = flattenForAnchor(toDoc).text;
  if (fromText === toText) return null;
  return { targetField, kind: "text", parts: wordDiff(fromText, toText) };
}

function diffPlainField(
  fromContent: Record<string, unknown>,
  toContent: Record<string, unknown>,
  targetField: string
): InlineFieldDiff | null {
  const fromText = getPlainTextFieldValue(fromContent, targetField);
  const toText = getPlainTextFieldValue(toContent, targetField);
  if (fromText === toText) return null;
  return { targetField, kind: "text", parts: wordDiff(fromText, toText) };
}

function snapshotMap(
  rows: readonly RevisionSectionSnapshot[]
): Map<string, RevisionSectionSnapshot> {
  return new Map(rows.map((row) => [row.section, row]));
}

export function diffRevisionSnapshots(args: {
  documentType: DocumentType;
  from: readonly RevisionSectionSnapshot[];
  to: readonly RevisionSectionSnapshot[];
}): InlineSectionDiff[] {
  const fromMap = snapshotMap(args.from);
  const toMap = snapshotMap(args.to);
  const sectionKeys = new Set([...fromMap.keys(), ...toMap.keys()]);
  const diffs: InlineSectionDiff[] = [];

  for (const section of sectionKeys) {
    const fromRow = fromMap.get(section);
    const toRow = toMap.get(section);
    if ((fromRow?.contentHash ?? "") === (toRow?.contentHash ?? "")) continue;
    const fromContent = (fromRow?.content ?? {}) as Record<string, unknown>;
    const toContent = (toRow?.content ?? {}) as Record<string, unknown>;
    const fields: InlineFieldDiff[] = [];

    if (section === DOCUMENT_REVISION_METADATA_SECTION) {
      const parts = wordDiff(
        JSON.stringify(fromContent, null, 2),
        JSON.stringify(toContent, null, 2)
      );
      if (parts.some((part) => part.type !== "equal")) {
        fields.push({ targetField: "metadata", kind: "text", parts });
      }
    } else {
      for (const field of chatTargetFields(section)) {
        const next = isRichTargetField(section, field.targetField)
          ? diffRichField(fromContent, toContent, section, field.targetField)
          : diffPlainField(fromContent, toContent, field.targetField);
        if (next) fields.push(next);
      }
      if (fields.length === 0) {
        const parts = wordDiff(
          JSON.stringify(fromContent),
          JSON.stringify(toContent)
        );
        if (parts.some((part) => part.type !== "equal")) {
          fields.push({ targetField: "content", kind: "text", parts });
        }
      }
    }

    if (fields.length === 0) continue;
    diffs.push({
      section,
      label:
        section === DOCUMENT_REVISION_METADATA_SECTION
          ? "Document identity"
          : sectionLabel(section),
      fields,
    });
  }

  return diffs;
}
