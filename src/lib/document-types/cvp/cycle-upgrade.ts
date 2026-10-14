import type { JSONContent } from "@tiptap/core";
import {
  CVP_BATCH_EXECUTION_HEADERS,
  CVP_BATCH_LABELS,
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_DEVIATIONS_SEED,
  CVP_EQUIPMENT_DETAILS_SEED,
  CVP_EVALUATION_SEEDS,
  CVP_EXTRANEOUS_LIMIT,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_HISTORY_HEADERS,
  CVP_MANUFACTURING_AREA_HEADERS,
  CVP_MANUFACTURING_AREA_LEADING_HEADERS,
  CVP_MANUFACTURING_AREA_LIMIT,
  CVP_NITROSAMINE_HEADERS,
  CVP_NITROSAMINE_INTRO_SEED,
  CVP_NITROSAMINE_LIMIT,
  CVP_OVERALL_CRITERIA_HEADERS,
  CVP_OVERALL_RESULTS_HEADERS,
  CVP_PGI_HEADERS,
  CVP_PGI_INTRO_SEED,
  CVP_PGI_LIMIT,
  CVP_PREVIOUS_BATCH_MANUFACTURING_AREA_HEADERS,
  CVP_PREVIOUS_BATCH_NITROSAMINE_HEADERS,
  CVP_PREVIOUS_BATCH_OVERALL_RESULTS_HEADERS,
  CVP_PREVIOUS_BATCH_RESIDUE_RESULTS_HEADERS,
  CVP_PREVIOUS_CLEANING_OPERATION_HEADERS,
  CVP_PREVIOUS_EQUIPMENT_DETAILS_SEEDS,
  CVP_PREVIOUS_EXTRANEOUS_RESULTS_HEADERS,
  CVP_PREVIOUS_HISTORY_HEADERS,
  CVP_PREVIOUS_MANUFACTURING_AREA_HEADERS,
  CVP_PREVIOUS_NITROSAMINE_HEADERS,
  CVP_PREVIOUS_NITROSAMINE_INTRO_SEED,
  CVP_PREVIOUS_NITROSAMINE_LIMIT,
  CVP_PREVIOUS_OVERALL_RESULTS_HEADERS,
  CVP_PREVIOUS_PGI_HEADERS,
  CVP_PREVIOUS_PROCESS_LINE_HEADERS,
  CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS,
  CVP_PREVIOUS_TESTING_HEADERS,
  CVP_PREVIOUS_VISUAL_INSPECTION_HEADERS,
  CVP_PREVIOUS_VISUAL_INSPECTION_INTRO_SEED,
  CVP_PROCESS_LINE_HEADERS,
  CVP_RESIDUE_LOD,
  CVP_RESIDUE_LOQ,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_REVALIDATION_SEED,
  CVP_SWAB_LIMIT,
  CVP_TABLE_SECTION_BOILERPLATE,
  CVP_VISUAL_INSPECTION_INTRO_SEED,
  CVP_METHODOLOGY_INTRO_SEED,
  CVP_PREREQUISITES_INTRO_SEED,
  CVP_TESTING_HEADERS,
  CVP_VISUAL_INSPECTION_HEADERS,
  CVP_VISUAL_INSPECTION_ROWS,
  groupedResultsTable,
  type CvpPersistableSectionKey,
} from "./sections";
import {
  cvpReactorShellMeasurements,
  cvpSwabLocations,
  type CvpEquipmentType,
} from "./equipment-types";

const CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null };

