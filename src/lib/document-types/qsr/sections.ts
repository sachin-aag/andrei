import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";

/**
 * 3xper Innoventure Qualification Summary Report (QAD/016/F06-00).
 *
 * One report per qualified equipment/system. Numbered headings, the cover,
 * the sign-off block, revision history, and the Index are fixed in the
 * Word template; only the bodies below are editable.
 *
 * Prefix every key with `qsr_`: SUGGEST_TARGET_FIELD_PATTERNS is a flat map
 * shared across types.
 */
export const QSR_SECTION_KEYS = [
  "qsr_objective",
  "qsr_scope",
  "qsr_references",
  "qsr_acronyms",
  "qsr_overview",
  "qsr_background",
  "qsr_qualification_documents",
  "qsr_sops",
  "qsr_rtm_process",
  "qsr_rtm_control",
  "qsr_rtm_gmp",
  "qsr_rtm_safety",
  "qsr_rtm_csv",
  "qsr_rtm_maintenance",
  "qsr_volumetric_details",
  "qsr_operating_range",
  "qsr_other_details",
  "qsr_conclusion",
] as const;

export type QsrSectionKey = (typeof QSR_SECTION_KEYS)[number];

export type QsrNarrativeContent = { narrative: JSONContent };
export type QsrTableContent = { table: JSONContent };
export type QsrSectionContent = QsrNarrativeContent | QsrTableContent;

export const QSR_TABLE_SECTION_KEYS = [
  "qsr_references",
  "qsr_acronyms",
  "qsr_qualification_documents",
  "qsr_sops",
  "qsr_rtm_process",
  "qsr_rtm_control",
  "qsr_rtm_gmp",
  "qsr_rtm_safety",
  "qsr_rtm_csv",
  "qsr_rtm_maintenance",
  "qsr_operating_range",
] as const satisfies readonly QsrSectionKey[];

/**
 * Word-form Table N on QAD/016/F06-00 (Table 3 Qualification Documents,
 * Table 4 SOPs, Tables 5–10 RTM). Empty shells still occupy N — chat
 * "draft table 4" is SOPs, not the next filled grid.
 */
export const QSR_FORM_TABLE_SECTIONS = [
  "qsr_references",
  "qsr_acronyms",
  "qsr_qualification_documents",
  "qsr_sops",
  "qsr_rtm_process",
  "qsr_rtm_control",
  "qsr_rtm_gmp",
  "qsr_rtm_safety",
  "qsr_rtm_csv",
  "qsr_rtm_maintenance",
] as const satisfies readonly QsrSectionKey[];

export function sectionForQsrFormTableNumber(
  printed: number
): QsrSectionKey | undefined {
  if (!Number.isInteger(printed) || printed < 1) return undefined;
  return QSR_FORM_TABLE_SECTIONS[printed - 1];
}

export type QsrTableSectionKey = (typeof QSR_TABLE_SECTION_KEYS)[number];

const TABLE_KEY_SET: ReadonlySet<string> = new Set(QSR_TABLE_SECTION_KEYS);

export function isQsrSectionKey(key: string): key is QsrSectionKey {
  return (QSR_SECTION_KEYS as readonly string[]).includes(key);
}

export function isQsrTableSectionKey(key: string): key is QsrTableSectionKey {
  return TABLE_KEY_SET.has(key);
}

/** Section number as printed on the form (1.1 Objective … 7 Conclusion). */
export const QSR_SECTION_LABELS: Record<QsrSectionKey, string> = {
  qsr_objective: "1.1 Objective",
  qsr_scope: "1.2 Scope",
  qsr_references: "1.3 References",
  qsr_acronyms: "1.4 Acronyms and Abbreviations",
  qsr_overview: "2.1 Overview",
  qsr_background: "2.2 Background",
  qsr_qualification_documents: "3 Qualification Documents",
  qsr_sops: "4 Standard Operation Procedures",
  qsr_rtm_process: "5.1 Process Requirements",
  qsr_rtm_control: "5.2 Control Philosophy",
  qsr_rtm_gmp: "5.3 GMP Requirements",
  qsr_rtm_safety: "5.4 Safety Requirements",
  qsr_rtm_csv: "5.5 Computer System Validation Requirements",
  qsr_rtm_maintenance: "5.6 Maintenance and Cleaning Requirements",
  qsr_volumetric_details: "6.1 Volumetric Details",
  qsr_operating_range: "6.2 Operating Range",
  qsr_other_details: "6.3 Other Details",
  qsr_conclusion: "7 Conclusion",
};

