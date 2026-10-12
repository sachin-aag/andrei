import type { JSONContent } from "@tiptap/core";
import {
  CVP_BATCH_EXECUTION_HEADERS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_SWAB_LIMIT,
  CVP_TABLE_SECTION_BOILERPLATE,
  type CvpPersistableSectionKey,
} from "./sections";
import { cvpSwabLocations, type CvpEquipmentType } from "./equipment-types";

const CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null };

function nodePlain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodePlain).join("");
}

function cellPlain(cell: JSONContent | undefined): string {
  return nodePlain(cell).replace(/\s+/g, " ").trim();
}

function headerLabels(row: JSONContent | undefined): string[] {
  return (row?.content ?? [])
    .filter((cell) => cell.type === "tableHeader" || cell.type === "tableCell")
    .map(cellPlain);
}

function headersMatch(
  actual: readonly string[],
  expected: readonly string[]
): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every(
    (label, i) => (actual[i] ?? "").toLowerCase() === label.toLowerCase()
  );
}

function textParagraph(text: string, bold = false): JSONContent {
  if (!text) return { type: "paragraph" };
  return {
    type: "paragraph",
    content: [
      bold
        ? { type: "text", text, marks: [{ type: "bold" }] }
        : { type: "text", text },
    ],
  };
}

function makeCell(
  type: "tableHeader" | "tableCell",
  text: string
): JSONContent {
  return {
    type,
    attrs: { ...CELL_ATTRS },
    content: [textParagraph(text)],
  };
}

function cloneCellWithText(cell: JSONContent, text: string): JSONContent {
  const paragraph = cell.content?.find((node) => node.type === "paragraph");
  const textNode = paragraph?.content?.find((node) => node.type === "text");
  const nextText: JSONContent = textNode?.marks
    ? { type: "text", text, marks: textNode.marks }
    : { type: "text", text };
  return {
    ...cell,
    content: [{ type: "paragraph", content: text ? [nextText] : [] }],
  };
}

function emptyLike(cell: JSONContent | undefined): JSONContent {
  if (!cell) return makeCell("tableCell", "");
  return {
    ...cell,
    type: "tableCell",
    content: [{ type: "paragraph" }],
  };
}

function padCells(
  cells: JSONContent[],
  length: number,
  kind: "tableHeader" | "tableCell"
): JSONContent[] {
  const next = cells.slice(0, length);
  while (next.length < length) {
    next.push(makeCell(kind, ""));
  }
  return next;
}

function isLimitNmtRow(cells: JSONContent[]): boolean {
  return /^limit nmt/i.test(cellPlain(cells[0]));
}

const ANALYTICAL_FOOTER_LABEL = /^(limit|loq|lod)\b/i;
const BATCH_HEADER_LABEL = /^batch(?:\s+\d+)?$/i;

function isAnalyticalFooterTable(labels: readonly string[]): boolean {
  if (
    headersMatch(labels, CVP_RESIDUE_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_EXTRANEOUS_RESULTS_HEADERS)
  ) {
    return true;
  }
  return (
    /^sample description/i.test(labels[0] ?? "") &&
    (labels.some((label) => /sample id/i.test(label)) ||
      labels.some((label) => /^limit$/i.test(normHeader(label)))) &&
    (labels.some((label) => /^results$/i.test(normHeader(label))) ||
      labels.some((label) => BATCH_HEADER_LABEL.test(label)))
  );
}

function batchColumnStart(labels: readonly string[]): number {
  const batch = labels.findIndex((label) => BATCH_HEADER_LABEL.test(label));
  if (batch >= 0) return batch;
  const results = labels.findIndex((label) => /^results$/i.test(normHeader(label)));
  if (results >= 0) return results;
  return Math.max(1, labels.length - 1);
}

function stripBold(node: JSONContent): { node: JSONContent; changed: boolean } {
  if (node.type === "text") {
    const marks = node.marks ?? [];
    if (!marks.some((mark) => mark.type === "bold")) return { node, changed: false };
    const next = marks.filter((mark) => mark.type !== "bold");
    return {
      node: next.length > 0 ? { ...node, marks: next } : { type: "text", text: node.text },
      changed: true,
    };
  }
  if (!node.content) return { node, changed: false };
  let changed = false;
  const content = node.content.map((child) => {
    const next = stripBold(child);
    if (next.changed) changed = true;
    return next.node;
  });
  return changed ? { node: { ...node, content }, changed } : { node, changed: false };
}