const SEED_SWAPS: ReadonlyArray<readonly [string, string]> = [
  ...CVP_PREVIOUS_EQUIPMENT_DETAILS_SEEDS.map(
    (old) => [old, CVP_EQUIPMENT_DETAILS_SEED] as const
  ),
  [
    CVP_PREVIOUS_VISUAL_INSPECTION_INTRO_SEED,
    CVP_VISUAL_INSPECTION_INTRO_SEED,
  ],
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
    CVP_PREREQUISITES_INTRO_SEED,
  ],
  [
    "Prior to initiating cleaning verification activities, the following pre-requisites must be met to ensure process readiness, data integrity, and compliance with cGMP requirements:",
    CVP_PREREQUISITES_INTRO_SEED,
  ],
  [
    "Cleaning verification activities shall be performed in the following sequence for each cleaning run:",
    CVP_METHODOLOGY_INTRO_SEED,
  ],
  [
    "Cleaning validation activities shall be performed in the following sequence for each of the three cleaning batches:",
    CVP_METHODOLOGY_INTRO_SEED,
  ],
  [
    "Prior to initiating cleaning validation, the following criteria, but not limited to, must be met to ensure process readiness and compliance with GMP requirements:",
    CVP_PREREQUISITES_INTRO_SEED,
  ],
  [
    "This section records the sampling plan and acceptance criteria for each product-contact equipment in the train, followed by nitrosamine and potential genotoxic impurity limits, process-line and manufacturing-area verification, and the overall results table. Result and observation fields stay blank until the cleaning verification report is written.",
    "This section records the sampling plan and acceptance criteria for each product-contact equipment in the train, followed by nitrosamine limits, manufacturing-area cleaning verification, testing through revalidation, overall results, and recommendations. Result and observation fields stay blank until the cleaning validation report is written.",
  ],
  [
    "This section records the sampling plan and acceptance criteria for each product-contact equipment in the train, followed by nitrosamine and potential genotoxic impurity limits, process-line and manufacturing-area validation, and the overall results table. Result and observation fields stay blank until the cleaning validation report is written. Record three consecutive cleaning batches in the batch execution summary and in the Batch columns of the result tables.",
    "This section records the sampling plan and acceptance criteria for each product-contact equipment in the train, followed by nitrosamine limits, manufacturing-area cleaning verification, testing through revalidation, overall results, and recommendations. Result and observation fields stay blank until the cleaning validation report is written.",
  ],
  [
    "The rinse samples collected from the equipment after completion of the cleaning procedure shall be analyzed for nitrosamine impurities to verify the effectiveness of the cleaning process and to ensure that nitrosamine residues, if any, are controlled within the predefined acceptance criteria. The rinse samples shall be evaluated for NDMA, NMBA, NDEA, NEIPA, NDIPA, NMPA, and NDBA. The acceptance criterion for each nitrosamine impurity is Not More Than (NMT) [limit] in the rinse sample. Compliance with the specified limits demonstrates the adequacy of the cleaning procedure in controlling nitrosamine contamination and minimizing the risk of cross-contamination.",
    CVP_NITROSAMINE_INTRO_SEED,
  ],
  [
    CVP_PREVIOUS_NITROSAMINE_INTRO_SEED,
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
    "Result fields are intentionally left blank for recording during report finalization. List each equipment ID on one row, plus a Manufacturing Areas row. Write NA only where a test does not apply to that item.",
  ],
  [
    "Result fields are intentionally left blank for recording during report finalization. List each equipment ID with one row per batch (Batch 1, Batch 2, Batch 3). Write NA only where a test does not apply to that item. A second table holds the protocol’s overall acceptance criteria.",
    "Result fields are intentionally left blank for recording during report finalization. List each equipment ID on one row, plus a Manufacturing Areas row. Write NA only where a test does not apply to that item.",
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
    newHeaders: CVP_PREVIOUS_BATCH_MANUFACTURING_AREA_HEADERS,
    batchIndex: 1,
  },
  {
    oldHeaders: CVP_PREVIOUS_OVERALL_RESULTS_HEADERS,
    newHeaders: CVP_PREVIOUS_BATCH_OVERALL_RESULTS_HEADERS,
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
  if (
    headersMatch(labels, CVP_RESIDUE_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_EXTRANEOUS_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_EXTRANEOUS_RESULTS_HEADERS)
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
    const split = [
      ...kept,
      last ? { ...last, type: "tableCell" as const } : makeCell("tableCell", ""),
    ];
    while (split.length < spec.newHeaders.length) {
      split.push(emptyLike(last));
    }
    return {
      ...row,
      type: "tableRow" as const,
      content: split.slice(0, spec.newHeaders.length),
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

function flattenGroupedVisualInspection(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!/^sample description/i.test(labels[0] ?? "")) return table;
  if (labels.some((label) => /sample id/i.test(label))) return table;
  if (labels.some((label) => /^limit$/i.test(normHeader(label)))) return table;
  if (!isGroupedResultsTable(table)) return table;
  const rows = (table.content ?? []).filter((row) => row.type === "tableRow");
  const body = rows.slice(2).map((row) => {
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    return [
      cellPlain(cells[0]),
      cellPlain(cells[1]),
      cellPlain(cells[2]),
      cellPlain(cells[3]),
    ];
  });
  const data = body.length > 0 ? body : [...CVP_VISUAL_INSPECTION_ROWS];
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: CVP_VISUAL_INSPECTION_HEADERS.map((label) =>
          makeCell("tableHeader", label)
        ),
      },
      ...data.map((row) => ({
        type: "tableRow" as const,
        content: CVP_VISUAL_INSPECTION_HEADERS.map((_, i) =>
          makeCell("tableCell", row[i] ?? "")
        ),
      })),
    ],
  };
}

function upgradeTable(table: JSONContent): JSONContent {
  const flattened = flattenGroupedVisualInspection(table);
  const withLimit = insertSampleLimitColumn(flattened);
  const labels = headerLabels(withLimit.content?.[0]);
  let next =
    withLimit !== flattened
      ? placeLoqLodInResults(withLimit, { fillEmptyResultsFromSiblings: true })
      : withLimit;
  let widened = false;
  let justMigrated = false;
  for (const spec of SPLIT_LAST) {
    if (headersMatch(labels, spec.newHeaders)) {
      widened = true;
      break;
    }
    if (headersMatch(labels, spec.oldHeaders)) {
      next = splitLastColumn(next, spec);
      widened = true;
      justMigrated = true;
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
        next = insertBatchColumn(next, spec);
        widened = true;
        justMigrated = true;
        break;
      }
    }
  }
  if (!widened) next = appendNumberOfBatchesRow(next);
  next = placeCvpAnalyticalFooter(next, { relocateCriteria: justMigrated });
  next = promoteAndDropLimitRow(next);
  return applyCvpTemplateImpurityLimits(next);
}

/**
 * Nitrosamine Limit NMT cells that still show the old 0.1 ppm seed become
 * 0.01 ppm. A number the engineer already changed is left as stored.
 */