/** Display order under Reference — one editor column per protocol family. */
export const QSR_RTM_FAMILY_HEADERS = [
  "Reference – DQ",
  "Reference – IQ",
  "Reference – OQ",
  "Reference – PQ",
] as const;

// Two-row Word headers (Reference → DQ / IQ / OQ / PQ) are flattened to
// one editor row; the template keeps the original two rows.
export const QSR_RTM_HEADERS = [
  "URS ID",
  "Parameters",
  "User requirements",
  ...QSR_RTM_FAMILY_HEADERS,
  "Remarks",
] as const;

export const QSR_CONTROL_HEADERS = [
  "URS ID",
  "Type of control",
  "Purpose",
  "Operation range",
  ...QSR_RTM_FAMILY_HEADERS,
  "Remarks",
] as const;

/** Pre-family-column editor headers. Stage / Section are dropped on coerce. */
export const QSR_RTM_LEGACY_HEADERS = [
  "URS ID",
  "Parameters",
  "User requirements",
  "Reference – Qualification Stage",
  "Reference – Section",
  "Remarks",
] as const;

export const QSR_CONTROL_LEGACY_HEADERS = [
  "URS ID",
  "Type of control",
  "Purpose",
  "Operation range",
  "Reference – Qualification Stage",
  "Reference – Section",
  "Remarks",
] as const;

export const QSR_REFERENCES_HEADERS = [
  "Name of the Document",
  "Reference Number",
] as const;

export const QSR_ACRONYMS_HEADERS = [
  "Acronym",
  "Description",
  "Acronym",
  "Description",
] as const;

export const QSR_QUALIFICATION_DOCUMENT_HEADERS = [
  "Document Name",
  "Document Number",
  "Revision",
  "Status",
  "Effective Date / Approved date",
  "Remarks",
] as const;

export const QSR_SOP_HEADERS = ["SOP Name", "SOP Number", "Effective Date"] as const;

export const QSR_VOLUMETRIC_HEADERS = ["S.No", "Parameter", "Details"] as const;

/** Table 11 Other Details of Equipment — Parameter / Details. */
export const QSR_OTHER_DETAILS_HEADERS = ["Parameter", "Details"] as const;

export const QSR_OTHER_DETAILS_ROWS = [
  ["Total Heat Transfer Area"],
  ["Agitator Type"],
  ["Type of Agitator"],
  ["Pump Type"],
  ["Type of Mechanical Seal"],
  ["Mechanical Seal Flushing Media"],
  ["Mechanical Seal Flushing Pressure"],
  ["Mechanical Seal Flushing Flow"],
] as const;

/**
 * Flat grid the export still accepts. The form itself has no Range header:
 * Details spans that column, and Temperature's Minimum / Maximum are body cells.
 */
export const QSR_OPERATING_RANGE_HEADERS = [
  "S.No",
  "Parameter",
  "Range",
  "Details",
] as const;

export const QSR_TABLE_HEADERS: Record<QsrTableSectionKey, readonly string[]> = {
  qsr_references: QSR_REFERENCES_HEADERS,
  qsr_acronyms: QSR_ACRONYMS_HEADERS,
  qsr_qualification_documents: QSR_QUALIFICATION_DOCUMENT_HEADERS,
  qsr_sops: QSR_SOP_HEADERS,
  qsr_rtm_process: QSR_RTM_HEADERS,
  qsr_rtm_control: QSR_CONTROL_HEADERS,
  qsr_rtm_gmp: QSR_RTM_HEADERS,
  qsr_rtm_safety: QSR_RTM_HEADERS,
  qsr_rtm_csv: QSR_RTM_HEADERS,
  qsr_rtm_maintenance: QSR_RTM_HEADERS,
  qsr_operating_range: QSR_OPERATING_RANGE_HEADERS,
};

const CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null };

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

function cell(
  type: "tableHeader" | "tableCell",
  text: string,
  attrs: { colspan?: number; rowspan?: number; bold?: boolean } = {}
): JSONContent {
  return {
    type,
    attrs: {
      ...CELL_ATTRS,
      colspan: attrs.colspan ?? 1,
      rowspan: attrs.rowspan ?? 1,
    },
    content: [textParagraph(text, attrs.bold)],
  };
}

type SeedRow = readonly string[] | { banner: string };

