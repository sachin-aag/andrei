import type { JSONContent } from "@tiptap/core";
import {
  CVP_BATCH_EXECUTION_HEADERS,
  CVP_BATCH_LABELS,
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_DEVIATIONS_SEED,
  CVP_EVALUATION_SEEDS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_MANUFACTURING_AREA_HEADERS,
  CVP_NITROSAMINE_HEADERS,
  CVP_NITROSAMINE_INTRO_SEED,
  CVP_NITROSAMINE_LIMIT,
  CVP_OVERALL_CRITERIA_HEADERS,
  CVP_OVERALL_RESULTS_HEADERS,
  CVP_PGI_HEADERS,
  CVP_PGI_INTRO_SEED,
  CVP_PGI_LIMIT,
  CVP_PREVIOUS_CLEANING_OPERATION_HEADERS,
  CVP_PREVIOUS_EXTRANEOUS_RESULTS_HEADERS,
  CVP_PREVIOUS_MANUFACTURING_AREA_HEADERS,
  CVP_PREVIOUS_NITROSAMINE_HEADERS,
  CVP_PREVIOUS_OVERALL_RESULTS_HEADERS,
  CVP_PREVIOUS_PGI_HEADERS,
  CVP_PREVIOUS_PROCESS_LINE_HEADERS,
  CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS,
  CVP_PREVIOUS_VISUAL_INSPECTION_HEADERS,
  CVP_PROCESS_LINE_HEADERS,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_REVALIDATION_SEED,
  CVP_TABLE_SECTION_BOILERPLATE,
  CVP_VISUAL_INSPECTION_HEADERS,
  type CvpSectionKey,
} from "./sections";

const CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null };