function applyCvpTemplateImpurityLimits(table: JSONContent): JSONContent {
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const nitrosamine =
    headersMatch(labels, CVP_NITROSAMINE_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_NITROSAMINE_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_BATCH_NITROSAMINE_HEADERS);
  const pgi =
    headersMatch(labels, CVP_PGI_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_PGI_HEADERS);
  if (!nitrosamine && !pgi) return table;
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
      const current = cellPlain(cell);
      if (nitrosamine) {
        const previousSeed =
          current === "" ||
          current === CVP_PREVIOUS_NITROSAMINE_LIMIT ||
          /^0\.1(?:\s*ppm)?$/i.test(current);
        if (current === CVP_NITROSAMINE_LIMIT || !previousSeed) {
          return cell;
        }
        rowChanged = true;
        return cloneCellWithText(cell, CVP_NITROSAMINE_LIMIT);
      }
      if (current === "" || current === CVP_PGI_LIMIT) return cell;
      return cell;
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

function tableExecutionEmpty(table: JSONContent): boolean {
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const skip = new Set(
    [
      CVP_SWAB_LIMIT,
      CVP_RESIDUE_LOQ,
      CVP_RESIDUE_LOD,
      CVP_MANUFACTURING_AREA_LIMIT,
      CVP_NITROSAMINE_LIMIT,
      CVP_PREVIOUS_NITROSAMINE_LIMIT,
      "1 ppm",
      "0.3 ppm",
      "NA",
    ].map((s) => s.toLowerCase())
  );
  for (const row of rows.slice(1)) {
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    if (ANALYTICAL_FOOTER_LABEL.test(cellPlain(cells[0]))) continue;
    for (let i = 1; i < cells.length; i++) {
      const text = cellPlain(cells[i]);
      if (!text) continue;
      if (skip.has(text.toLowerCase())) continue;
      if (/^nmt\s+/i.test(text)) continue;
      return false;
    }
  }
  void labels;
  return true;
}

function fillEmptyCell(
  cell: JSONContent,
  value: string
): { cell: JSONContent; changed: boolean } {
  if (cellPlain(cell).length > 0) return { cell, changed: false };
  return { cell: cloneCellWithText(cell, value), changed: true };
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

function sampleIdHeaderIndex(labels: readonly string[]): number {
  return labels.findIndex((label) => normHeader(label).includes("sample id"));
}

function needsSampleLimitColumn(table: JSONContent): boolean {
  const labels = headerLabels(table.content?.[0]);
  if (labels.some((label) => /^limit$/.test(normHeader(label)))) return false;
  const grouped = isGroupedResultsTable(table);
  const batches = labels.filter((label) =>
    /^batch(?:\s+\d+)?$/.test(normHeader(label))
  ).length;
  if (!grouped && batches < 3) return false;
  const desc = labels.some((label) =>
    normHeader(label).includes("sample description")
  );
  const sampleId = sampleIdHeaderIndex(labels) >= 0;
  return (desc && sampleId) || isManufacturingAreaSampleTable(labels);
}

function limitInsertIndex(labels: readonly string[]): number {
  const testParam = labels.findIndex(
    (label) => normHeader(label) === "test parameter"
  );
  if (testParam >= 0) return testParam + 1;
  const sampled = labels.findIndex(
    (label) => normHeader(label) === "sampled area"
  );
  if (sampled >= 0) return sampled + 1;
  const sampleId = sampleIdHeaderIndex(labels);
  if (sampleId >= 0) return sampleId + 1;
  const results = labels.findIndex((label) =>
    /^results\b/.test(normHeader(label))
  );
  if (results >= 0) return results;
  const batch = labels.findIndex((label) =>
    /^batch(?:\s+\d+)?$/.test(normHeader(label))
  );
  return batch >= 0 ? batch : 2;
}

/** Copy an already-filled NMT / ppm figure into an empty Limit cell. */
function firstFilledResidueValue(
  cells: JSONContent[],
  limitCol: number
): string {
  for (let i = 0; i < cells.length; i++) {
    if (i === 0 || i === limitCol) continue;
    const text = cellPlain(cells[i]);
    if (!text || /^na$/i.test(text)) continue;
    if (!/\bnmt\b|\bppm\b/i.test(text)) continue;
    return text;
  }
  return "";
}

const INFERENCE_CONCLUSION_LABEL = /^(inference|conclusion):?$/i;
const INFERENCE_CONCLUSION_SHALL =
  "It shall be written in the cleaning validation report.";

function ensureCvpInferenceConclusionShall(doc: JSONContent): JSONContent {
  const nodes = doc.content ?? [];
  if (nodes.length === 0) return doc;
  const next: JSONContent[] = [];
  let changed = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    next.push(node);
    if (node.type !== "paragraph" && node.type !== "heading") continue;
    const plain = nodePlain(node).replace(/\s+/g, " ").trim();
    if (!INFERENCE_CONCLUSION_LABEL.test(plain)) continue;
    const following = nodes[i + 1];
    const followPlain = following
      ? nodePlain(following).replace(/\s+/g, " ").trim()
      : "";
    const followIsLabel =
      following != null &&
      (following.type === "paragraph" || following.type === "heading") &&
      INFERENCE_CONCLUSION_LABEL.test(followPlain);
    if (following?.type === "paragraph" && followPlain.length === 0) {
      next.push(textParagraph(INFERENCE_CONCLUSION_SHALL));
      i += 1;
      changed = true;
      continue;
    }
    if (!following || followIsLabel) {
      next.push(textParagraph(INFERENCE_CONCLUSION_SHALL));
      changed = true;
    }
  }
  return changed ? { ...doc, content: next } : doc;
}

function insertSampleLimitColumn(table: JSONContent): JSONContent {
  if (!needsSampleLimitColumn(table)) return table;
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  const grouped = isGroupedResultsTable(table);
  const insertAt = limitInsertIndex(labels);
  const content = rows.map((row, index) => {
    if (row.type !== "tableRow") return row;
    if (grouped && index === 1) return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    if (index === 0) {
      const limitHeader: JSONContent = {
        type: "tableHeader",
        attrs: { ...CELL_ATTRS, rowspan: grouped ? 2 : 1 },
        content: [textParagraph("Limit")],
      };
      return {
        ...row,
        content: [...cells.slice(0, insertAt), limitHeader, ...cells.slice(insertAt)],
      };
    }
    return {
      ...row,
      content: [
        ...cells.slice(0, insertAt),
        makeCell("tableCell", ""),
        ...cells.slice(insertAt),
      ],
    };
  });
  return { ...table, content };
}

function firstNonEmptyCellText(
  cells: JSONContent[],
  skip: ReadonlySet<number>
): string {
  for (let i = 0; i < cells.length; i++) {
    if (skip.has(i)) continue;
    const text = cellPlain(cells[i]);
    if (!text || /^na$/i.test(text)) continue;
    return text;
  }
  return "";
}

function isLimitRowLabel(text: string): boolean {
  return /^limit$/i.test(text);
}

function isLoqLodRowLabel(text: string): boolean {
  return /^(loq|lod)$/i.test(text);
}

function tableHasBlackAndFiber(table: JSONContent): boolean {
  return (table.content ?? []).some((row) =>
    (row.content ?? []).some((cell) => /black and fiber/i.test(cellPlain(cell)))
  );
}

function isExtraneousSampleTable(table: JSONContent): boolean {
  const labels = headerLabels(table.content?.[0]);
  if (isManufacturingAreaSampleTable(labels)) return false;
  const names = residueBodyNames(table);
  if (
    names.some(
      (name) =>
        /^(loq|lod)$/i.test(name) ||
        /swab/i.test(name) ||
        /reflux/i.test(name) ||
        /final rinse/i.test(name)
    )
  ) {
    return false;
  }
  return (
    names.some((name) => /^rinse sample$/i.test(name)) ||
    tableHasBlackAndFiber(table)
  );
}

function promoteAndDropLimitRow(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  const limitCol = residueLimitColumn(labels);
  if (limitCol < 0) return table;
  const grouped = isGroupedResultsTable(table);
  const rows = table.content ?? [];
  const bodyStart = grouped ? 2 : 1;
  const limitRowIndex = rows.findIndex((row, index) => {
    if (index < bodyStart || row.type !== "tableRow") return false;
    const first = cellPlain(
      (row.content ?? []).find(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      )
    );
    return isLimitRowLabel(first);
  });
  if (limitRowIndex < 0) return table;
  const limitCells = (rows[limitRowIndex]?.content ?? []).filter(
    (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
  );
  const criterion = firstNonEmptyCellText(
    limitCells,
    new Set([0, limitCol])
  );
  const content = rows.flatMap((row, index) => {
    if (index === limitRowIndex) return [];
    if (index < bodyStart || row.type !== "tableRow") return [row];
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const first = cellPlain(cells[0]);
    if (isLoqLodRowLabel(first) || !criterion) return [row];
    const limitCell = cells[limitCol];
    if (!limitCell || cellPlain(limitCell).length > 0) return [row];
    const next = cells.slice();
    next[limitCol] = cloneCellWithText(limitCell, criterion);
    return [{ ...row, content: next }];
  });
  return { ...table, content };
}

function fillEmptyResidueSeeds(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  const limitCol = residueLimitColumn(labels);
  if (limitCol < 0) return table;
  const residue = isResidueResultsTable(labels);
  const extraneous = isExtraneousSampleTable(table);
  if (!residue && !extraneous) return table;
  const grouped = isGroupedResultsTable(table);
  const names = residueBodyNames(table);
  const hasLocationRows = names.some(
    (name) =>
      !/^(swab samples|loq|lod|limit)$/i.test(name) &&
      !/rinse|reflux/i.test(name)
  );
  let changed = false;
  const content = (table.content ?? []).map((row, index) => {
    if (index === 0 || row.type !== "tableRow") return row;
    if (grouped && index === 1) return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const first = cellPlain(cells[0]);
    const limitCell = cells[limitCol];
    if (!limitCell) return row;
    if (isLimitRowLabel(first)) return row;
    if (/^swab samples$/i.test(first) && hasLocationRows) return row;
    let seed = "";
    if (isLoqLodRowLabel(first)) return row;
    if (extraneous) seed = CVP_EXTRANEOUS_LIMIT;
    else if (/^swab samples$/i.test(first) || /swab/i.test(first) || first === "") {
      seed = CVP_SWAB_LIMIT;
    }
    if (!seed) return row;
    const existing = firstFilledResidueValue(cells, limitCol);
    const filled = fillEmptyCell(limitCell, existing || seed);
    if (!filled.changed) return row;
    changed = true;
    const nextCells = cells.slice();
    nextCells[limitCol] = filled.cell;
    return { ...row, content: nextCells };
  });
  return changed ? { ...table, content } : table;
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

function expandStubReactorSwabRows(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!isResidueResultsTable(labels)) return table;
  const names = residueBodyNames(table);
  if (!names.some((name) => /reflux/i.test(name))) return table;
  return expandStubCvpSwabRows(table, "reactor");
}

function letteredSwabIds(text: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const match of text.matchAll(/S-\d+[a-d]/gi)) {
    const id = match[0].replace(/^s-/i, "S-").replace(/[a-d]$/i, (letter) =>
      letter.toLowerCase()
    );
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Any unicode dash, so S-8a–d and S-8a-d parse the same way. */
function normalizeDashes(text: string): string {
  return text.replace(/\p{Pd}/gu, "-");
}

function abbreviatedShellRange(text: string): boolean {
  return /S-\d+[a-d]\s*(?:-|to)\s*(?:S-\d+)?[a-d]/i.test(normalizeDashes(text));
}

/** S-8a–d, S-8a-d, S-8a to S-8d, or a comma list of lettered IDs. */
function expandShellIdList(text: string): string[] {
  const normalized = normalizeDashes(text);
  const seen = new Set<string>();
  const ids: string[] = [];
  const add = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  const range = /S-(\d+)([a-d])\s*(?:-|to)\s*(?:S-\d+)?([a-d])/gi;
  let ranged = false;
  for (const match of normalized.matchAll(range)) {
    ranged = true;
    const base = match[1];
    const start = match[2].toLowerCase().charCodeAt(0);
    const end = match[3].toLowerCase().charCodeAt(0);
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let code = lo; code <= hi; code++) {
      add(`S-${base}${String.fromCharCode(code)}`);
    }
  }
  if (!ranged) {
    for (const id of letteredSwabIds(normalized)) add(id);
  }
  return ids;
}

function groupedShellIds(
  cells: JSONContent[],
  sampleIdCol: number
): string[] {
  const sample = sampleIdCol >= 0 ? cellPlain(cells[sampleIdCol]) : "";
  const fromSample = shellIdsToSplit(sample);
  if (fromSample.length >= 2) return fromSample;
  // One sample ID is already one measurement. IDs named in the description
  // must not split that row again on the next load.
  if (letteredSwabIds(sample).length === 1) return [];
  const description = cellPlain(cells[0]);
  if (description.length > 160) return [];
  if (!/shell wall/i.test(description) && !/^S-\d/i.test(description)) {
    return [];
  }
  return shellIdsToSplit(description);
}

/** A two-ID pair such as sparkler S-4a & S-4b stays one row. A level range does not. */
function shellIdsToSplit(text: string): string[] {
  const ids = expandShellIdList(text);
  if (ids.length >= 3) return ids;
  if (ids.length >= 2 && abbreviatedShellRange(text)) return ids;
  return [];
}

function clonePlainCell(cell: JSONContent): JSONContent {
  return cloneCellWithText(cell, cellPlain(cell));
}

function residueSwabLimit(
  table: JSONContent,
  labels: readonly string[]
): string {
  const limitCol = residueLimitColumn(labels);
  if (limitCol < 0) return CVP_SWAB_LIMIT;
  const grouped = isGroupedResultsTable(table);
  const bodyStart = grouped ? 2 : 1;
  for (const row of (table.content ?? []).slice(bodyStart)) {
    if (row.type !== "tableRow") continue;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const text = cellPlain(cells[limitCol]);
    if (/\bnmt\b/i.test(text)) return text;
  }
  return CVP_SWAB_LIMIT;
}

/**
 * 15.N.7 lists one shell-wall swab per measurement. A level row that
 * packs S-8a–S-8d (and the same for S-9 / S-10) becomes four rows.
 * Reactor tables that already list a shell level, including a Final Rinse
 * row that does not say “reflux”, gain any of the 12 measurements still missing.
 */
function expandReactorShellMeasurementRows(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!isResidueResultsTable(labels)) return table;
  const grouped = isGroupedResultsTable(table);
  const bodyStart = grouped ? 2 : 1;
  const sampleIdCol = labels.findIndex((label) => /sample id/i.test(label));
  const measurements = cvpReactorShellMeasurements();
  const descriptionById = new Map(
    measurements.map((measurement) => [measurement.id, measurement.description])
  );
  let changed = false;
  const rows = table.content ?? [];
  const splitRows = rows.flatMap((row, index) => {
    if (index < bodyStart || row.type !== "tableRow") return [row];
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const first = cellPlain(cells[0]);
    if (isLoqLodRowLabel(first) || isLimitRowLabel(first)) return [row];
    const ids = groupedShellIds(cells, sampleIdCol);
    if (ids.length < 2) return [row];
    changed = true;
    return ids.map((id) => ({
      ...row,
      content: cells.map((cell, cellIndex) => {
        if (cellIndex === 0) {
          return makeCell(
            "tableCell",
            descriptionById.get(id) ??
              shellDescriptionWithoutIdList(cellPlain(cells[0]))
          );
        }
        if (cellIndex === sampleIdCol) return makeCell("tableCell", id);
        return clonePlainCell(cell);
      }),
    }));
  });

  const present = new Set<string>();
  for (const row of splitRows.slice(bodyStart)) {
    if (row.type !== "tableRow") continue;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const sample = sampleIdCol >= 0 ? cellPlain(cells[sampleIdCol]) : "";
    for (const id of letteredSwabIds(sample)) present.add(id);
    for (const id of letteredSwabIds(cellPlain(cells[0]))) present.add(id);
  }
  const hasReflux = splitRows.slice(bodyStart).some((row) => {
    if (row.type !== "tableRow") return false;
    const first = cellPlain(
      (row.content ?? []).find(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      )
    );
    return /reflux/i.test(first);
  });
  const hasReactorShell = splitRows.slice(bodyStart).some((row) => {
    if (row.type !== "tableRow") return false;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const first = cellPlain(cells[0]);
    if (!/shell wall\s+level\s*[1-3]/i.test(first)) return false;
    const sample = sampleIdCol >= 0 ? cellPlain(cells[sampleIdCol]) : "";
    return expandShellIdList(`${sample} ${first}`).some((id) =>
      /^S-(?:8|9|10)[a-d]$/.test(id)
    );
  });
  const missing =
    hasReflux || hasReactorShell
      ? measurements.filter((measurement) => !present.has(measurement.id))
      : [];
  if (missing.length === 0) {
    return changed ? { ...table, content: splitRows } : table;
  }
  const shaped = { ...table, content: splitRows };
  const colCount = residueColumnCount(shaped);
  const limitCol = residueLimitColumn(labels);
  const swabLimit = residueSwabLimit(shaped, labels);
  const inserted = missing.map((measurement) => ({
    type: "tableRow" as const,
    content: Array.from({ length: colCount }, (_, index) => {
      if (index === 0) return makeCell("tableCell", measurement.description);
      if (index === sampleIdCol) return makeCell("tableCell", measurement.id);
      if (index === limitCol) return makeCell("tableCell", swabLimit);
      return makeCell("tableCell", "");
    }),
  }));
  const loqIndex = splitRows.findIndex((row, index) => {
    if (index < bodyStart || row.type !== "tableRow") return false;
    const first = cellPlain(
      (row.content ?? []).find(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      )
    );
    return isLoqLodRowLabel(first);
  });
  const at = loqIndex < 0 ? splitRows.length : loqIndex;
  return {
    ...table,
    content: [
      ...splitRows.slice(0, at),
      ...inserted,
      ...splitRows.slice(at),
    ],
  };
}

function shellDescriptionWithoutIdList(description: string): string {
  if (!/shell wall/i.test(description)) return description;
  const match = /\s*\(([^)]*)\)\s*$/.exec(description);
  if (!match) return description;
  const ids = letteredSwabIds(match[1]);
  if (ids.length < 2) return description;
  const rest = match[1]
    .replace(/S-\d+[a-d]/gi, "")
    .replace(/[,&]|\band\b/gi, "")
    .trim();
  if (rest.length > 0) return description;
  const stripped = description.slice(0, match.index).trim();
  return stripped || description;
}