function table(
  headers: readonly string[],
  rows: readonly SeedRow[] = []
): JSONContent {
  const body: readonly SeedRow[] = rows.length ? rows : [headers.map(() => "")];
  return {
    type: "table",
    content: [
      { type: "tableRow", content: headers.map((h) => cell("tableHeader", h)) },
      ...body.map((row) =>
        "banner" in row
          ? {
              type: "tableRow",
              content: [
                cell("tableCell", row.banner, {
                  bold: true,
                  colspan: headers.length,
                }),
              ],
            }
          : {
              type: "tableRow",
              content: headers.map((_, i) => cell("tableCell", row[i] ?? "")),
            }
      ),
    ],
  };
}

function tableDoc(
  headers: readonly string[],
  rows: readonly SeedRow[] = []
): JSONContent {
  return { type: "doc", content: [table(headers, rows)] };
}

const REFERENCE_ROWS = [
  "User Requirement Specification",
  "Design Specification / Data Sheet Document",
  "Design Qualification Report Number",
  "Installation Qualification Report Number",
  "Purchase Order (P.O)",
  "Current version of “Validation Master Plan”,",
  "Standard operating procedure for carrying out qualification activity",
  "ISPE (International Society for Pharmaceutical Engineering)",
  "IPA (Indian Pharmaceutical Association) for Good Engineering Practices",
].map((name) => [name, ""]);

const ACRONYM_ROWS = [
  ["URS", "User Requirement Specification", "cGMP", "Current Good Manufacturing Practices"],
  ["DQ", "Design Qualification", "IQ", "Installation Qualification"],
  ["NA", "Not applicable", "MOC", "Material of construction"],
  ["QC", "Quality Control", "SOP", "Standard Operating Procedure"],
  ["PO", "Purchase Order", "PR", "Purchase Request"],
  ["PUF", "Poly Urethane Foam", "DS", "Data Sheet"],
  ["QSM", "Quality System Management", "GLR", "Glass Lined Reactor"],
  ["EHS", "Environmental Health & Safety", "GAD", "General Arrangement Diagram"],
  ["MSGL", "Mild Steel Glass Lined", "SS", "Stainless Steel"],
  ["SISPQ", "Safety, Identity, Strength, Purity, and Quality", "FAT", "Factory Acceptance Test"],
];

/** 5.1 group rows from the form, without equipment-specific banners. */
const PROCESS_REQUIREMENT_ROWS: SeedRow[] = [
  ["URS-1"],
  { banner: "ANY SPECIFIC REQUIREMENTS" },
  [""],
  { banner: "OTHER AUXILIARY REQUIREMENT" },
  [""],
];

const SOP_ROWS = [
  ["Standard operating procedure for operation & cleaning"],
  ["Standard operating procedure for Instruments calibration program"],
  [
    "Standard operating procedure for carrying out Preventive Maintenance of equipment",
  ],
  ["Training"],
];

/** QAD/016/F06-00 Table 11 rows added after overflow; auxiliary tables omit these. */
export const QSR_MAIN_VOLUMETRIC_EXTRA_ROWS = [
  ["7", "Inner Surface area"],
  ["8", "Equipment Dimensions (L x W x H)"],
] as const;

export const QSR_MAIN_VOLUMETRIC_ROWS = [
  ["1", "Minimum stirring volume (L)"],
  ["2", "Minimum temperature sensing volume without stirring (L)"],
  ["3", "Minimum temperature sensing volume with stirring (L)"],
  ["4", "Minimum sampling volume (L)- If applicable"],
  ["5", "Full volume (L)"],
  ["6", "Over flow volume (L)"],
  ...QSR_MAIN_VOLUMETRIC_EXTRA_ROWS,
];

export const QSR_AUXILIARY_VOLUMETRIC_ROWS = [
  ["1", "Dead volume (L)"],
  ["2", "Full volume (L)"],
  ["3", "Over flow volume (L)"],
];

/** Matches the form: Details spans the unused Range column; Temperature splits it. */
function operatingRangeDoc(): JSONContent {
  const span = (no: string, parameter: string): JSONContent => ({
    type: "tableRow",
    content: [
      cell("tableCell", no),
      cell("tableCell", parameter),
      cell("tableCell", "", { colspan: 2 }),
    ],
  });
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              cell("tableHeader", "S.No"),
              cell("tableHeader", "Parameter"),
              cell("tableHeader", "Details", { colspan: 2 }),
            ],
          },
          span("1.", "Pressure"),
          span("2.", "Vacuum"),
          span("3.", "Agitator RPM"),
          {
            type: "tableRow",
            content: [
              cell("tableCell", "4.", { rowspan: 2 }),
              cell("tableCell", "Temperature", { rowspan: 2 }),
              cell("tableCell", "Minimum"),
              cell("tableCell", ""),
            ],
          },
          {
            type: "tableRow",
            content: [cell("tableCell", "Maximum"), cell("tableCell", "")],
          },
        ],
      },
    ],
  };
}