const SEED_SWAPS: ReadonlyArray<readonly [string, string]> = [
  [
    "Preparation and review of the Cleaning Verification Protocol; verification of visual inspection and sampling; review of results and approval of the report.",
    "Preparation and review of the Cleaning Validation Protocol; verification of visual inspection and sampling; review of results and approval of the report.",
  ],
  [
    "Review and approval of the Cleaning Verification Protocol; technical support for equipment and process understanding.",
    "Review and approval of the Cleaning Validation Protocol; technical support for equipment and process understanding.",
  ],
  [
    "Approval of the Cleaning Verification Protocol and the cleaning verification report.",
    "Approval of the Cleaning Validation Protocol and the cleaning validation report.",
  ],
  ["Cleaning Verification Protocol", "Cleaning Validation Protocol"],
  [
    "This protocol applies to the cleaning verification activities for the manufacturing equipment listed below, used in the production of the named product / stage at the stated plant.",
    "This protocol applies to the cleaning validation activities for the manufacturing equipment listed below, used in the production of the named product / stage at the stated plant.",
  ],
  [
    "Prior to initiating cleaning verification, the following criteria, but not limited to, must be met to ensure process readiness and compliance with GMP requirements:",
    "Prior to initiating cleaning validation, the following criteria, but not limited to, must be met to ensure process readiness and compliance with GMP requirements:",
  ],
  [
    "Cleaning verification activities shall be performed in the following sequence for each cleaning run:",
    "Cleaning validation activities shall be performed in the following sequence for each of the three cleaning batches:",
  ],
  [
    "This section records the sampling plan and acceptance criteria for each product-contact equipment in the train, followed by nitrosamine and potential genotoxic impurity limits, process-line and manufacturing-area verification, and the overall results table. Result and observation fields stay blank until the cleaning verification report is written.",
    "This section records the sampling plan and acceptance criteria for each product-contact equipment in the train, followed by nitrosamine and potential genotoxic impurity limits, process-line and manufacturing-area validation, and the overall results table. Result and observation fields stay blank until the cleaning validation report is written. Record three consecutive cleaning batches in the batch execution summary and in the Batch columns of the result tables.",
  ],
  [
    "The rinse samples collected from the equipment after completion of the cleaning procedure shall be analyzed for nitrosamine impurities to verify the effectiveness of the cleaning process and to ensure that nitrosamine residues, if any, are controlled within the predefined acceptance criteria. The rinse samples shall be evaluated for NDMA, NMBA, NDEA, NEIPA, NDIPA, NMPA, and NDBA. The acceptance criterion for each nitrosamine impurity is Not More Than (NMT) [limit] in the rinse sample. Compliance with the specified limits demonstrates the adequacy of the cleaning procedure in controlling nitrosamine contamination and minimizing the risk of cross-contamination.",
    CVP_NITROSAMINE_INTRO_SEED,
  ],
  [
    "The rinse samples collected from the equipment following completion of the cleaning procedure shall be analyzed for potential genotoxic impurities (PGIs) to verify the effectiveness of the cleaning process and to ensure that any residual PGIs are controlled within the established acceptance criteria. The rinse samples shall be evaluated for O-Nitro Toluene, P-Nitro Toluene, and Mesityl Oxide. The acceptance criterion for each PGI is Not More Than (NMT) [limit] in the rinse sample. Compliance with the specified limits demonstrates the adequacy of the cleaning procedure in reducing potential genotoxic impurities to acceptable levels and minimizing the risk of cross-contamination in subsequent product manufacture.",
    CVP_PGI_INTRO_SEED,
  ],
  [
    "The following table summarizes the sampling locations and results for [analyte] residue analysis during the cleaning verification study. Results from the verification run shall be compared against the established acceptance criterion of NMT [limit].",
    "The following table summarizes the sampling locations and results for [analyte] residue analysis during the three consecutive cleaning validation batches. Results from each batch shall be compared against the established acceptance criterion of NMT [limit].",
  ],
  [
    "As part of the cleaning verification study, final rinse samples shall be evaluated for extraneous matter to confirm that the cleaning process effectively removes visible foreign contaminants from product-contact surfaces. The examination shall include assessment for black particles, fibers, and other extraneous matter. The results shall be evaluated against the acceptance criterion that no black or fiber particles are observed in the rinse samples.",
    "As part of the cleaning validation study, final rinse samples from each of the three consecutive batches shall be evaluated for extraneous matter to confirm that the cleaning process effectively removes visible foreign contaminants from product-contact surfaces. The examination shall include assessment for black particles, fibers, and other extraneous matter. The results shall be evaluated against the acceptance criterion that no black or fiber particles are observed in the rinse samples.",
  ],
  [
    "It shall be written in the cleaning verification report.",
    "It shall be written in the cleaning validation report.",
  ],
  [
    "The cleaning procedure shall be considered verified when all cleaning results comply with the visual inspection, swab, rinse, extraneous matter, pH (wherever applicable), nitrosamine, and potential genotoxic impurities acceptance criteria defined in this protocol.",
    CVP_EVALUATION_SEEDS[0],
  ],
  [
    "The cleaning procedure shall be considered validated when three consecutive cleaning batches each comply with the visual inspection, swab, rinse, extraneous matter, pH (wherever applicable), nitrosamine, and potential genotoxic impurities acceptance criteria defined in this protocol. A failed batch shall be investigated, and the count of consecutive batches restarts unless the investigation justifies otherwise.",
    CVP_EVALUATION_SEEDS[0],
  ],
  [
    "Any result exceeding the acceptance criteria shall be investigated as per the OOS / deviation SOP. The equipment shall be re-cleaned and re-sampled, and the run shall not be counted as a successful run unless the investigation justifies it.",
    CVP_EVALUATION_SEEDS[2],
  ],
  [
    "Any result exceeding the acceptance criteria shall be investigated as per the OOS / deviation SOP. The equipment shall be re-cleaned and re-sampled, and the batch shall not be counted as a successful batch unless the investigation justifies it.",
    CVP_EVALUATION_SEEDS[2],
  ],
  [
    "Any deviation observed during execution of this protocol shall be recorded, investigated and closed as per the deviation management SOP, with an impact assessment on the effectiveness of the cleaning procedure and appropriate CAPA where required.",
    CVP_DEVIATIONS_SEED,
  ],
  [
    "Revalidation of the cleaning procedure shall be performed whenever changes occur that may impact the effectiveness of the validated cleaning process. Such changes include, but are not limited to, modifications to cleaning procedures, equipment, product mix, batch size, cleaning agents, or sampling / analytical methods. Copy the site SOP number for revalidation from a cited page when it is named.",
    CVP_REVALIDATION_SEED,
  ],
  [
    "A cleaning verification report shall be prepared including the cleaning records, sampling details, analytical results with chromatograms, deviations, conclusion and recommendations, and shall be approved by QA.",
    "A cleaning validation report shall be prepared including the cleaning records, sampling details, analytical results with chromatograms, deviations, conclusion and recommendations, and shall be approved by QA.",
  ],
  [
    "Result fields are intentionally left blank for recording during report finalization. List each equipment ID. Write NA only where a test does not apply to that item. A second table holds the protocol’s overall acceptance criteria.",
    "Result fields are intentionally left blank for recording during report finalization. List each equipment ID with one row per batch (Batch 1, Batch 2, Batch 3). Write NA only where a test does not apply to that item. A second table holds the protocol’s overall acceptance criteria.",
  ],
  [
    "Swab sampling using swab cloth: Use a new swab cloth (4 × 4 inches). Wear fresh gloves and do not touch the cloth directly. Immerse the cloth in the sample bottle containing the stated volume of cleaning-verification solvent, squeeze to remove excess solvent, and wipe the designated location with overlapping horizontal then vertical strokes. Place the used cloth back into the sample bottle.",
    "Swab sampling using swab cloth: Use a new swab cloth (4 × 4 inches). Wear fresh gloves and do not touch the cloth directly. Immerse the cloth in the sample bottle containing the stated volume of cleaning-validation solvent, squeeze to remove excess solvent, and wipe the designated location with overlapping horizontal then vertical strokes. Place the used cloth back into the sample bottle.",
  ],
];