/**
 * A shell-wall description that still names every ID was split once per load.
 * Drop that parenthetical, then keep one copy of each identical row.
 */
function collapseRepeatedShellRows(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!isResidueResultsTable(labels)) return table;
  const grouped = isGroupedResultsTable(table);
  const bodyStart = grouped ? 2 : 1;
  let changed = false;
  const seen = new Set<string>();
  const content = (table.content ?? []).flatMap((row, index) => {
    if (index < bodyStart || row.type !== "tableRow") return [row];
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const description = cellPlain(cells[0]);
    const nextDescription = shellDescriptionWithoutIdList(description);
    if (!/shell wall/i.test(description)) return [row];
    const nextCells =
      nextDescription === description
        ? cells
        : cells.map((cell, cellIndex) =>
            cellIndex === 0 ? makeCell("tableCell", nextDescription) : cell
          );
    if (nextDescription !== description) changed = true;
    const key = nextCells.map((cell) => cellPlain(cell)).join("\u0000");
    if (seen.has(key)) {
      changed = true;
      return [];
    }
    seen.add(key);
    return nextCells === cells ? [row] : [{ ...row, content: nextCells }];
  });
  return changed ? { ...table, content } : table;
}

function isSwabRationaleTable(labels: readonly string[]): boolean {
  const hasId = labels.some((label) => /swab id/i.test(label));
  const hasCount = labels.some((label) => /no\.?\s*of samples/i.test(label));
  return hasId && hasCount;
}