/** Batch headers use the same weight as Sample ID. CSS on `th` supplies it. */
function unboldCvpBatchHeaders(table: JSONContent): JSONContent {
  const rows = table.content ?? [];
  const header = rows[0];
  if (!header || header.type !== "tableRow") return table;
  let changed = false;
  const content = (header.content ?? []).map((cell) => {
    if (cell.type !== "tableHeader" && cell.type !== "tableCell") return cell;
    if (!BATCH_HEADER_LABEL.test(cellPlain(cell))) return cell;
    const stripped = stripBold(cell);
    if (!stripped.changed) return cell;
    changed = true;
    return stripped.node;
  });
  if (!changed) return table;
  return { ...table, content: [{ ...header, content }, ...rows.slice(1)] };
}

/**
 * Limit / LOQ / LOD (and the extraneous Limit sentence) are the acceptance
 * criterion for every batch. Copy that text into Batch 1, Batch 2, and
 * Batch 3. Sample ID on those rows stays blank.
 *
 * Agent `edit_table` / `create_table` always relocates. Read/merge upgrade
 * only relocates when the table was just widened from a single Results
 * column — re-running on an already-wide grid wipes engineer keystrokes
 * in Sample ID and any batch cell that differs from the first filled one.
 */
export function placeCvpAnalyticalFooter(
  table: JSONContent,
  options?: { relocateCriteria?: boolean }
): JSONContent {
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const aligned = unboldCvpBatchHeaders(table);
  if (!isAnalyticalFooterTable(labels)) return aligned;
  if (options?.relocateCriteria === false) return aligned;
  const batchStart = batchColumnStart(labels);
  let changed = aligned !== table;
  const content = (aligned.content ?? []).map((row, index) => {
    if (index === 0 || row.type !== "tableRow") return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    if (cells.length <= batchStart || !ANALYTICAL_FOOTER_LABEL.test(cellPlain(cells[0]))) {
      return row;
    }
    const donor = cells.findIndex(
      (cell, i) => i >= batchStart && cellPlain(cell).length > 0
    );
    const fallback = cells.findIndex(
      (cell, i) => i > 0 && i < batchStart && cellPlain(cell).length > 0
    );
    const source = donor >= 0 ? donor : fallback;
    if (source < 0) return row;
    const criterion = cellPlain(cells[source]);
    let rowChanged = false;
    const nextCells = cells.map((cell, i) => {
      if (i === 0) return cell;
      if (i < batchStart) {
        if (cellPlain(cell).length === 0) return cell;
        rowChanged = true;
        return emptyLike(cell);
      }
      if (cellPlain(cell) === criterion) return cell;
      rowChanged = true;
      return { ...structuredClone(cells[source]!), type: "tableCell" as const };
    });
    if (!rowChanged) return row;
    changed = true;
    return { ...row, content: nextCells };
  });
  return changed ? { ...aligned, content } : aligned;
}
function hasBatchExecutionTable(doc: JSONContent): boolean {
  return (doc.content ?? []).some(
    (node) =>
      node.type === "table" &&
      headersMatch(headerLabels(node.content?.[0]), CVP_BATCH_EXECUTION_HEADERS)
  );
}

const BOILERPLATE_FINGERPRINT = 80;

/**
 * Table-only 15.N continuations / 16.0 / 17.0: prepend the ISM Stage-4
 * intros when the stored doc still has a table but no matching paragraph.
 * Empty (cleared) fields stay empty.
 */
export function ensureCvpTableSectionBoilerplate(
  key: string,
  doc: JSONContent
): JSONContent {
  const intros = CVP_TABLE_SECTION_BOILERPLATE[key as CvpPersistableSectionKey];
  if (!intros?.length) return doc;
  const nodes = doc.content ?? [];
  if (!nodes.some((node) => node.type === "table")) return doc;
  const fingerprint = intros[0]!.text.slice(0, BOILERPLATE_FINGERPRINT);
  const already = nodes.some((node) => {
    if (node.type !== "paragraph") return false;
    return nodePlain(node)
      .replace(/\s+/g, " ")
      .trim()
      .startsWith(fingerprint);
  });
  if (already) return doc;
  return {
    ...doc,
    content: [
      ...intros.map((item) => textParagraph(item.text, item.bold === true)),
      ...nodes,
    ],
  };
}

function batchExecutionValueCellsEmpty(table: JSONContent): boolean {
  for (const row of (table.content ?? []).slice(1)) {
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    for (let i = 1; i < cells.length; i++) {
      if (cellPlain(cells[i]).length > 0) return false;
    }
  }
  return true;
}