const SEED_SWAP_MAP = new Map(SEED_SWAPS);

type SplitLastSpec = {
  oldHeaders: readonly string[];
  newHeaders: readonly string[];
};

type InsertBatchSpec = {
  oldHeaders: readonly string[];
  newHeaders: readonly string[];
  batchIndex: number;
};

const SPLIT_LAST: readonly SplitLastSpec[] = [
  {
    oldHeaders: CVP_PREVIOUS_CLEANING_OPERATION_HEADERS,
    newHeaders: CVP_CLEANING_OPERATION_HEADERS,
  },
  {
    oldHeaders: CVP_PREVIOUS_VISUAL_INSPECTION_HEADERS,
    newHeaders: CVP_VISUAL_INSPECTION_HEADERS,
  },
  {
    oldHeaders: CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS,
    newHeaders: CVP_RESIDUE_RESULTS_HEADERS,
  },
  {
    oldHeaders: CVP_PREVIOUS_EXTRANEOUS_RESULTS_HEADERS,
    newHeaders: CVP_EXTRANEOUS_RESULTS_HEADERS,
  },
];

const INSERT_BATCH: readonly InsertBatchSpec[] = [
  {
    oldHeaders: CVP_PREVIOUS_NITROSAMINE_HEADERS,
    newHeaders: CVP_NITROSAMINE_HEADERS,
    batchIndex: 2,
  },
  {
    oldHeaders: CVP_PREVIOUS_PGI_HEADERS,
    newHeaders: CVP_PGI_HEADERS,
    batchIndex: 2,
  },
  {
    oldHeaders: CVP_PREVIOUS_PROCESS_LINE_HEADERS,
    newHeaders: CVP_PROCESS_LINE_HEADERS,
    batchIndex: 1,
  },
  {
    oldHeaders: CVP_PREVIOUS_MANUFACTURING_AREA_HEADERS,
    newHeaders: CVP_MANUFACTURING_AREA_HEADERS,
    batchIndex: 1,
  },
  {
    oldHeaders: CVP_PREVIOUS_OVERALL_RESULTS_HEADERS,
    newHeaders: CVP_OVERALL_RESULTS_HEADERS,
    batchIndex: 2,
  },
];

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
  return (
    headersMatch(labels, CVP_RESIDUE_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_EXTRANEOUS_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_EXTRANEOUS_RESULTS_HEADERS)
  );
}