function singleLetteredSwabId(text: string): { base: string; letter: string } | null {
  const match = /^S-(\d+)([a-d])$/i.exec(text.trim());
  if (!match) return null;
  return { base: match[1], letter: match[2].toLowerCase() };
}

function groupedLevelDescription(descriptions: readonly string[]): string {
  const levels = descriptions.map(
    (description) =>
      /^Shell wall Level (\d+) \((?:0°|90°|180°|270°)\)$/.exec(description)?.[1]
  );
  if (levels.every((level) => level && level === levels[0])) {
    return `Shell wall Level ${levels[0]} (four circumferential locations)`;
  }
  return descriptions[0] ?? "";
}

/**
 * 15.N.3.4 keeps one row per shell level. A previous pass split S-8a–d into
 * four angle rows; fold those back. 15.N.7 is a different table and stays
 * one row per measurement.
 */
function collapseSplitSwabRationaleRows(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!isSwabRationaleTable(labels)) return table;
  const idCol = labels.findIndex((label) => /swab id/i.test(label));
  const descriptionCol = labels.findIndex((label) => /description/i.test(label));
  const samplesCol = labels.findIndex((label) =>
    /no\.?\s*of samples/i.test(label)
  );
  if (idCol < 0) return table;
  const rows = table.content ?? [];
  let changed = false;
  const content: JSONContent[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (!row || index === 0 || row.type !== "tableRow") {
      if (row) content.push(row);
      index += 1;
      continue;
    }
    const cellsOf = (candidate: JSONContent) =>
      (candidate.content ?? []).filter(
        (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
      );
    const firstId = singleLetteredSwabId(cellPlain(cellsOf(row)[idCol]));
    const group = [row];
    if (firstId) {
      let next = index + 1;
      while (next < rows.length) {
        const candidate = rows[next];
        if (!candidate || candidate.type !== "tableRow") break;
        const parsed = singleLetteredSwabId(
          cellPlain(cellsOf(candidate)[idCol])
        );
        if (!parsed || parsed.base !== firstId.base) break;
        group.push(candidate);
        next += 1;
      }
    }
    const parsedIds = group.map((member) =>
      singleLetteredSwabId(cellPlain(cellsOf(member)[idCol]))
    );
    const letters = parsedIds.flatMap((parsed) =>
      parsed ? [parsed.letter] : []
    );
    const codes = letters.map((letter) => letter.charCodeAt(0));
    const contiguous =
      parsedIds.every((parsed) => parsed?.base === firstId?.base) &&
      letters.length >= 3 &&
      new Set(letters).size === letters.length &&
      Math.max(...codes) - Math.min(...codes) + 1 === letters.length;
    if (!firstId || !contiguous) {
      content.push(row);
      index += 1;
      continue;
    }
    changed = true;
    const descriptions = group.map((member) =>
      cellPlain(cellsOf(member)[descriptionCol])
    );
    const samples = group.map((member) =>
      cellPlain(cellsOf(member)[samplesCol])
    );
    const lo = String.fromCharCode(Math.min(...codes));
    const hi = String.fromCharCode(Math.max(...codes));
    const sampleCount = samples.every((sample) => sample === "1" || sample === "")
      ? String(group.length)
      : (samples[0] ?? String(group.length));
    const template = cellsOf(group[0]);
    content.push({
      ...group[0],
      content: template.map((cell, cellIndex) => {
        if (cellIndex === idCol) {
          return makeCell("tableCell", `S-${firstId.base}${lo}–${hi}`);
        }
        if (cellIndex === descriptionCol) {
          return makeCell("tableCell", groupedLevelDescription(descriptions));
        }
        if (cellIndex === samplesCol) return makeCell("tableCell", sampleCount);
        return clonePlainCell(cell);
      }),
    });
    index += group.length;
  }
  return changed ? { ...table, content } : table;
}

