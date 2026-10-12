import type { JSONContent } from "@tiptap/core";
import {
  classifyCvpEquipmentType,
  cvpCleaningParameterRows,
  cvpHasShellWallCalc,
  cvpIsReactorFamily,
  cvpResidueHeadingTitle,
  cvpSwabLocations,
  cvpSwabRationaleRows,
  type CvpEquipmentType,
} from "./equipment-types";
import { expandStubCvpSwabRows } from "./cvp-merge-helpers";
import {
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_CLEANING_OPERATION_INTRO_SEEDS,
  CVP_EQUIPMENT_H3_OUTLINE,
  CVP_EQUIPMENT_H4_OUTLINE,
  CVP_EQUIPMENT_TYPE_MARKER_PREFIX,
  CVP_PREVIOUS_CLEANING_OPERATION_HEADERS,
  CVP_PREVIOUS_CLEANING_OPERATION_INTRO_SEED,
  CVP_PREVIOUS_VISUAL_INSPECTION_HEADERS,
  CVP_PREVIOUS_VISUAL_INSPECTION_INTRO_SEED,
  CVP_SHELL_CALC_HEADERS,
  CVP_SWAB_LOCATION_HEADERS,
  CVP_SWAB_RATIONALE_HEADERS,
  CVP_VISUAL_INSPECTION_HEADERS,
  CVP_VISUAL_INSPECTION_INTRO_SEED,
  CVP_VISUAL_INSPECTION_ROWS,
  cvpEquipmentTypeFromMarker,
  cvpVisualInspectionTable,
  groupedResultsTable,
  table,
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

function headingTitle(text: string): string {
  return text.replace(/^15\.\d+(?:\.\d+)*\s+/, "").trim();
}

function headingMatchesTitle(node: JSONContent, title: RegExp): boolean {
  return node.type === "heading" && title.test(headingTitle(headingText(node)));
}

const CLEANING_OPERATION_TITLE = /^cleaning operation results summary$/i;
const RESULTS_SUMMARY_TITLE = /^cleaning validation results summary$/i;
const VISUAL_TITLE = /^visual inspection summary$/i;
const RESIDUE_TITLE =
  /^(?:reflux,\s*)?swab\s*&\s*rinse samples analysis results summary$/i;
const EXTRANEOUS_TITLE =
  /^rinse samples analysis results summary \(extraneous matter\)$/i;
const WORST_CASE_TITLE = /^worst-case locations$/i;

const INSERT_CLEANING_BEFORE = [
  RESULTS_SUMMARY_TITLE,
  VISUAL_TITLE,
  RESIDUE_TITLE,
  EXTRANEOUS_TITLE,
];
const INSERT_VISUAL_BEFORE = [RESIDUE_TITLE, EXTRANEOUS_TITLE];

const LEFTOVER_CLEANING_INTRO =
  /^record cleaning parameters/i;
const REPORT_CLEANING_CONCLUSION =
  /completed cleaning operation is considered satisfactory/i;
const LEFTOVER_VISUAL_INTRO = /independently by the Production Chemist/i;

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

function isVisualInspectionTable(table: JSONContent): boolean {
  const first = headerLabels(table.content?.[0]);
  if (first.some((label) => /sample id/i.test(label))) return false;
  if (!/^sample description/i.test(first[0] ?? "")) return false;
  return (
    first.includes("Results") ||
    tableLooksLike(table, CVP_VISUAL_INSPECTION_HEADERS) ||
    tableLooksLike(table, CVP_PREVIOUS_VISUAL_INSPECTION_HEADERS)
  );
}

const SEED_LIMIT = /^(nmt\s+[\d.]+ ppm|na|for information|black and fiber)/i;
const FOOTER_LABEL = /^(limit|loq|lod)\b/i;

function tableBodyRows(table: JSONContent): JSONContent[] {
  const rows = (table.content ?? []).filter((row) => row.type === "tableRow");
  const first = headerLabels(rows[0]);
  let start = 1;
  if (first.includes("Results") && rows[1]) {
    const second = headerLabels(rows[1]);
    if (second.every((label) => !label || /^batch(?:\s+\d+)?$/i.test(label))) {
      start = 2;
    }
  }
  return rows.slice(start);
}

function firstColumnNames(table: JSONContent): string[] {
  return tableBodyRows(table)
    .map((row) => {
      const cells = (row.content ?? []).filter(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      );
      return cellPlain(cells[0]);
    })
    .filter((name) => name.length > 0);
}

function tableHasFilledExecutionCells(table: JSONContent): boolean {
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const batchStart = labels.findIndex((label) =>
    /^(batch(?:\s+\d+)?|results)$/i.test(label)
  );
  const start = batchStart >= 0 ? batchStart : Math.max(1, labels.length - 3);
  for (const row of tableBodyRows(table)) {
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

function findH2(doc: JSONContent): JSONContent | undefined {
  return (doc.content ?? []).find(
    (node) => node.type === "heading" && Number(node.attrs?.level) === 2
  );
}

function isCvpEquipmentBox(doc: JSONContent): boolean {
  const h2 = findH2(doc);
  return Boolean(h2 && /^15\.\d+/.test(headingText(h2)));
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

function namesMatch(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every(
    (label, i) => (actual[i] ?? "").toLowerCase() === label.toLowerCase()
  );
}

function cleaningTableMatchesTypeRecipe(
  table: JSONContent,
  type: CvpEquipmentType
): boolean {
  const expected = cvpCleaningParameterRows(type).map(([parameter]) => parameter);
  return namesMatch(firstColumnNames(table), expected);
}

function cleaningTableReplaceable(
  table: JSONContent,
  type: CvpEquipmentType
): boolean {
  if (!groupedCleaningHeaders(table)) return false;
  if (tableHasFilledExecutionCells(table)) return false;
  if (cleaningTableMatchesTypeRecipe(table, type)) return false;
  const names = firstColumnNames(table);
  if (names.length === 0) return true;
  if (names.length <= 1) return true;
  const reactorNames = cvpCleaningParameterRows("reactor").map(
    ([parameter]) => parameter
  );
  const leftoverReactorSeed =
    !cvpIsReactorFamily(type) &&
    (namesMatch(names, reactorNames) ||
      /^water quantity used for flushing \(l\)$/i.test(names[0] ?? ""));
  return leftoverReactorSeed;
}

function visualTableMatchesSeed(table: JSONContent): boolean {
  const expected = CVP_VISUAL_INSPECTION_ROWS.map((row) => row[0] ?? "");
  return namesMatch(firstColumnNames(table), expected);
}

function visualTableReplaceable(table: JSONContent): boolean {
  if (!isVisualInspectionTable(table)) return false;
  if (tableHasFilledExecutionCells(table)) return false;
  if (visualTableMatchesSeed(table)) return false;
  const names = firstColumnNames(table);
  if (names.length === 0) return true;
  const standard = new Set(
    CVP_VISUAL_INSPECTION_ROWS.map((row) => (row[0] ?? "").toLowerCase())
  );
  return names.every((name) => standard.has(name.toLowerCase()));
}

function hasCleaningParameterTable(doc: JSONContent): boolean {
  return (doc.content ?? []).some(
    (node) => node.type === "table" && groupedCleaningHeaders(node)
  );
}

function hasVisualInspectionTable(doc: JSONContent): boolean {
  return (doc.content ?? []).some(
    (node) => node.type === "table" && isVisualInspectionTable(node)
  );
}

function hasHeading(doc: JSONContent, match: RegExp): boolean {
  return (doc.content ?? []).some((node) => headingMatchesTitle(node, match));
}

function insertAfterHeading(
  doc: JSONContent,
  headingMatch: RegExp,
  nodes: JSONContent[]
): JSONContent {
  const content = [...(doc.content ?? [])];
  const index = content.findIndex((node) =>
    headingMatchesTitle(node, headingMatch)
  );
  if (index < 0) {
    return { ...doc, content: [...content, ...nodes] };
  }
  let at = index + 1;
  while (at < content.length && content[at]?.type !== "heading") at += 1;
  content.splice(at, 0, ...nodes);
  return { ...doc, content };
}

function insertBeforeFirstHeading(
  doc: JSONContent,
  matchers: readonly RegExp[],
  nodes: JSONContent[]
): JSONContent {
  const content = [...(doc.content ?? [])];
  const index = content.findIndex(
    (node) =>
      node.type === "heading" &&
      matchers.some((match) => headingMatchesTitle(node, match))
  );
  if (index >= 0) {
    content.splice(index, 0, ...nodes);
    return { ...doc, content };
  }
  const inference = content.findIndex(
    (node) =>
      (node.type === "paragraph" || node.type === "heading") &&
      /^inference:?$/i.test(paragraphPlain(node))
  );
  if (inference >= 0) {
    content.splice(inference, 0, ...nodes);
    return { ...doc, content };
  }
  return { ...doc, content: [...content, ...nodes] };
}

function cleaningIntroNodes(): JSONContent[] {
  return CVP_CLEANING_OPERATION_INTRO_SEEDS.map((text) => textParagraph(text));
}

function isLeftoverCleaningIntro(text: string): boolean {
  return (
    text === CVP_PREVIOUS_CLEANING_OPERATION_INTRO_SEED ||
    LEFTOVER_CLEANING_INTRO.test(text) ||
    REPORT_CLEANING_CONCLUSION.test(text)
  );
}

function isLeftoverVisualIntro(text: string): boolean {
  return (
    text === CVP_PREVIOUS_VISUAL_INSPECTION_INTRO_SEED ||
    LEFTOVER_VISUAL_INTRO.test(text)
  );
}

function sectionRangeAfter(
  content: JSONContent[],
  headingIndex: number
): { start: number; end: number } {
  const start = headingIndex + 1;
  let end = start;
  while (end < content.length && content[end]?.type !== "heading") end += 1;
  return { start, end };
}

function ensureCleaningHeadingAndIntro(
  doc: JSONContent,
  ordinal: number
): JSONContent {
  const content = [...(doc.content ?? [])];
  let hIndex = content.findIndex((node) =>
    headingMatchesTitle(node, CLEANING_OPERATION_TITLE)
  );
  if (hIndex < 0 && hasCleaningParameterTable(doc)) {
    let tableIdx = content.findIndex(
      (node) => node.type === "table" && groupedCleaningHeaders(node)
    );
    if (tableIdx >= 0) {
      while (tableIdx > 0) {
        const prev = content[tableIdx - 1];
        if (
          prev?.type === "paragraph" &&
          isLeftoverCleaningIntro(paragraphPlain(prev))
        ) {
          content.splice(tableIdx - 1, 1);
          tableIdx -= 1;
          continue;
        }
        break;
      }
      content.splice(
        tableIdx,
        0,
        heading(3, `15.${ordinal}.4 Cleaning operation results summary`)
      );
    }
  }
  hIndex = content.findIndex((node) =>
    headingMatchesTitle(node, CLEANING_OPERATION_TITLE)
  );
  if (hIndex < 0) return doc;
  const { start, end } = sectionRangeAfter(content, hIndex);
  const section = content.slice(start, end);
  const kept = section.filter((node) => {
    if (node.type !== "paragraph") return true;
    const plain = paragraphPlain(node);
    if (!plain) return true;
    return !isLeftoverCleaningIntro(plain);
  });
  const intros = CVP_CLEANING_OPERATION_INTRO_SEEDS.filter(
    (seed) =>
      !kept.some(
        (node) => node.type === "paragraph" && paragraphPlain(node) === seed
      )
  ).map((text) => textParagraph(text));
  const tableIdx = kept.findIndex((node) => node.type === "table");
  const rebuilt =
    tableIdx >= 0
      ? [...kept.slice(0, tableIdx), ...intros, ...kept.slice(tableIdx)]
      : [...intros, ...kept];
  const same =
    intros.length === 0 &&
    rebuilt.length === section.length &&
    rebuilt.every((node, i) => node === section[i]);
  if (same) return doc;
  content.splice(start, end - start, ...rebuilt);
  return { ...doc, content };
}

function ensureVisualIntro(doc: JSONContent): JSONContent {
  const content = [...(doc.content ?? [])];
  const hIndex = content.findIndex((node) =>
    headingMatchesTitle(node, VISUAL_TITLE)
  );
  if (hIndex < 0) return doc;
  const next = content[hIndex + 1];
  const nextPlain = next?.type === "paragraph" ? paragraphPlain(next) : "";
  if (nextPlain.startsWith(CVP_VISUAL_INSPECTION_INTRO_SEED.slice(0, 80))) {
    return doc;
  }
  if (next?.type === "paragraph" && isLeftoverVisualIntro(nextPlain)) {
    content[hIndex + 1] = textParagraph(CVP_VISUAL_INSPECTION_INTRO_SEED);
    return { ...doc, content };
  }
  content.splice(
    hIndex + 1,
    0,
    textParagraph(CVP_VISUAL_INSPECTION_INTRO_SEED)
  );
  return { ...doc, content };
}

function restFromOutlineNumber(number: string): string {
  return number.replace(/^15\.1\./, "");
}

function retitleHeadingsToOutline(
  doc: JSONContent,
  ordinal: number
): JSONContent {
  let changed = false;
  const content = (doc.content ?? []).map((node) => {
    if (node.type !== "heading") return node;
    const text = headingText(node);
    const title = headingTitle(text);
    if (!title) return node;
    const level = Number(node.attrs?.level);
    let rest: string | null = null;
    if (level === 4) {
      const hit = CVP_EQUIPMENT_H4_OUTLINE.find(
        (item) => item.title.toLowerCase() === title.toLowerCase()
      );
      if (hit) rest = restFromOutlineNumber(hit.number);
    } else if (level === 3) {
      const hit = CVP_EQUIPMENT_H3_OUTLINE.find(
        (item) => item.title.toLowerCase() === title.toLowerCase()
      );
      if (hit) rest = restFromOutlineNumber(hit.number);
      else if (RESIDUE_TITLE.test(title)) rest = "7";
    }
    if (!rest) return node;
    const wanted = `15.${ordinal}.${rest} ${title}`;
    if (wanted === text) return node;
    changed = true;
    return { ...node, content: [{ type: "text", text: wanted }] };
  });
  return changed ? { ...doc, content } : doc;
}

function replaceFirstTable(
  doc: JSONContent,
  match: (table: JSONContent) => boolean,
  nextTable: JSONContent
): JSONContent {
  let replaced = false;
  const content = (doc.content ?? []).map((node) => {
    if (replaced || node.type !== "table" || !match(node)) return node;
    replaced = true;
    return nextTable;
  });
  return replaced ? { ...doc, content } : doc;
}

function cleaningTable(type: CvpEquipmentType): JSONContent {
  const rows = cvpCleaningParameterRows(type);
  return groupedResultsTable(
    ["Cleaning Parameter", "Acceptance Criteria / Target"],
    rows.map(([parameter, target]) => [parameter, target, "", "", ""])
  );
}

function visualTable(): JSONContent {
  return cvpVisualInspectionTable();
}

function cleaningSectionNodes(
  type: CvpEquipmentType,
  ordinal: number
): JSONContent[] {
  return [
    heading(3, `15.${ordinal}.4 Cleaning operation results summary`),
    ...cleaningIntroNodes(),
    cleaningTable(type),
  ];
}

function visualSectionNodes(ordinal: number): JSONContent[] {
  return [
    heading(3, `15.${ordinal}.6 Visual inspection summary`),
    textParagraph(CVP_VISUAL_INSPECTION_INTRO_SEED),
    visualTable(),
  ];
}

function addCleaningSectionIfMissing(
  doc: JSONContent,
  type: CvpEquipmentType,
  ordinal: number
): JSONContent {
  const rows = cvpCleaningParameterRows(type);
  if (rows.length === 0) return doc;
  let next = doc;
  if (hasCleaningParameterTable(next)) {
    next = replaceFirstTable(
      next,
      (table) => cleaningTableReplaceable(table, type),
      cleaningTable(type)
    );
  } else if (hasHeading(next, CLEANING_OPERATION_TITLE)) {
    next = insertAfterHeading(next, CLEANING_OPERATION_TITLE, [
      cleaningTable(type),
    ]);
  } else {
    next = insertBeforeFirstHeading(
      next,
      INSERT_CLEANING_BEFORE,
      cleaningSectionNodes(type, ordinal)
    );
  }
  return ensureCleaningHeadingAndIntro(next, ordinal);
}

function addVisualSectionIfMissing(
  doc: JSONContent,
  ordinal: number
): JSONContent {
  let next = doc;
  if (hasVisualInspectionTable(next)) {
    next = replaceFirstTable(next, visualTableReplaceable, visualTable());
  } else if (hasHeading(next, VISUAL_TITLE)) {
    next = insertAfterHeading(next, VISUAL_TITLE, [visualTable()]);
  } else {
    next = insertBeforeFirstHeading(
      next,
      INSERT_VISUAL_BEFORE,
      visualSectionNodes(ordinal)
    );
  }
  return ensureVisualIntro(next);
}

function tableBodyIsEmpty(tableNode: JSONContent): boolean {
  return firstColumnNames(tableNode).length === 0;
}

function fillEmptySwabCatalogTables(
  doc: JSONContent,
  type: CvpEquipmentType
): JSONContent {
  const locations = cvpSwabLocations(type);
  const rationale = cvpSwabRationaleRows(type);
  let next = doc;
  if (locations.length > 0) {
    next = replaceFirstTable(
      next,
      (node) =>
        tableLooksLike(node, CVP_SWAB_LOCATION_HEADERS) && tableBodyIsEmpty(node),
      table(
        CVP_SWAB_LOCATION_HEADERS,
        locations.map((location) => [location.id, location.description])
      )
    );
  }
  if (rationale.length > 0) {
    next = replaceFirstTable(
      next,
      (node) =>
        tableLooksLike(node, CVP_SWAB_RATIONALE_HEADERS) &&
        tableBodyIsEmpty(node),
      table(
        CVP_SWAB_RATIONALE_HEADERS,
        rationale.map((row) => [
          row.id,
          row.description,
          row.rationale,
          row.samples,
        ])
      )
    );
  }
  return next;
}

function expandResidueSwabCatalog(
  doc: JSONContent,
  type: CvpEquipmentType
): JSONContent {
  if (cvpSwabLocations(type).length === 0) return doc;
  let changed = false;
  const content = (doc.content ?? []).map((node) => {
    if (node.type !== "table") return node;
    const next = expandStubCvpSwabRows(node, type);
    if (next !== node) changed = true;
    return next;
  });
  return changed ? { ...doc, content } : doc;
}

function addShellWallIfMissing(
  doc: JSONContent,
  type: CvpEquipmentType,
  ordinal: number
): JSONContent {
  if (!cvpHasShellWallCalc(type) || hasShellWallHeading(doc)) return doc;
  return insertAfterHeading(doc, WORST_CASE_TITLE, [
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
 * Does not write an Equipment type line back. A new box still gets that
 * line from its seed; deleting it stays deleted. Type then comes from the
 * heading.
 */
export function applyCvpEquipmentTypeRecipe(doc: JSONContent): JSONContent {
  if (!doc.content?.length || !isCvpEquipmentBox(doc)) return doc;
  const type = readCvpEquipmentType(doc);
  const ordinal = ordinalFromHeading(doc);
  let next = doc;
  next = addShellWallIfMissing(next, type, ordinal);
  next = addCleaningSectionIfMissing(next, type, ordinal);
  next = addVisualSectionIfMissing(next, ordinal);
  next = fillEmptySwabCatalogTables(next, type);
  next = expandResidueSwabCatalog(next, type);
  next = retitleHeadingsToOutline(next, ordinal);
  next = retitleResidueHeading(next, type, ordinal);
  return next;
}