function batchColumnStart(labels: readonly string[]): number {
  const idx = labels.findIndex((label) => BATCH_HEADER_LABEL.test(label));
  return idx >= 0 ? idx : Math.max(1, labels.length - 1);
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
 */
export function placeCvpAnalyticalFooter(table: JSONContent): JSONContent {
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const aligned = unboldCvpBatchHeaders(table);
  if (!isAnalyticalFooterTable(labels)) return aligned;
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

function rowHasContent(cells: JSONContent[]): boolean {
  return cells.some((cell) => cellPlain(cell).length > 0);
}

function splitLastColumn(table: JSONContent, spec: SplitLastSpec): JSONContent {
  const rows = table.content ?? [];
  const header = rows[0];
  if (!header) return table;
  const oldCells = padCells(
    (header.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    ),
    spec.oldHeaders.length,
    "tableHeader"
  );
  const newHeader: JSONContent = {
    ...header,
    type: "tableRow",
    content: spec.newHeaders.map((label, i) => {
      if (i < spec.oldHeaders.length - 1) {
        return cloneCellWithText(
          { ...oldCells[i]!, type: "tableHeader" },
          label
        );
      }
      return makeCell("tableHeader", label);
    }),
  };
  const body = rows.slice(1).map((row) => {
    const cells = padCells(
      (row.content ?? []).filter(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      ),
      spec.oldHeaders.length,
      "tableCell"
    );
    const kept = cells.slice(0, spec.oldHeaders.length - 1).map((cell) => ({
      ...cell,
      type: "tableCell" as const,
    }));
    const last = cells[spec.oldHeaders.length - 1];
    return {
      ...row,
      type: "tableRow" as const,
      content: [
        ...kept,
        last ? { ...last, type: "tableCell" } : makeCell("tableCell", ""),
        emptyLike(last),
        emptyLike(last),
      ],
    };
  });
  return { ...table, content: [newHeader, ...body] };
}

function insertBatchColumn(table: JSONContent, spec: InsertBatchSpec): JSONContent {
  const rows = table.content ?? [];
  const header = rows[0];
  if (!header) return table;
  const oldHeaderCells = padCells(
    (header.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    ),
    spec.oldHeaders.length,
    "tableHeader"
  );
  const newHeader: JSONContent = {
    ...header,
    type: "tableRow",
    content: spec.newHeaders.map((label, i) => {
      if (i < spec.batchIndex) {
        return cloneCellWithText(
          { ...oldHeaderCells[i]!, type: "tableHeader" },
          label
        );
      }
      if (i === spec.batchIndex) return makeCell("tableHeader", label);
      return cloneCellWithText(
        { ...oldHeaderCells[i - 1]!, type: "tableHeader" },
        label
      );
    }),
  };

  const body: JSONContent[] = [];
  for (const row of rows.slice(1)) {
    const cells = padCells(
      (row.content ?? []).filter(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      ),
      spec.oldHeaders.length,
      "tableCell"
    ).map((cell) => ({ ...cell, type: "tableCell" as const }));

    const withBatch = (label: string): JSONContent => ({
      ...row,
      type: "tableRow",
      content: [
        ...cells.slice(0, spec.batchIndex),
        makeCell("tableCell", label),
        ...cells.slice(spec.batchIndex),
      ],
    });

    if (isLimitNmtRow(cells)) {
      body.push(withBatch(""));
      continue;
    }
    if (!rowHasContent(cells)) {
      body.push(withBatch(""));
      continue;
    }
    for (const label of CVP_BATCH_LABELS) {
      body.push(withBatch(label));
    }
  }
  return { ...table, content: [newHeader, ...body] };
}

function appendNumberOfBatchesRow(table: JSONContent): JSONContent {
  const rows = table.content ?? [];
  const header = rows[0];
  if (!header || !headersMatch(headerLabels(header), CVP_OVERALL_CRITERIA_HEADERS)) {
    return table;
  }
  const already = rows.slice(1).some((row) => {
    const first = (row.content ?? []).find(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    if (!first) return false;
    return /^number of batches$/i.test(cellPlain(first));
  });
  if (already) return table;
  return {
    ...table,
    content: [
      ...rows,
      {
        type: "tableRow",
        content: [
          makeCell("tableCell", "Number of batches"),
          makeCell("tableCell", "Three consecutive batches complying"),
        ],
      },
    ],
  };
}

function upgradeTable(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  let next = table;
  let widened = false;
  for (const spec of SPLIT_LAST) {
    if (headersMatch(labels, spec.newHeaders)) {
      widened = true;
      break;
    }
    if (headersMatch(labels, spec.oldHeaders)) {
      next = splitLastColumn(table, spec);
      widened = true;
      break;
    }
  }
  if (!widened) {
    for (const spec of INSERT_BATCH) {
      if (headersMatch(labels, spec.newHeaders)) {
        widened = true;
        break;
      }
      if (headersMatch(labels, spec.oldHeaders)) {
        next = insertBatchColumn(table, spec);
        widened = true;
        break;
      }
    }
  }
  if (!widened) next = appendNumberOfBatchesRow(table);
  return applyCvpTemplateImpurityLimits(placeCvpAnalyticalFooter(next));
}

/**
 * Nitrosamine Limit NMT cells are 0.1 ppm and PGI Limit NMT cells are
 * 0.2 ppm, the same value in every impurity column. This pass overwrites
 * those cells, including a previously filled number.
 */
function applyCvpTemplateImpurityLimits(table: JSONContent): JSONContent {
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const limit = headersMatch(labels, CVP_NITROSAMINE_HEADERS)
    ? CVP_NITROSAMINE_LIMIT
    : headersMatch(labels, CVP_PREVIOUS_NITROSAMINE_HEADERS)
      ? CVP_NITROSAMINE_LIMIT
      : headersMatch(labels, CVP_PGI_HEADERS)
        ? CVP_PGI_LIMIT
        : headersMatch(labels, CVP_PREVIOUS_PGI_HEADERS)
          ? CVP_PGI_LIMIT
          : null;
  if (!limit) return table;
  const batch = labels.findIndex((label) => /^batch$/i.test(label));
  const impurityStart = batch >= 0 ? batch + 1 : 2;
  let changed = false;
  const content = rows.map((row, index) => {
    if (index === 0 || row.type !== "tableRow") return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    if (!/^limit\b/i.test(cellPlain(cells[0]))) return row;
    let rowChanged = false;
    const nextCells = cells.map((cell, i) => {
      if (i < impurityStart) return cell;
      if (cellPlain(cell) === limit) return cell;
      rowChanged = true;
      return cloneCellWithText(cell, limit);
    });
    if (!rowChanged) return row;
    changed = true;
    return { ...row, content: nextCells };
  });
  return changed ? { ...table, content } : table;
}

/**
 * Widen pre-validation result tables to Batch 1 / 2 / 3 (or a Batch
 * discriminator column). Idempotent when headers already match the new shape.
 */
export function upgradeCvpCycleTables(doc: JSONContent): JSONContent {
  if (!doc.content) return doc;
  let changed = false;
  const content = doc.content.map((node) => {
    if (node.type !== "table") return node;
    const next = upgradeTable(node);
    if (next !== node) changed = true;
    return next;
  });
  return changed ? { ...doc, content } : doc;
}

function replaceNodeText(node: JSONContent, text: string): JSONContent {
  if (node.type === "text") {
    return { ...node, text };
  }
  const firstText = (node.content ?? []).find((child) => child.type === "text");
  const marks = firstText?.marks;
  if (node.type === "paragraph" || node.type === "heading") {
    return {
      ...node,
      content: text
        ? [
            marks
              ? { type: "text", text, marks }
              : { type: "text", text },
          ]
        : [],
    };
  }
  if (node.type === "tableCell" || node.type === "tableHeader") {
    return {
      ...node,
      content: [textParagraph(text, Boolean(marks?.some((m) => m.type === "bold")))],
    };
  }
  return node;
}

function swapNode(node: JSONContent): JSONContent {
  if (
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "tableCell" ||
    node.type === "tableHeader" ||
    node.type === "text"
  ) {
    const plain =
      node.type === "text" ? (node.text ?? "") : nodePlain(node).replace(/\s+/g, " ").trim();
    const next = SEED_SWAP_MAP.get(plain);
    if (next) return replaceNodeText(node, next);
    if (node.type === "text") return node;
  }
  if (!node.content) return node;
  let changed = false;
  const content = node.content.map((child) => {
    const next = swapNode(child);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, content } : node;
}

/** Replace a paragraph or cell only when it still matches the old seed exactly. */
export function swapCvpValidationSeedText(doc: JSONContent): JSONContent {
  return swapNode(doc);
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
  const intros = CVP_TABLE_SECTION_BOILERPLATE[key as CvpSectionKey];
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

/** Sampling plan (15.0): add the three-row Batch 1/2/3 execution table if missing. */
export function ensureCvpBatchExecutionTable(doc: JSONContent): JSONContent {
  if (hasBatchExecutionTable(doc)) return doc;
  const table: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: CVP_BATCH_EXECUTION_HEADERS.map((h) => makeCell("tableHeader", h)),
      },
      ...CVP_BATCH_LABELS.map((label) => ({
        type: "tableRow" as const,
        content: [
          makeCell("tableCell", label),
          makeCell("tableCell", ""),
          makeCell("tableCell", ""),
          makeCell("tableCell", ""),
          makeCell("tableCell", ""),
          makeCell("tableCell", ""),
        ],
      })),
    ],
  };
  return { ...doc, content: [...(doc.content ?? []), table] };
}

export function upgradeCvpValidationDoc(doc: JSONContent): JSONContent {
  return swapCvpValidationSeedText(upgradeCvpCycleTables(doc));
}