function residueResultsStart(table: JSONContent): number {
  const labels = headerLabels(table.content?.[0]);
  const limitCol = residueLimitColumn(labels);
  if (limitCol >= 0) return limitCol + 1;
  return batchColumnStart(labels);
}

function looksLikeLoqLodValue(text: string): boolean {
  return /\bppm\b|\bnmt\b/i.test(text);
}

function loqLodSeed(label: string): string {
  if (/^loq$/i.test(label)) return CVP_RESIDUE_LOQ;
  if (/^lod$/i.test(label)) return CVP_RESIDUE_LOD;
  return "";
}

/**
 * LOQ / LOD are method sensitivity, not the residue Limit. A value still
 * sitting in Limit or Sample ID moves into empty Results cells.
 *
 * Copying a filled Results cell into an empty sibling (or reseeding
 * NMT 1 ppm / NMT 0.3 ppm) only happens when this pass just inserted the
 * Limit column. Re-running that on an already-wide grid puts back a cell
 * the engineer cleared.
 */
function placeLoqLodInResults(
  table: JSONContent,
  options?: { fillEmptyResultsFromSiblings?: boolean }
): JSONContent {
  const fillEmptyResultsFromSiblings =
    options?.fillEmptyResultsFromSiblings === true;
  const labels = headerLabels(table.content?.[0]);
  if (!isResidueResultsTable(labels)) return table;
  const grouped = isGroupedResultsTable(table);
  const limitCol = residueLimitColumn(labels);
  const resultsStart = residueResultsStart(table);
  const sampleIdCol = labels.findIndex((label) => /sample id/i.test(label));
  let changed = false;
  const content = (table.content ?? []).map((row, index) => {
    if (index === 0 || row.type !== "tableRow") return row;
    if (grouped && index === 1) return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const first = cellPlain(cells[0]);
    if (!isLoqLodRowLabel(first)) return row;
    const resultTexts = cells
      .slice(resultsStart)
      .map((cell) => cellPlain(cell));
    const filledResults = resultTexts.filter((text) => text.length > 0);
    const limitText = limitCol >= 0 ? cellPlain(cells[limitCol]) : "";
    const sampleText = sampleIdCol >= 0 ? cellPlain(cells[sampleIdCol]) : "";
    const misplaced =
      (looksLikeLoqLodValue(limitText) ? limitText : "") ||
      (looksLikeLoqLodValue(sampleText) ? sampleText : "");
    const criterion = fillEmptyResultsFromSiblings
      ? filledResults[0] || misplaced || loqLodSeed(first)
      : filledResults.length === 0
        ? misplaced
        : "";
    let rowChanged = false;
    const nextCells = cells.map((cell, i) => {
      if (i === 0) return cell;
      if (i === sampleIdCol && looksLikeLoqLodValue(cellPlain(cell))) {
        rowChanged = true;
        return makeCell("tableCell", "");
      }
      if (i === limitCol) {
        if (cellPlain(cell).length === 0) return cell;
        rowChanged = true;
        return makeCell("tableCell", "");
      }
      if (i >= resultsStart) {
        const text = cellPlain(cell);
        if (text.length > 0 || !criterion) return cell;
        rowChanged = true;
        return makeCell("tableCell", criterion);
      }
      return cell;
    });
    if (!rowChanged) return row;
    changed = true;
    return { ...row, content: nextCells };
  });
  return changed ? { ...table, content } : table;
}

