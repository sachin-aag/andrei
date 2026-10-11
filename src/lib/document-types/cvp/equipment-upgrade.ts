import type { JSONContent } from "@tiptap/core";
import {
  classifyCvpEquipmentType,
  cvpCleaningParameterRows,
  cvpHasShellWallCalc,
  cvpResidueHeadingTitle,
  type CvpEquipmentType,
} from "./equipment-types";
import {
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_EQUIPMENT_TYPE_MARKER_PREFIX,
  CVP_PREVIOUS_CLEANING_OPERATION_HEADERS,
  CVP_SHELL_CALC_HEADERS,
  cvpEquipmentTypeFromMarker,
  cvpEquipmentTypeMarker,
  groupedResultsTable,
} from "./sections";

const CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null };

function nodePlain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodePlain).join("");
}

function cellPlain(cell: JSONContent | undefined): string {
  return nodePlain(cell).replace(/\s+/g, " ").trim();
}

function paragraphPlain(node: JSONContent): string {
  return cellPlain(node);
}

function headingText(node: JSONContent): string {
  return cellPlain(node);
}

function textParagraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function heading(level: 3 | 4, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
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

function tableLooksLike(
  table: JSONContent,
  expected: readonly string[]
): boolean {
  return headersMatch(headerLabels(table.content?.[0]), expected);
}

function groupedCleaningHeaders(table: JSONContent): boolean {
  const first = headerLabels(table.content?.[0]);
  if (first.includes("Results") && first[0]?.toLowerCase() === "cleaning parameter") {
    return true;
  }
  return (
    tableLooksLike(table, CVP_CLEANING_OPERATION_HEADERS) ||
    tableLooksLike(table, CVP_PREVIOUS_CLEANING_OPERATION_HEADERS)
  );
}

const SEED_LIMIT = /^(nmt\s+[\d.]+ ppm|na|for information|black and fiber)/i;
const FOOTER_LABEL = /^(limit|loq|lod)\b/i;

function tableHasFilledExecutionCells(table: JSONContent): boolean {
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const batchStart = labels.findIndex((label) =>
    /^(batch(?:\s+\d+)?|results)$/i.test(label)
  );
  const start = batchStart >= 0 ? batchStart : Math.max(1, labels.length - 3);
  for (const row of rows.slice(1)) {
    if (row.type !== "tableRow") continue;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    if (FOOTER_LABEL.test(cellPlain(cells[0]))) continue;
    for (let i = start; i < cells.length; i++) {
      const text = cellPlain(cells[i]);
      if (!text || SEED_LIMIT.test(text)) continue;
      return true;
    }
  }
  return false;
}

function docHasFilledExecutionCells(doc: JSONContent): boolean {
  return (doc.content ?? []).some(
    (node) => node.type === "table" && tableHasFilledExecutionCells(node)
  );
}

function findH2(doc: JSONContent): JSONContent | undefined {
  return (doc.content ?? []).find(
    (node) => node.type === "heading" && Number(node.attrs?.level) === 2
  );
}

export function readCvpEquipmentType(doc: JSONContent): CvpEquipmentType {
  for (const node of doc.content ?? []) {
    if (node.type !== "paragraph") continue;
    const fromMarker = cvpEquipmentTypeFromMarker(paragraphPlain(node));
    if (fromMarker) return fromMarker;
  }
  const h2 = findH2(doc);
  const attr = h2?.attrs?.cvpEquipmentType;
  if (typeof attr === "string" && attr.length > 0) {
    const fromMarker = cvpEquipmentTypeFromMarker(
      `${CVP_EQUIPMENT_TYPE_MARKER_PREFIX} ${attr}`
    );
    if (fromMarker) return fromMarker;
  }
  return classifyCvpEquipmentType(h2 ? headingText(h2) : "");
}

function hasTypeMarker(doc: JSONContent): boolean {
  return (doc.content ?? []).some(
    (node) =>
      node.type === "paragraph" &&
      cvpEquipmentTypeFromMarker(paragraphPlain(node)) != null
  );
}

function insertTypeMarker(doc: JSONContent, type: CvpEquipmentType): JSONContent {
  const nodes = [...(doc.content ?? [])];
  const h2Index = nodes.findIndex(
    (node) => node.type === "heading" && Number(node.attrs?.level) === 2
  );
  const marker = textParagraph(cvpEquipmentTypeMarker(type));
  if (h2Index < 0) {
    return { ...doc, content: [marker, ...nodes] };
  }
  nodes.splice(h2Index + 1, 0, marker);
  return { ...doc, content: nodes };
}

function ordinalFromHeading(doc: JSONContent): number {
  const text = findH2(doc) ? headingText(findH2(doc)!) : "";
  const match = /^15\.(\d+)/.exec(text);
  const n = match ? Number(match[1]) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function hasShellWallHeading(doc: JSONContent): boolean {
  return (doc.content ?? []).some(
    (node) =>
      node.type === "heading" &&
      /shell wall swab/i.test(headingText(node))
  );
}

function retitleResidueHeading(
  doc: JSONContent,
  type: CvpEquipmentType,
  ordinal: number
): JSONContent {
  const wanted = cvpResidueHeadingTitle(type, ordinal);
  let changed = false;
  const content = (doc.content ?? []).map((node) => {
    if (node.type !== "heading") return node;
    const text = headingText(node);
    if (!/15\.\d+\.7\b/.test(text)) return node;
    if (text === wanted) return node;
    changed = true;
    return {
      ...node,
      content: [{ type: "text", text: wanted }],
    };
  });
  return changed ? { ...doc, content } : doc;
}

function hasCleaningParameterTable(doc: JSONContent): boolean {
  return (doc.content ?? []).some(
    (node) => node.type === "table" && groupedCleaningHeaders(node)
  );
}

function cleaningTableIsGenericEmptySeed(table: JSONContent): boolean {
  if (!groupedCleaningHeaders(table)) return false;
  if (tableHasFilledExecutionCells(table)) return false;
  const rows = table.content ?? [];
  const body = rows.slice(1).filter((row) => row.type === "tableRow");
  if (body.length === 0) return true;
  const first = cellPlain(body[0]?.content?.[0]);
  return /water quantity used for flushing \(l\)/i.test(first);
}

function insertAfterHeading(
  doc: JSONContent,
  headingMatch: RegExp,
  nodes: JSONContent[]
): JSONContent {
  const content = [...(doc.content ?? [])];
  const index = content.findIndex(
    (node) => node.type === "heading" && headingMatch.test(headingText(node))
  );
  if (index < 0) {
    return { ...doc, content: [...content, ...nodes] };
  }
  content.splice(index + 1, 0, ...nodes);
  return { ...doc, content };
}

function replaceGenericCleaningTable(
  doc: JSONContent,
  type: CvpEquipmentType
): JSONContent {
  const rows = cvpCleaningParameterRows(type);
  if (rows.length === 0) return doc;
  const nextTable = groupedResultsTable(
    ["Cleaning Parameter", "Acceptance Criteria / Target"],
    rows.map(([parameter, target]) => [parameter, target, "", "", ""])
  );
  let replaced = false;
  const content = (doc.content ?? []).map((node) => {
    if (replaced || node.type !== "table") return node;
    if (!cleaningTableIsGenericEmptySeed(node) && !groupedCleaningHeaders(node)) {
      return node;
    }
    if (tableHasFilledExecutionCells(node)) return node;
    if (!groupedCleaningHeaders(node)) return node;
    replaced = true;
    return nextTable;
  });
  if (replaced) return { ...doc, content };
  return insertAfterHeading(doc, /15\.\d+\.4\b/, [nextTable]);
}

function addCleaningSectionIfMissing(
  doc: JSONContent,
  type: CvpEquipmentType,
  ordinal: number
): JSONContent {
  const rows = cvpCleaningParameterRows(type);
  if (rows.length === 0) return doc;
  if (hasCleaningParameterTable(doc)) {
    return replaceGenericCleaningTable(doc, type);
  }
  return insertAfterHeading(doc, /15\.\d+\.3/, [
    heading(3, `15.${ordinal}.4 Cleaning operation results summary`),
    groupedResultsTable(
      ["Cleaning Parameter", "Acceptance Criteria / Target"],
      rows.map(([parameter, target]) => [parameter, target, "", "", ""])
    ),
  ]);
}

function addShellWallIfMissing(
  doc: JSONContent,
  type: CvpEquipmentType,
  ordinal: number
): JSONContent {
  if (!cvpHasShellWallCalc(type) || hasShellWallHeading(doc)) return doc;
  return insertAfterHeading(doc, /15\.\d+\.3\.1\b|worst-case locations/i, [
    heading(4, `15.${ordinal}.3.2 Calculation for shell wall swab locations`),
    textParagraph(
      "The number of shell wall swab sampling locations shall be determined from the vessel shell height and diameter, to ensure representative coverage of the internal product-contact surface. Refer to Section 14.0."
    ),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: CVP_SHELL_CALC_HEADERS.map((h) => ({
            type: "tableHeader",
            attrs: { ...CELL_ATTRS },
            content: [textParagraph(h)],
          })),
        },
        {
          type: "tableRow",
          content: CVP_SHELL_CALC_HEADERS.map(() => ({
            type: "tableCell",
            attrs: { ...CELL_ATTRS },
            content: [{ type: "paragraph" }],
          })),
        },
      ],
    },
  ]);
}

/**
 * Classify an existing 15.N box and fill missing type-specific structure.
 * Does not rewrite a box the engineer has already filled past the seed,
 * and does not copy report-side shortcuts (RCVD labels, D>1 m two-location).
 */
export function applyCvpEquipmentTypeRecipe(doc: JSONContent): JSONContent {
  if (!doc.content?.length) return doc;
  const type = readCvpEquipmentType(doc);
  const ordinal = ordinalFromHeading(doc);
  let next = hasTypeMarker(doc) ? doc : insertTypeMarker(doc, type);
  next = retitleResidueHeading(next, type, ordinal);
  if (docHasFilledExecutionCells(next)) return next;
  next = addShellWallIfMissing(next, type, ordinal);
  next = addCleaningSectionIfMissing(next, type, ordinal);
  return next;
}