function cellPlain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map((child) => cellPlain(child)).join("");
}

/** Dash / break / case-insensitive header identity for coerce. */
function headerKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function headerRowMatches(
  labels: readonly string[],
  expected: readonly string[]
): boolean {
  if (labels.length !== expected.length) return false;
  return labels.every((label, index) => headerKey(label) === headerKey(expected[index]!));
}

function findFirstTable(node: JSONContent | undefined): JSONContent | undefined {
  if (!node) return undefined;
  if (node.type === "table") return node;
  for (const child of node.content ?? []) {
    const found = findFirstTable(child);
    if (found) return found;
  }
  return undefined;
}

function replaceTable(
  node: JSONContent,
  from: JSONContent,
  to: JSONContent
): JSONContent {
  if (node === from) return to;
  if (!node.content) return node;
  let changed = false;
  const content = node.content.map((child) => {
    const next = replaceTable(child, from, to);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, content } : node;
}

function isFamilyColumnHeader(header: string): boolean {
  return (QSR_RTM_FAMILY_HEADERS as readonly string[]).some(
    (family) => headerKey(family) === headerKey(header)
  );
}

function legacyRtmHeadersFromLabels(
  labels: readonly string[]
): typeof QSR_RTM_LEGACY_HEADERS | typeof QSR_CONTROL_LEGACY_HEADERS | null {
  if (
    headerRowMatches(labels, QSR_RTM_HEADERS) ||
    headerRowMatches(labels, QSR_CONTROL_HEADERS)
  ) {
    return null;
  }
  if (headerRowMatches(labels, QSR_RTM_LEGACY_HEADERS)) {
    return QSR_RTM_LEGACY_HEADERS;
  }
  if (headerRowMatches(labels, QSR_CONTROL_LEGACY_HEADERS)) {
    return QSR_CONTROL_LEGACY_HEADERS;
  }
  const keys = labels.map(headerKey);
  if (
    keys.some(
      (key) =>
        key === "referencedq" ||
        key === "referenceiq" ||
        key === "referenceoq" ||
        key === "referencepq"
    )
  ) {
    return null;
  }
  const hasStage = keys.some(
    (key) => key.includes("qualificationstage") || key === "stage"
  );
  const hasSection = keys.some(
    (key) => key === "section" || key === "referencesection"
  );
  if (!hasStage || !hasSection) return null;
  if (keys.some((key) => key.includes("typeofcontrol"))) {
    return QSR_CONTROL_LEGACY_HEADERS;
  }
  return QSR_RTM_LEGACY_HEADERS;
}

/**
 * The form has no Range header. A saved four-column grid (Range between
 * Parameter and Details) is shown as the form: a blank Range cell joins
 * Details, and a following row with only a Range label continues Temperature.
 */
export function shapeOperatingRangeTable(doc: JSONContent): JSONContent {
  const table = doc.content?.find((node) => node.type === "table");
  const rows = table?.content ?? [];
  const labels = (rows[0]?.content ?? []).map((node) => cellPlain(node).trim());
  if (labels.join("\0") !== QSR_OPERATING_RANGE_HEADERS.join("\0")) return doc;

  const body = rows.slice(1).map((row) => row.content ?? []);
  const out: JSONContent[] = [
    {
      type: "tableRow",
      content: [
        cell("tableHeader", "S.No"),
        cell("tableHeader", "Parameter"),
        cell("tableHeader", "Details", { colspan: 2 }),
      ],
    },
  ];
  for (let i = 0; i < body.length; i += 1) {
    const sno = cellPlain(body[i]?.[0]).trim();
    const parameter = cellPlain(body[i]?.[1]).trim();
    const range = cellPlain(body[i]?.[2]).trim();
    const details = cellPlain(body[i]?.[3]).trim();
    const extras: Array<{ range: string; details: string }> = [];
    while (i + extras.length + 1 < body.length) {
      const next = body[i + extras.length + 1] ?? [];
      const nextRange = cellPlain(next[2]).trim();
      if (cellPlain(next[0]).trim() || cellPlain(next[1]).trim() || !nextRange) break;
      extras.push({ range: nextRange, details: cellPlain(next[3]).trim() });
    }
    if (extras.length === 0 && !range) {
      out.push({
        type: "tableRow",
        content: [
          cell("tableCell", sno),
          cell("tableCell", parameter),
          cell("tableCell", details, { colspan: 2 }),
        ],
      });
      continue;
    }
    const rowspan = extras.length + 1;
    out.push({
      type: "tableRow",
      content: [
        cell("tableCell", sno, rowspan > 1 ? { rowspan } : {}),
        cell("tableCell", parameter, rowspan > 1 ? { rowspan } : {}),
        cell("tableCell", range),
        cell("tableCell", details),
      ],
    });
    for (const extra of extras) {
      out.push({
        type: "tableRow",
        content: [cell("tableCell", extra.range), cell("tableCell", extra.details)],
      });
    }
    i += extras.length;
  }
  return { type: "doc", content: [{ type: "table", content: out }] };
}

function normalizeParam(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function isVolumetricHeader(labels: string[]): boolean {
  return labels.join("\0") === QSR_VOLUMETRIC_HEADERS.join("\0");
}

function tableParameterLabels(table: JSONContent): string[] {
  return (table.content ?? []).slice(1).map((row) => cellPlain(row.content?.[1]).trim());
}

function isMainVolumetricTable(table: JSONContent): boolean {
  const rows = table.content ?? [];
  if (!isVolumetricHeader(rows[0]?.content?.map((node) => cellPlain(node).trim()) ?? [])) {
    return false;
  }
  const stirring = normalizeParam("Minimum stirring volume (L)");
  return tableParameterLabels(table).some((label) => normalizeParam(label) === stirring);
}

function appendMissingExtraRows(table: JSONContent): JSONContent {
  if (!isMainVolumetricTable(table)) return table;
  const existing = new Set(tableParameterLabels(table).map(normalizeParam));
  const extraRows = QSR_MAIN_VOLUMETRIC_EXTRA_ROWS.flatMap((extra) => {
    if (existing.has(normalizeParam(extra[1]))) return [];
    existing.add(normalizeParam(extra[1]));
    return [
      {
        type: "tableRow" as const,
        content: QSR_VOLUMETRIC_HEADERS.map((_, i) => cell("tableCell", extra[i] ?? "")),
      },
    ];
  });
  if (extraRows.length === 0) return table;
  return { ...table, content: [...(table.content ?? []), ...extraRows] };
}

function headerLabels(row: JSONContent | undefined): string[] {
  return (row?.content ?? []).map((node) => cellPlain(node).trim());
}

function emptyBodyCell(): JSONContent {
  return cell("tableCell", "");
}

function remapLegacyRtmRow(
  row: JSONContent,
  fromHeaders: readonly string[],
  toHeaders: readonly string[]
): JSONContent {
  const cells = row.content ?? [];
  const first = cells[0];
  const span = Number(first?.attrs?.colspan ?? 1);
  if (cells.length === 1 && span >= fromHeaders.length) {
    return {
      ...row,
      content: [
        {
          ...first,
          attrs: { ...first?.attrs, colspan: toHeaders.length },
        },
      ],
    };
  }
  const byHeader = new Map<string, JSONContent>();
  fromHeaders.forEach((header, index) => {
    const source = cells[index];
    if (source) byHeader.set(header, source);
  });
  return {
    ...row,
    content: toHeaders.map((header) => {
      if (isFamilyColumnHeader(header)) return emptyBodyCell();
      return byHeader.get(header) ?? emptyBodyCell();
    }),
  };
}

/**
 * Existing Tables 5–10 stored Stage + Section. Opening or exporting them
 * keeps URS identity and Remarks, drops Stage / Section, and leaves the
 * four family columns blank so the assistant can refill from each protocol.
 */
export function ensureRtmFamilyColumns(
  doc: JSONContent,
  headers: readonly string[]
): JSONContent {
  const table = findFirstTable(doc);
  if (!table) return doc;
  const rows = table.content ?? [];
  const labels = headerLabels(rows[0]);
  if (headerRowMatches(labels, headers)) return doc;
  const legacy = legacyRtmHeadersFromLabels(labels);
  if (!legacy) return doc;
  const nextRows = rows.map((row, index) => {
    if (index === 0) {
      return {
        ...row,
        content: headers.map((header) => cell("tableHeader", header)),
      };
    }
    return remapLegacyRtmRow(row, legacy, headers);
  });
  const nextTable = { ...table, content: nextRows };
  return replaceTable(doc, table, nextTable);
}

/**
 * Existing reports were seeded with Table 11 rows 1–6. Opening or exporting
 * them appends Inner Surface area and Equipment Dimensions when those labels
 * are missing. Auxiliary Dead/Full/Overflow tables are left alone.
 */
export function ensureVolumetricFormRows(doc: JSONContent): JSONContent {
  const content = doc.content ?? [];
  let changed = false;
  const next = content.map((node) => {
    if (node.type !== "table") return node;
    const ensured = appendMissingExtraRows(node);
    if (ensured !== node) changed = true;
    return ensured;
  });
  if (!changed) return doc;
  return { ...doc, content: next };
}

function volumetricDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      textParagraph(""),
      table(QSR_VOLUMETRIC_HEADERS, QSR_MAIN_VOLUMETRIC_ROWS),
      textParagraph("Auxiliary Equipment: "),
      table(QSR_VOLUMETRIC_HEADERS, QSR_AUXILIARY_VOLUMETRIC_ROWS),
    ],
  };
}