/** Sampling plan (15.0): drop the unused batch-execution table when its value cells are empty. */
export function ensureCvpBatchExecutionTable(doc: JSONContent): JSONContent {
  if (!hasBatchExecutionTable(doc)) return doc;
  const content = (doc.content ?? []).filter((node) => {
    if (node.type !== "table") return true;
    if (!headersMatch(headerLabels(node.content?.[0]), CVP_BATCH_EXECUTION_HEADERS)) {
      return true;
    }
    return !batchExecutionValueCellsEmpty(node);
  });
  return content.length === (doc.content ?? []).length
    ? doc
    : { ...doc, content };
}
function normHeader(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function isResidueResultsTable(labels: readonly string[]): boolean {
  return (
    /^sample description/i.test(labels[0] ?? "") &&
    labels.some((label) => /sample id/i.test(label))
  );
}

function residueLimitColumn(labels: readonly string[]): number {
  return labels.findIndex((label) => /^limit$/i.test(normHeader(label)));
}

function isManufacturingAreaSampleTable(labels: readonly string[]): boolean {
  return labels.some((label) => {
    const n = normHeader(label);
    return n === "area name" || n === "sampled area";
  });
}

function isGroupedResultsTable(table: JSONContent): boolean {
  const header = table.content?.[0];
  const labels = headerLabels(header);
  const resultsIdx = labels.findIndex((label) =>
    /^results\b/.test(normHeader(label))
  );
  if (resultsIdx < 0) return false;
  const resultsCell = (header?.content ?? []).filter(
    (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
  )[resultsIdx];
  if (Number(resultsCell?.attrs?.colspan) > 1) return true;
  const second = headerLabels(table.content?.[1]);
  return (
    second.length > 0 &&
    second.every((label) => !label || /^batch(?:\s+\d+)?$/i.test(label))
  );
}
function residueBodyNames(table: JSONContent): string[] {
  const labels = headerLabels(table.content?.[0]);
  const grouped = labels.includes("Results");
  return (table.content ?? []).flatMap((row, index) => {
    if (index === 0 || row.type !== "tableRow") return [];
    if (grouped && index === 1) return [];
    const first = cellPlain(
      (row.content ?? []).find(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      )
    );
    return first ? [first] : [];
  });
}

function residueColumnCount(table: JSONContent): number {
  const labels = headerLabels(table.content?.[0]);
  if (labels.includes("Results")) {
    return labels.filter((label) => label !== "Results").length + 3;
  }
  return labels.length;
}

export function expandStubCvpSwabRows(
  table: JSONContent,
  type: CvpEquipmentType
): JSONContent {
  const locations = cvpSwabLocations(type);
  if (locations.length === 0) return table;
  const labels = headerLabels(table.content?.[0]);
  if (!isResidueResultsTable(labels)) return table;
  const names = residueBodyNames(table);
  const hasLocations = names.some(
    (name) =>
      !/^(swab samples|loq|lod|limit)$/i.test(name) &&
      !/rinse|reflux|heated acetone/i.test(name)
  );
  if (hasLocations) return table;
  const grouped = isGroupedResultsTable(table);
  const bodyStart = grouped ? 2 : 1;
  const rows = table.content ?? [];
  const swabIndex = rows.findIndex((row, index) => {
    if (index < bodyStart || row.type !== "tableRow") return false;
    const first = cellPlain(
      (row.content ?? []).find(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      )
    );
    return /^swab samples$/i.test(first);
  });
  if (swabIndex < 0) return table;
  let end = swabIndex + 1;
  while (end < rows.length) {
    const first = cellPlain(
      (rows[end]?.content ?? []).find(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      )
    );
    if (first.length > 0) break;
    end += 1;
  }
  const limitCol = residueLimitColumn(labels);
  const sampleIdCol = labels.findIndex((label) => /sample id/i.test(label));
  const colCount = residueColumnCount(table);
  const locationRows = locations.map((location) => ({
    type: "tableRow" as const,
    content: Array.from({ length: colCount }, (_, i) => {
      if (i === 0) return makeCell("tableCell", location.description);
      if (i === sampleIdCol) return makeCell("tableCell", location.id);
      if (i === limitCol) return makeCell("tableCell", CVP_SWAB_LIMIT);
      return makeCell("tableCell", "");
    }),
  }));
  return {
    ...table,
    content: [
      ...rows.slice(0, swabIndex + 1),
      ...locationRows,
      ...rows.slice(end),
    ],
  };
}