function ensureResidueLoqLodRows(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!isResidueResultsTable(labels)) return table;
  const names = residueBodyNames(table);
  const missing: Array<readonly [string, string]> = [];
  if (!names.some((name) => /^loq$/i.test(name))) {
    missing.push(["LOQ", CVP_RESIDUE_LOQ]);
  }
  if (!names.some((name) => /^lod$/i.test(name))) {
    missing.push(["LOD", CVP_RESIDUE_LOD]);
  }
  if (missing.length === 0) return table;
  const colCount = residueColumnCount(table);
  const resultsStart = residueResultsStart(table);
  const extra = missing.map(([label, value]) => ({
    type: "tableRow" as const,
    content: Array.from({ length: colCount }, (_, i) => {
      if (i === 0) return makeCell("tableCell", label);
      if (i >= resultsStart) return makeCell("tableCell", value);
      return makeCell("tableCell", "");
    }),
  }));
  return { ...table, content: [...(table.content ?? []), ...extra] };
}

function reshapeEmptyManufacturingArea(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  const oldShape =
    headersMatch(labels, CVP_PREVIOUS_MANUFACTURING_AREA_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_BATCH_MANUFACTURING_AREA_HEADERS);
  if (!oldShape || !tableExecutionEmpty(table)) return table;
  return groupedResultsTable(CVP_MANUFACTURING_AREA_LEADING_HEADERS, [
    ["", "", "", "", CVP_MANUFACTURING_AREA_LIMIT, "", "", ""],
  ]);
}

function placeManufacturingAreasFirst(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!headersMatch(labels, CVP_OVERALL_RESULTS_HEADERS)) return table;
  let changed = false;
  const content = (table.content ?? []).map((row, index) => {
    if (index === 0 || row.type !== "tableRow") return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const id = cells[0];
    const equipment = cells[1];
    if (!id || !equipment) return row;
    if (cellPlain(id) !== "" || cellPlain(equipment) !== "Manufacturing Areas") {
      return row;
    }
    changed = true;
    const next = cells.slice();
    next[0] = cloneCellWithText(id, "Manufacturing Areas");
    next[1] = emptyLike(equipment);
    return { ...row, content: next };
  });
  return changed ? { ...table, content } : table;
}

function reshapeEmptyOverall(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  const oldShape =
    headersMatch(labels, CVP_PREVIOUS_OVERALL_RESULTS_HEADERS) ||
    headersMatch(labels, CVP_PREVIOUS_BATCH_OVERALL_RESULTS_HEADERS);
  if (!oldShape || !tableExecutionEmpty(table)) return table;
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: CVP_OVERALL_RESULTS_HEADERS.map((h) => makeCell("tableHeader", h)),
      },
      {
        type: "tableRow",
        content: CVP_OVERALL_RESULTS_HEADERS.map(() => makeCell("tableCell", "")),
      },
      {
        type: "tableRow",
        content: CVP_OVERALL_RESULTS_HEADERS.map((_, i) =>
          makeCell("tableCell", i === 0 ? "Manufacturing Areas" : "")
        ),
      },
    ],
  };
}