function otherDetailsDoc(): JSONContent {
  return tableDoc(QSR_OTHER_DETAILS_HEADERS, QSR_OTHER_DETAILS_ROWS);
}

export const QSR_STANDARD_SCOPE =
  "This Qualification Summary Report covers the qualification lifecycle activities performed for the equipment/system. The report evaluates the outcome of these activities and confirms the readiness of the equipment/system for routine GMP use at 3xper Innoventure Limited, Naidupeta";

export function emptyQsrContent(key: QsrSectionKey): QsrSectionContent {
  switch (key) {
    case "qsr_scope":
      return { narrative: { type: "doc", content: [textParagraph(QSR_STANDARD_SCOPE)] } };
    case "qsr_objective":
    case "qsr_overview":
    case "qsr_background":
    case "qsr_conclusion":
      return { narrative: emptyDoc() };
    case "qsr_volumetric_details":
      return { narrative: volumetricDoc() };
    case "qsr_other_details":
      return { narrative: otherDetailsDoc() };
    case "qsr_references":
      return { table: tableDoc(QSR_REFERENCES_HEADERS, REFERENCE_ROWS) };
    case "qsr_acronyms":
      return { table: tableDoc(QSR_ACRONYMS_HEADERS, ACRONYM_ROWS) };
    case "qsr_qualification_documents":
      return { table: tableDoc(QSR_QUALIFICATION_DOCUMENT_HEADERS) };
    case "qsr_sops":
      return { table: tableDoc(QSR_SOP_HEADERS, SOP_ROWS) };
    case "qsr_rtm_process":
      return { table: tableDoc(QSR_RTM_HEADERS, PROCESS_REQUIREMENT_ROWS) };
    case "qsr_rtm_gmp":
    case "qsr_rtm_safety":
    case "qsr_rtm_csv":
    case "qsr_rtm_maintenance":
      return { table: tableDoc(QSR_RTM_HEADERS) };
    case "qsr_rtm_control":
      return { table: tableDoc(QSR_CONTROL_HEADERS) };
    case "qsr_operating_range":
      return { table: operatingRangeDoc() };
    default: {
      const exhaustive: never = key;
      throw new Error(`Unknown QSR section: ${String(exhaustive)}`);
    }
  }
}

export const EMPTY_QSR_CONTENT = Object.fromEntries(
  QSR_SECTION_KEYS.map((key) => [key, emptyQsrContent(key)])
) as Record<QsrSectionKey, QsrSectionContent>;

export type QsrMetadata = {
  equipmentName: string;
  equipmentCode: string;
  capacity: string;
  plantSection: string;
  revision: string;
  revisionDescription: string;
};

export const QSR_DEFAULT_METADATA: QsrMetadata = {
  equipmentName: "",
  equipmentCode: "",
  capacity: "",
  plantSection: "",
  revision: "00",
  revisionDescription: "New Document",
};

export function qsrMetadataFrom(metadata: unknown): QsrMetadata {
  const raw =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const pick = (key: keyof QsrMetadata) =>
    typeof raw[key] === "string" ? (raw[key] as string) : QSR_DEFAULT_METADATA[key];
  return {
    equipmentName: pick("equipmentName"),
    equipmentCode: pick("equipmentCode"),
    capacity: pick("capacity"),
    plantSection: pick("plantSection"),
    revision: pick("revision"),
    revisionDescription: pick("revisionDescription"),
  };
}
