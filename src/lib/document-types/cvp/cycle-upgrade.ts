import type { JSONContent } from "@tiptap/core";
import {
  CVP_BATCH_EXECUTION_HEADERS,
  CVP_BATCH_LABELS,
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_MANUFACTURING_AREA_HEADERS,
  CVP_NITROSAMINE_HEADERS,
  CVP_OVERALL_CRITERIA_HEADERS,
  CVP_OVERALL_RESULTS_HEADERS,
  CVP_PGI_HEADERS,
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
  CVP_VISUAL_INSPECTION_HEADERS,
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
    "The cleaning procedure shall be considered validated when three consecutive cleaning batches each comply with the visual inspection, swab, rinse, extraneous matter, pH (wherever applicable), nitrosamine, and potential genotoxic impurities acceptance criteria defined in this protocol. A failed batch shall be investigated, and the count of consecutive batches restarts unless the investigation justifies otherwise.",
  ],
  [
    "Any result exceeding the acceptance criteria shall be investigated as per the OOS / deviation SOP. The equipment shall be re-cleaned and re-sampled, and the run shall not be counted as a successful run unless the investigation justifies it.",
    "Any result exceeding the acceptance criteria shall be investigated as per the OOS / deviation SOP. The equipment shall be re-cleaned and re-sampled, and the batch shall not be counted as a successful batch unless the investigation justifies it.",
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

function cellPlain(cell: JSONContent): string {
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
    content: [textParagraph(text, type === "tableHeader")],
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
  for (const spec of SPLIT_LAST) {
    if (headersMatch(labels, spec.newHeaders)) return table;
    if (headersMatch(labels, spec.oldHeaders)) return splitLastColumn(table, spec);
  }
  for (const spec of INSERT_BATCH) {
    if (headersMatch(labels, spec.newHeaders)) return table;
    if (headersMatch(labels, spec.oldHeaders)) return insertBatchColumn(table, spec);
  }
  return appendNumberOfBatchesRow(table);
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