function reshapeEmptyTesting(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!headersMatch(labels, CVP_PREVIOUS_TESTING_HEADERS)) return table;
  if (!tableExecutionEmpty(table)) return table;
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: CVP_TESTING_HEADERS.map((h) => makeCell("tableHeader", h)),
      },
      {
        type: "tableRow",
        content: [
          makeCell("tableCell", "Product content"),
          makeCell("tableCell", ""),
          makeCell("tableCell", ""),
          makeCell("tableCell", "1 ppm"),
          makeCell("tableCell", "0.3 ppm"),
        ],
      },
      {
        type: "tableRow",
        content: [
          makeCell("tableCell", "Extraneous matter"),
          makeCell("tableCell", ""),
          makeCell("tableCell", ""),
          makeCell("tableCell", "NA"),
          makeCell("tableCell", "NA"),
        ],
      },
    ],
  };
}

function reshapeEmptyHistory(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  if (!headersMatch(labels, CVP_PREVIOUS_HISTORY_HEADERS)) return table;
  const rows = table.content ?? [];
  const body = rows.slice(1);
  const hasUserReason = body.some((row) => {
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const reason = cellPlain(cells[2]);
    return reason.length > 0 && reason.toLowerCase() !== "new document";
  });
  if (hasUserReason) return table;
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: CVP_HISTORY_HEADERS.map((h) => makeCell("tableHeader", h)),
      },
      {
        type: "tableRow",
        content: [
          makeCell("tableCell", "00"),
          makeCell("tableCell", "New document"),
        ],
      },
    ],
  };
}

function fillEmptyTestingLoqLod(table: JSONContent): JSONContent {
  if (!headersMatch(headerLabels(table.content?.[0]), CVP_TESTING_HEADERS)) {
    return table;
  }
  let changed = false;
  const content = (table.content ?? []).map((row, index) => {
    if (index === 0 || row.type !== "tableRow") return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const first = cellPlain(cells[0]).toLowerCase();
    const loq = cells[3];
    const lod = cells[4];
    if (!loq || !lod) return row;
    let next = cells;
    if (/product content|residue/i.test(first)) {
      const a = fillEmptyCell(loq, "1 ppm");
      const b = fillEmptyCell(lod, "0.3 ppm");
      if (a.changed || b.changed) {
        changed = true;
        next = cells.slice();
        next[3] = a.cell;
        next[4] = b.cell;
      }
    }
    if (/extraneous/i.test(first)) {
      const a = fillEmptyCell(loq, "NA");
      const b = fillEmptyCell(lod, "NA");
      if (a.changed || b.changed) {
        changed = true;
        next = cells.slice();
        next[3] = a.cell;
        next[4] = b.cell;
      }
    }
    return next === cells ? row : { ...row, content: next };
  });
  return changed ? { ...table, content } : table;
}

function fillEmptyManufacturingLimit(table: JSONContent): JSONContent {
  const labels = headerLabels(table.content?.[0]);
  const areaTable =
    headersMatch(labels, CVP_MANUFACTURING_AREA_HEADERS) ||
    labels[0]?.toLowerCase() === "area name";
  if (!areaTable) return table;
  const limitCol = labels.findIndex((label) => /^limit$/i.test(label));
  if (limitCol < 0) return table;
  let changed = false;
  const grouped = isGroupedResultsTable(table);
  const content = (table.content ?? []).map((row, index) => {
    if (index === 0 || row.type !== "tableRow") return row;
    if (grouped && index === 1) return row;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableHeader" || cell.type === "tableCell"
    );
    const target = cells[limitCol];
    if (!target) return row;
    const filled = fillEmptyCell(target, CVP_MANUFACTURING_AREA_LIMIT);
    if (!filled.changed) return row;
    changed = true;
    const next = cells.slice();
    next[limitCol] = filled.cell;
    return { ...row, content: next };
  });
  return changed ? { ...table, content } : table;
}

function reshapeCvpStage5Tables(doc: JSONContent): JSONContent {
  if (!doc.content) return doc;
  let changed = false;
  const content = doc.content.map((node) => {
    if (node.type !== "table") return node;
    let next = reshapeEmptyManufacturingArea(node);
    next = reshapeEmptyOverall(next);
    next = placeManufacturingAreasFirst(next);
    next = reshapeEmptyTesting(next);
    next = reshapeEmptyHistory(next);
    next = flattenGroupedVisualInspection(next);
    const withLimit = insertSampleLimitColumn(next);
    const limitJustInserted = withLimit !== next;
    next = withLimit;
    next = promoteAndDropLimitRow(next);
    next = fillEmptyResidueSeeds(next);
    next = expandStubReactorSwabRows(next);
    next = expandReactorShellMeasurementRows(next);
    next = collapseRepeatedShellRows(next);
    next = collapseSplitSwabRationaleRows(next);
    if (
      !isExtraneousSampleTable(next) &&
      !isManufacturingAreaSampleTable(headerLabels(next.content?.[0]))
    ) {
      next = ensureResidueLoqLodRows(next);
      next = placeLoqLodInResults(next, {
        fillEmptyResultsFromSiblings: limitJustInserted,
      });
    }
    next = fillEmptyTestingLoqLod(next);
    next = fillEmptyManufacturingLimit(next);
    if (next !== node) changed = true;
    return next;
  });
  return changed ? { ...doc, content } : doc;
}

export function upgradeCvpValidationDoc(doc: JSONContent): JSONContent {
  return ensureCvpInferenceConclusionShall(
    reshapeCvpStage5Tables(
      swapCvpValidationSeedText(upgradeCvpCycleTables(doc))
    )
  );
}
