import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";

/**
 * 3xper Innoventure Cleaning Verification Protocol (QAD-SOP-PS-003-F08-00).
 *
 * One protocol per product / stage / plant train. Cover identity, page
 * chrome, and numbered headings are fixed in the Word template.
 *
 * Prefix every key with `cvp_`: SUGGEST_TARGET_FIELD_PATTERNS is a flat map
 * shared across types. Equipment sampling is `{ items: JSONContent[] }` — one
 * TipTap box per product-contact item, numbered 15.1, 15.2, … (not hardcoded
 * vessel IDs). Add equipment inserts a blank 15.N template.
 */
export const CVP_FORM_NO = "QAD-SOP-PS-003-F08-00";

export const CVP_SECTION_KEYS = [
  "cvp_approvals",
  "cvp_objective",
  "cvp_scope",
  "cvp_responsibilities",
  "cvp_background",
  "cvp_prerequisites",
  "cvp_qualification_status",
  "cvp_surface_area",
  "cvp_rinse_volume",
  "cvp_maco",
  "cvp_acceptance_limits",
  "cvp_methodology",
  "cvp_sampling_procedure",
  "cvp_swab_locations",
  "cvp_sampling_plan",
  "cvp_equipment_sampling",
  "cvp_nitrosamine",
  "cvp_pgi",
  "cvp_process_line",
  "cvp_manufacturing_area",
  "cvp_overall_results",
  "cvp_testing_procedure",
  "cvp_method_validation",
  "cvp_evaluation",
  "cvp_deviations",
  "cvp_revalidation",
  "cvp_abbreviations",
  "cvp_related_documents",
  "cvp_annexures",
  "cvp_history",
] as const;

export type CvpSectionKey = (typeof CVP_SECTION_KEYS)[number];

export type CvpNarrativeContent = { narrative: JSONContent };
export type CvpTableContent = { table: JSONContent };
export type CvpEquipmentSamplingContent = { items: JSONContent[] };
export type CvpSectionContent =
  | CvpNarrativeContent
  | CvpTableContent
  | CvpEquipmentSamplingContent;

export const CVP_TABLE_SECTION_KEYS = [
  "cvp_approvals",
  "cvp_responsibilities",
  "cvp_qualification_status",
  "cvp_surface_area",
  "cvp_nitrosamine",
  "cvp_pgi",
  "cvp_process_line",
  "cvp_manufacturing_area",
  "cvp_testing_procedure",
  "cvp_method_validation",
  "cvp_abbreviations",
  "cvp_related_documents",
  "cvp_annexures",
  "cvp_history",
] as const satisfies readonly CvpSectionKey[];

export type CvpTableSectionKey = (typeof CVP_TABLE_SECTION_KEYS)[number];

const TABLE_KEY_SET: ReadonlySet<string> = new Set(CVP_TABLE_SECTION_KEYS);

export function isCvpSectionKey(key: string): key is CvpSectionKey {
  return (CVP_SECTION_KEYS as readonly string[]).includes(key);
}

export function isCvpTableSectionKey(key: string): key is CvpTableSectionKey {
  return TABLE_KEY_SET.has(key);
}

export const CVP_SECTION_LABELS: Record<CvpSectionKey, string> = {
  cvp_approvals: "1.0 Approval Signatures",
  cvp_objective: "2.0 Objective",
  cvp_scope: "3.0 Scope",
  cvp_responsibilities: "4.0 Responsibilities",
  cvp_background: "5.0 Background and Cleaning Procedure",
  cvp_prerequisites: "6.0 Pre-requisites",
  cvp_qualification_status: "7.0 Equipment Qualification Status",
  cvp_surface_area: "8.0 Surface Area of the Equipment",
  cvp_rinse_volume: "9.0 Rinse Volume Calculation",
  cvp_maco: "10.0 Maximum Allowable Carryover (MACO)",
  cvp_acceptance_limits: "11.0 Acceptance Limit Calculation (Swab and Rinse)",
  cvp_methodology: "12.0 Cleaning Verification Methodology",
  cvp_sampling_procedure: "13.0 Sampling Procedure",
  cvp_swab_locations: "14.0 Determination of Swab Sample Locations",
  cvp_sampling_plan:
    "15.0 Sampling Plan, Acceptance Criteria and Cleaning Validation Results Summary",
  cvp_equipment_sampling: "Equipment sampling",
  cvp_nitrosamine: "Nitrosamine Limits in the Rinse Samples",
  cvp_pgi: "Potential Genotoxic Impurities Limits in the Rinse Samples",
  cvp_process_line: "Process Line Cleaning Verification Summary",
  cvp_manufacturing_area: "Manufacturing Area Cleaning Verification",
  cvp_overall_results: "Overall Cleaning Results Summary",
  cvp_testing_procedure: "16.0 Testing Procedure",
  cvp_method_validation: "17.0 Status of Cleaning Analytical Method Validation",
  cvp_evaluation: "18.0 Evaluation of Results and Reporting",
  cvp_deviations: "19.0 Deviations",
  cvp_revalidation: "20.0 Revalidation",
  cvp_abbreviations: "21.0 Abbreviations",
  cvp_related_documents: "22.0 Related Documents",
  cvp_annexures: "23.0 List of Annexures",
  cvp_history: "24.0 History of the Document",
};

export const CVP_APPROVAL_HEADERS = [
  "Function",
  "Department",
  "Name",
  "Designation",
  "Sign & date",
] as const;

export const CVP_SCOPE_HEADERS = [
  "S. No.",
  "Name of the Equipment",
  "Equipment No.",
  "Capacity",
  "MOC",
  "Purpose",
  "Product contact / Non-product contact",
] as const;

export const CVP_RESPONSIBILITY_HEADERS = [
  "Department",
  "Responsibility",
] as const;

export const CVP_CLEANING_METHOD_HEADERS = [
  "S. No",
  "Name of the Equipment",
  "Equipment No.",
  "Cleaning Method (BCR No.)",
  "Cleaning Solvent",
] as const;

export const CVP_QUALIFICATION_HEADERS = [
  "Equipment No.",
  "IQ protocol No. & Effective date",
  "IQ report No. & Effective date",
  "OQ protocol No. & Effective date",
  "OQ report No. & Effective date",
  "PQ protocol No. & Effective date",
  "PQ report No. & Effective date",
] as const;

export const CVP_SURFACE_AREA_HEADERS = [
  "S. No",
  "Name of the Equipment",
  "Equipment No.",
  "Internal surface area (m²)",
] as const;

export const CVP_WAF_HEADERS = ["S. No", "Surface Type", "WAF (L/m²)"] as const;

export const CVP_RINSE_CALC_HEADERS = [
  "S. No",
  "Name of the Equipment",
  "Equipment No.",
  "Capacity",
  "Internal surface area (m²)",
  "Rinse volume RF (L) SA × RF",
  "Rinse volume SAF (L) SA × SAF × SF",
  "Considered volume",
  "Rinse sample quantity",
] as const;

export const CVP_MACO_EQUIPMENT_HEADERS = [
  "S. No.",
  "Name of the Equipment",
  "Equipment No.",
  "Capacity",
  "MOC",
  "Is used for Stage-4?",
  "Equipment used previous / subsequent to this product",
  "Minimum batch size for this equipment manufactured",
  "Product contact / Non-product contact",
] as const;

/** Earlier seed labels, rewritten onto the protocol wording above. */
const PREVIOUS_MACO_EQUIPMENT_HEADER_LABELS: Readonly<Record<string, string>> = {
  "used for this stage?": "Is used for Stage-4?",
  "used previous / subsequent to this product?":
    "Equipment used previous / subsequent to this product",
  "minimum batch size": "Minimum batch size for this equipment manufactured",
};

export const CVP_MACO_FORMULA_HEADERS = [
  "Attribute",
  "Description of Attribute",
  "Value / Calculation",
] as const;

export const CVP_ACCEPTANCE_RINSE_HEADERS = [
  "Equipment ID",
  "Surface area (m²)",
  "Allowable carryover (mg)",
  "Rinse volume (L)",
  "Rinse acceptance criteria (ppm)",
  "Final rinse acceptance criteria (ppm)",
] as const;

export const CVP_NITROSAMINE_HEADERS = [
  "Equipment Name",
  "Equipment ID",
  "NDMA",
  "NMBA",
  "NDEA",
  "NEIPA",
  "NDIPA",
  "NMPA",
  "NDBA",
] as const;

export const CVP_PGI_HEADERS = [
  "Equipment Name",
  "Equipment ID",
  "O-Nitro Toluene",
  "P-Nitro Toluene",
  "Mesityl oxide",
] as const;

export const CVP_PROCESS_LINE_HEADERS = [
  "Process Line Description",
  "Production Person Observation",
  "QA Person Observation",
] as const;

export const CVP_MANUFACTURING_AREA_HEADERS = [
  "Equipment ID",
  "Verified by",
  "Floor Surrounding Equipment",
  "Wall Adjacent to Equipment",
  "Ceiling Above Equipment",
  "AHU Grills / Diffusers",
  "Equipment External Surface",
  "Wipe Cloth Observation (Production / QA)",
  "Overall Result",
  "Sign & date",
] as const;

export const CVP_OVERALL_RESULTS_HEADERS = [
  "Sr. No.",
  "Equipment ID",
  "Visual Inspection",
  "Swab Samples",
  "Rinse Sample",
  "Extraneous Matter",
  "Nitrosamine",
  "PGI",
  "Visual inspection of Mfg. area",
  "Overall Status",
  "Remarks",
] as const;

export const CVP_OVERALL_CRITERIA_HEADERS = [
  "Parameter",
  "Acceptance Criteria",
] as const;

export const CVP_TESTING_HEADERS = [
  "Test parameter",
  "Specification No.",
  "Testing Method No.",
  "LOQ",
  "LOD",
  "Swab recovery",
] as const;

export const CVP_METHOD_VALIDATION_HEADERS = [
  "Test parameter",
  "Testing Method No.",
  "Method validation protocol No.",
  "Approved date",
  "Method validation Report No.",
  "Approved date (report)",
  "Status",
] as const;

export const CVP_ABBREVIATION_HEADERS = ["Abbreviation", "Description"] as const;

export const CVP_DOCUMENT_LIST_HEADERS = [
  "S. No.",
  "Document Title",
  "Document Number",
] as const;

export const CVP_HISTORY_HEADERS = [
  "Version number",
  "Effective date",
  "Reason for revision",
] as const;

export const CVP_EQUIPMENT_IDENTITY_HEADERS = [
  "Parameter",
  "Details",
  "Reference",
] as const;

export const CVP_EQUIPMENT_DOCUMENTS_HEADERS = [
  "Documents",
  "Document #",
  "Effective / Approval date",
] as const;

export const CVP_SWAB_LOCATION_HEADERS = [
  "Location ID",
  "Description of location",
] as const;

export const CVP_SHELL_CALC_HEADERS = [
  "Parameter",
  "Calculation",
  "Value",
  "Remarks",
] as const;

export const CVP_SWAB_RATIONALE_HEADERS = [
  "Swab ID",
  "Description",
  "Rationale",
  "No. of samples",
] as const;

export const CVP_CLEANING_OPERATION_HEADERS = [
  "Cleaning Parameter",
  "Acceptance Criteria / Target",
  "Batch No.",
] as const;

export const CVP_VISUAL_INSPECTION_HEADERS = [
  "Sample description / location",
  "Results",
] as const;

export const CVP_RESIDUE_RESULTS_HEADERS = [
  "Sample description / location",
  "Sample ID",
  "Results",
] as const;

export const CVP_EXTRANEOUS_RESULTS_HEADERS = [
  "Sample description / location",
  "Sample ID",
  "Results (Extraneous matter)",
] as const;

/**
 * Possible 15.N.M headings (Word import + Agent recipes). The empty box
 * seeds the shared 15.N.1 / .2 / .5 / .7 / .8 boilerplate; 15.N.3 / .4 / .6
 * are added per equipment type.
 */
export const CVP_EQUIPMENT_H3_OUTLINE = [
  { number: "15.1.1", title: "Equipment details" },
  { number: "15.1.2", title: "Supporting Documents and References" },
  { number: "15.1.3", title: "Swab sampling locations determination" },
  { number: "15.1.4", title: "Cleaning operation results summary" },
  { number: "15.1.5", title: "Cleaning validation results summary" },
  { number: "15.1.6", title: "Visual inspection summary" },
  {
    number: "15.1.7",
    title: "Reflux, Swab & Rinse samples analysis results summary",
  },
  {
    number: "15.1.8",
    title: "Rinse samples analysis results summary (Extraneous matter)",
  },
] as const;

export const CVP_EQUIPMENT_H4_OUTLINE = [
  { number: "15.1.3.1", title: "Worst-case locations" },
  { number: "15.1.3.2", title: "Calculation for shell wall swab locations" },
  { number: "15.1.3.3", title: "Pictorial representation" },
  { number: "15.1.3.4", title: "Rationale for swab sample locations" },
] as const;

export const CVP_TABLE_HEADERS: Record<CvpTableSectionKey, readonly string[]> = {
  cvp_approvals: CVP_APPROVAL_HEADERS,
  cvp_responsibilities: CVP_RESPONSIBILITY_HEADERS,
  cvp_qualification_status: CVP_QUALIFICATION_HEADERS,
  cvp_surface_area: CVP_SURFACE_AREA_HEADERS,
  cvp_nitrosamine: CVP_NITROSAMINE_HEADERS,
  cvp_pgi: CVP_PGI_HEADERS,
  cvp_process_line: CVP_PROCESS_LINE_HEADERS,
  cvp_manufacturing_area: CVP_MANUFACTURING_AREA_HEADERS,
  cvp_testing_procedure: CVP_TESTING_HEADERS,
  cvp_method_validation: CVP_METHOD_VALIDATION_HEADERS,
  cvp_abbreviations: CVP_ABBREVIATION_HEADERS,
  cvp_related_documents: CVP_DOCUMENT_LIST_HEADERS,
  cvp_annexures: CVP_DOCUMENT_LIST_HEADERS,
  cvp_history: CVP_HISTORY_HEADERS,
};

const CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null };

function heading(level: 2 | 3 | 4, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function nodePlain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodePlain).join("");
}

function replaceHeaderCellText(cell: JSONContent, text: string): JSONContent {
  const paragraph = cell.content?.find((node) => node.type === "paragraph");
  const textNode = paragraph?.content?.find((node) => node.type === "text");
  const nextText: JSONContent = textNode?.marks
    ? { type: "text", text, marks: textNode.marks }
    : { type: "text", text };
  return {
    ...cell,
    content: [{ type: "paragraph", content: [nextText] }],
  };
}

/**
 * MACO equipment-list headers follow the ISM Stage-4 protocol. Existing
 * drafts that still use the shorter seed labels are rewritten in place.
 */
export function alignCvpMacoEquipmentHeaders(doc: JSONContent): JSONContent {
  if (!doc.content) return doc;
  let changed = false;
  const content = doc.content.map((node) => {
    if (node.type !== "table" || !node.content?.[0]) return node;
    const header = node.content[0];
    const cells = header.content ?? [];
    const labels = cells.map((cell) =>
      nodePlain(cell).replace(/\s+/g, " ").trim().toLowerCase()
    );
    const equipmentList =
      labels.includes("name of the equipment") && labels.includes("moc");
    if (!equipmentList) return node;
    let rowChanged = false;
    const nextCells = cells.map((cell, index) => {
      const next = PREVIOUS_MACO_EQUIPMENT_HEADER_LABELS[labels[index] ?? ""];
      if (!next) return cell;
      rowChanged = true;
      return replaceHeaderCellText(cell, next);
    });
    if (!rowChanged) return node;
    changed = true;
    return {
      ...node,
      content: [{ ...header, content: nextCells }, ...node.content.slice(1)],
    };
  });
  return changed ? { ...doc, content } : doc;
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

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[] = []
): JSONContent {
  const body = rows.length ? rows : [headers.map(() => "")];
  return {
    type: "table",
    content: [
      { type: "tableRow", content: headers.map((h) => cell("tableHeader", h)) },
      ...body.map((row) => ({
        type: "tableRow" as const,
        content: headers.map((_, i) => cell("tableCell", row[i] ?? "")),
      })),
    ],
  };
}

function tableDoc(
  headers: readonly string[],
  rows: readonly (readonly string[])[] = []
): JSONContent {
  return { type: "doc", content: [table(headers, rows)] };
}

function narrativeDoc(
  paragraphs: readonly string[],
  tables: JSONContent[] = []
): JSONContent {
  return {
    type: "doc",
    content: [
      ...paragraphs.map((p) => textParagraph(p)),
      ...tables,
    ],
  };
}

const APPROVAL_ROWS = [
  ["Prepared by", "Quality Assurance", "", "", ""],
  ["Reviewed by", "Production", "", "", ""],
  ["", "Technology Transfer", "", "", ""],
  ["", "Quality Control", "", "", ""],
  ["", "Engineering", "", "", ""],
  ["", "Quality Assurance", "", "", ""],
  ["Approved by", "Quality Assurance", "", "", ""],
] as const;

const RESPONSIBILITY_ROWS = [
  [
    "Quality Assurance",
    "Preparation and review of the Cleaning Verification Protocol; verification of visual inspection and sampling; review of results and approval of the report.",
  ],
  [
    "Production",
    "Execution of the cleaning activity; collection of swab and rinse samples as defined in this protocol; visual inspection of equipment and manufacturing area.",
  ],
  [
    "Quality Control",
    "Review and approval of the protocol as applicable; analysis of swab and rinse samples using approved methods; reporting of results.",
  ],
  [
    "Head / In-Charge (Technical Services)",
    "Review and approval of the Cleaning Verification Protocol; technical support for equipment and process understanding.",
  ],
  [
    "Engineering",
    "Review of the protocol and support for equipment drawings, surface-area data, and utility readiness.",
  ],
  [
    "Head-Quality",
    "Approval of the Cleaning Verification Protocol and the cleaning verification report.",
  ],
] as const;

const WAF_ROWS = [
  ["1", "Polished Stainless Steel", "0.1-0.3"],
  ["2", "Rough Stainless Steel", "0.3-0.6"],
  ["3", "Glass Lined", "0.2-0.5"],
  ["4", "PTFE / Halar surface", "0.1-0.3"],
] as const;

const PDE_ROWS = [
  ["PDE", "PDE value of the previous / worst-case residue (mg/day)", ""],
  ["MBS", "Minimum batch size of the subsequent product (mg)", ""],
  ["TDD", "Therapeutic daily dose of the subsequent product (mg)", ""],
  ["MACO", "PDE × MBS / TDD", ""],
] as const;

const MAXCONC_ROWS = [
  ["MAXCONC", "Allowable carryover limit (ppm or mg/kg)", ""],
  ["MBS", "Minimum batch size considered (kg)", ""],
  ["MACO", "MBS × MAXCONC", ""],
] as const;

const SWAB_LIMIT_ROWS = [
  ["Equipment Surface Area", "Total surface area of the shared equipment train (m²)", ""],
  [
    "Acceptance Limit per m²",
    "MACO ÷ total surface area",
    "",
  ],
  ["Swab size", "Absorbent area of the swab (m² or cm²)", ""],
  ["Swab Limits", "Acceptance limit per m² × swab size", ""],
  ["Diluent Volume (ml)", "Solvent volume used to prepare the swab sample", ""],
  [
    "Acceptance Limit per Equipment (ppm)",
    "Swab limit (mg) × 1000 ÷ diluent volume (ml)",
    "",
  ],
] as const;

const OVERALL_CRITERIA_ROWS = [
  [
    "Visual Inspection",
    "No visible residue, stain, foreign matter, or product traces",
  ],
  ["Product Residue in Swab/Rinse Samples", ""],
  ["Extraneous Matter", ""],
  ["Nitrosamine", ""],
  ["Potential genotoxic impurities", ""],
] as const;

const ABBREVIATION_ROWS = [
  ["CVRP", "Cleaning Verification Protocol"],
  ["MACO", "Maximum Allowable Carryover"],
  ["PDE", "Permitted Daily Exposure"],
  ["TDD", "Therapeutic Daily Dose"],
  ["MBS", "Minimum Batch Size"],
  ["WAF", "Worst-case Area Factor"],
  ["SAF", "Safety Factor"],
  ["RF", "Rinse Factor"],
  ["BCR", "Batch Cleaning Record"],
  ["MOC", "Material of Construction"],
  ["GLR", "Glass Lined Reactor"],
  ["SSR", "Stainless Steel Reactor"],
  ["ANF", "Agitated Nutsche Filter"],
  ["ANFD", "Agitated Nutsche Filter cum Drier"],
  ["PFR", "Plug Flow Reactor"],
  ["ppm", "Parts per million"],
  ["LOQ", "Limit of Quantitation"],
  ["LOD", "Limit of Detection"],
  ["PGI", "Potential Genotoxic Impurity"],
  ["NDMA", "N-Nitrosodimethylamine"],
  ["SOP", "Standard Operating Procedure"],
  ["GMP", "Good Manufacturing Practice"],
] as const;

const ANNEXURE_ROWS = [
  ["1", "Surface area calculation for process lines", ""],
  ["2", "PDE report", ""],
  ["3", "Reference guideline for TDD value", ""],
  ["4", "Cleaning process flow chart", ""],
] as const;

export const CVP_STANDARD_SWAB_LEVELS =
  "For equipment having a shell height of ≤ 2 m, a minimum of one horizontal sampling level shall be considered (middle level). For equipment having a shell height of > 2 m, the number of horizontal sampling levels is n = √H + 1, rounded up to the next whole number, where H is the equipment shell height in metres. The additional “+1” ensures adequate coverage of the shell surface. For vessels with a diameter ≤ 1 m, sample at two circumferential locations (0° and 180°) at each level. For vessels with a diameter > 1 m, sample at four circumferential locations (0°, 90°, 180°, and 270°) at each level.";

/** Shared 15.N intro — fill [Plant] / FMEA / [duty] from cited pages. */
export const CVP_EQUIPMENT_INTRO_SEED =
  "The subject equipment is located in [Plant], a multipurpose manufacturing facility. The equipment is qualified for its intended use, and the cleaning validation approach, including sampling locations, has been established based on the approved FMEA (Ref. No. FMEA/[Equipment ID]-00). This equipment is used in [product/stage] manufacturing for [duty].";

export const CVP_EQUIPMENT_DETAILS_SEED =
  "The equipment details, including Material of Construction (MOC), product contact surface area, shell height, and shell diameter, shall be taken from CPDR Annexure-2 and the applicable equipment qualification documents.";

export const CVP_EQUIPMENT_RESIDUE_INTRO_SEED =
  "The following table summarizes the sampling locations and results for [analyte] residue analysis during the cleaning verification study. Results from the verification run shall be compared against the established acceptance criterion of NMT [limit].";

export const CVP_EQUIPMENT_EXTRANEOUS_INTRO_SEED =
  "As part of the cleaning verification study, final rinse samples shall be evaluated for extraneous matter to confirm that the cleaning process effectively removes visible foreign contaminants from product-contact surfaces. The examination shall include assessment for black particles, fibers, and other extraneous matter. The results shall be evaluated against the acceptance criterion that no black or fiber particles are observed in the rinse samples.";

export function cvpEquipmentSamplingSeed(ordinal = 1): JSONContent {
  const n = `15.${ordinal}`;
  return {
    type: "doc",
    content: [
      heading(2, `${n} Equipment name (Equipment No.)`),
      textParagraph(
        "Fill this box in place for the Scope item — do not draft_field (the seed already has the shared 15.N headings and boilerplate). Add 15.N.3 / 15.N.6 from the equipment-type recipe when the item is swabbed. Add equipment for each additional product-contact item in Scope — each new box is a blank 15.N template. Numbering (15.1, 15.2, …) updates automatically. Copy capacity, MOC, surface area, and cited document numbers from CPDR / IQ / specification pages. Do not paste equipment-train diagrams or vessel sketches."
      ),
      textParagraph(CVP_EQUIPMENT_INTRO_SEED),
      heading(3, `${n}.1 Equipment details`),
      textParagraph(CVP_EQUIPMENT_DETAILS_SEED),
      table(CVP_EQUIPMENT_IDENTITY_HEADERS, [
        ["Capacity", "", ""],
        ["MOC", "", ""],
        ["Surface Area", "", ""],
      ]),
      heading(3, `${n}.2 Supporting Documents and References`),
      table(CVP_EQUIPMENT_DOCUMENTS_HEADERS, [
        ["BCR", "", ""],
        ["Specification", "", ""],
        ["Testing Procedure", "", ""],
        ["Analytical Method Validation", "", ""],
        ["Equipment Qualification", "", ""],
      ]),
      heading(3, `${n}.5 Cleaning validation results summary`),
      heading(
        3,
        `${n}.7 Swab & Rinse samples analysis results summary`
      ),
      textParagraph(CVP_EQUIPMENT_RESIDUE_INTRO_SEED),
      table(CVP_RESIDUE_RESULTS_HEADERS, [
        ["", "", ""],
        ["Limit", "", ""],
        ["LOQ", "", ""],
        ["LOD", "", ""],
      ]),
      heading(
        3,
        `${n}.8 Rinse samples analysis results summary (Extraneous matter)`
      ),
      textParagraph(CVP_EQUIPMENT_EXTRANEOUS_INTRO_SEED),
      table(CVP_EXTRANEOUS_RESULTS_HEADERS, [
        ["Rinse Sample", "NA", ""],
        ["Limit", "Black and fiber particles should be absent", ""],
      ]),
      textParagraph("Inference:", true),
      textParagraph("It shall be written in the cleaning verification report."),
      textParagraph("Conclusion:", true),
      textParagraph("It shall be written in the cleaning verification report."),
    ],
  };
}

function paragraphPlain(node: JSONContent): string {
  return (node.content ?? [])
    .map((child) => (child.type === "text" ? child.text ?? "" : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function isStockEquipmentInstruction(text: string): boolean {
  return (
    /insert one heading plus tables/i.test(text) ||
    /repeat this 15\.n block/i.test(text) ||
    /duplicate this box/i.test(text) ||
    /add equipment for each additional/i.test(text) ||
    /the seed is only the identity table/i.test(text) ||
    /draft_field this box for the Scope item/i.test(text) ||
    /the seed already has the shared 15\.n headings/i.test(text) ||
    /fill this box in place for the Scope item/i.test(text) ||
    /do not paste equipment-train diagrams/i.test(text) ||
    /do not invent a diagram/i.test(text) ||
    /^Table\s+\d+\./i.test(text)
  );
}

function hasHeadingNode(doc: JSONContent): boolean {
  return (doc.content ?? []).some((node) => node.type === "heading");
}

function coerceEquipmentHeadingLevels(doc: JSONContent): JSONContent {
  return {
    type: "doc",
    content: (doc.content ?? []).map((node) => {
      if (node.type !== "heading") return node;
      const level = Number(node.attrs?.level);
      if (level >= 2 && level <= 4) return node;
      return { ...node, attrs: { ...node.attrs, level: 2 } };
    }),
  };
}

/**
 * Existing reports stored a single identity table with no 15.N.M headings.
 * Wrap that table in H2 + 15.N.1 only — do not graft unused swab/results
 * shells. Never put the seed back onto an empty or prose-only field.
 */
export function upgradeCvpEquipmentSamplingNarrative(
  doc: JSONContent
): JSONContent {
  if (hasHeadingNode(doc)) return coerceEquipmentHeadingLevels(doc);
  const liveNodes = doc.content ?? [];
  const unusedTables = liveNodes.filter((node) => node.type === "table");
  const leftover = liveNodes.filter(
    (node) =>
      node.type !== "table" &&
      paragraphPlain(node).length > 0 &&
      !isStockEquipmentInstruction(paragraphPlain(node))
  );
  if (unusedTables.length === 0) {
    return {
      type: "doc",
      content: liveNodes.length > 0 ? liveNodes : [{ type: "paragraph" }],
    };
  }
  return {
    type: "doc",
    content: [
      heading(2, "15.1 Equipment name (Equipment No.)"),
      heading(3, "15.1.1 Equipment details"),
      ...unusedTables,
      ...leftover,
    ],
  };
}

function emptyCvpContent(key: CvpSectionKey): CvpSectionContent {
  switch (key) {
    case "cvp_approvals":
      return { table: tableDoc(CVP_APPROVAL_HEADERS, APPROVAL_ROWS) };
    case "cvp_objective":
      return { narrative: emptyDoc() };
    case "cvp_scope":
      return {
        narrative: narrativeDoc(
          [
            "This protocol applies to the cleaning verification activities for the manufacturing equipment listed below, used in the production of the named product / stage at the stated plant.",
          ],
          [table(CVP_SCOPE_HEADERS)]
        ),
      };
    case "cvp_responsibilities":
      return { table: tableDoc(CVP_RESPONSIBILITY_HEADERS, RESPONSIBILITY_ROWS) };
    case "cvp_background":
      return {
        narrative: narrativeDoc(
          [
            "Describe the manufacturing train, the cleaning procedure (manual / CIP), and the solvents used. List each equipment with its Batch Cleaning Record number and cleaning solvent.",
          ],
          [table(CVP_CLEANING_METHOD_HEADERS)]
        ),
      };
    case "cvp_prerequisites":
      return {
        narrative: narrativeDoc([
          "Prior to initiating cleaning verification, the following criteria, but not limited to, must be met to ensure process readiness and compliance with GMP requirements:",
          "Critical Utilities & Support Systems: The utilities and support systems must be assessed and demonstrated as adequate to support the intended manufacturing process.",
          "Equipment Qualification: All equipment of the train, associated auxiliary systems, critical utilities and analytical instruments must be qualified and within their valid qualification / calibration status as detailed in Section 7.0.",
          "Standard Operating Procedures (SOPs): Approved and effective SOPs for the operation and cleaning of equipment involved in the manufacturing process must be available and implemented.",
          "Specifications & Analytical Methods: Approved specifications and validated methods of analysis for cleaning solvents, final intermediate and cleaning residues must be available.",
          "Batch Cleaning Record (BCRs) for cleaning must be prepared and approved before execution.",
          "Raw Material Compliance: All cleaning solvents must be sourced from approved vendors.",
        ]),
      };
    case "cvp_qualification_status":
      return { table: tableDoc(CVP_QUALIFICATION_HEADERS) };
    case "cvp_surface_area":
      return { table: tableDoc(CVP_SURFACE_AREA_HEADERS) };
    case "cvp_rinse_volume":
      return {
        narrative: narrativeDoc(
          [
            "The rinse volume for each equipment is established before the MACO and acceptance limit calculations, since the rinse acceptance limits (Section 11.0) are derived from the allowable carryover per equipment and the rinse volume.",
            "Rinse Volume (L) = Surface Area (m²) × Rinse Factor (L/m²).",
            "Rinse Factor typically ranges between 1–10 L/m²: 1–3 L/m² for easily soluble residues; 3–5 L/m² for moderately soluble residues; 5–10 L/m² for poorly soluble or potent residues. Copy the factor used from a cited cleaning-development or protocol page.",
            "Worst-case area factor (WAF) by surface type:",
          ],
          [table(CVP_WAF_HEADERS, WAF_ROWS), table(CVP_RINSE_CALC_HEADERS)]
        ),
      };
    case "cvp_maco":
      return {
        narrative: narrativeDoc(
          [
            "Maximum Allowable Carryover (MACO) ensures that the quality and safety of subsequent products are not compromised by residual contaminants from previous batches.",
            "Health-based MACO = PDE × MBS / TDD. General-limit MACO = MBS × MAXCONC. Select the lower of the two values for swab and rinse acceptance limits. Copy PDE, MBS, TDD and MAXCONC from cited annexures — do not invent them. Write each formula as a table row (Attribute | Description | Value); do not insert a drawing of the stacked fraction.",
          ],
          [
            table(CVP_MACO_EQUIPMENT_HEADERS),
            table(CVP_MACO_FORMULA_HEADERS, PDE_ROWS),
            table(CVP_MACO_FORMULA_HEADERS, MAXCONC_ROWS),
          ]
        ),
      };
    case "cvp_acceptance_limits":
      return {
        narrative: narrativeDoc(
          [
            "Allowable carryover per m² = MACO ÷ total surface area of the shared equipment train. Swab limit = (limit per m²) × swab area. Rinse limit (ppm) = allowable carryover per equipment (mg) ÷ rinse volume (L). Record the arithmetic in the Value / Calculation column from cited numbers in Sections 8.0–10.0.",
          ],
          [
            table(CVP_MACO_FORMULA_HEADERS, SWAB_LIMIT_ROWS),
            table(CVP_ACCEPTANCE_RINSE_HEADERS),
          ]
        ),
      };
    case "cvp_methodology":
      return {
        narrative: narrativeDoc([
          "Cleaning verification activities shall be performed in the following sequence for each cleaning run:",
          "Clean the equipment as per the approved Batch Cleaning Record.",
          "Perform visual inspection. If the equipment is not visually clean, sampling shall not be performed; the equipment shall be re-cleaned and the event recorded as a deviation.",
          "Visual Inspection: After the cleaning procedure is performed, the equipment shall be dried to allow the visual inspection. No residue shall be visible. Visual inspection shall be performed by Production and verified by QA.",
          "Collect the swab samples from the defined locations after the final rinse (refer Section 15.0).",
          "Collect the final rinse samples (refer Section 15.0) and the solvent control sample.",
          "Label the samples, record the sampling details and submit the samples to QC.",
          "Analyse the samples as per the testing procedures given in Sections 16.0 and 17.0.",
          "Evaluate the results against the acceptance criteria given in Section 15.0.",
        ]),
      };
    case "cvp_sampling_procedure":
      return {
        narrative: narrativeDoc([
          "This section defines methodologies for both swab and rinse sampling.",
          "Swab sampling using swab cloth: Use a new swab cloth (4 × 4 inches). Wear fresh gloves and do not touch the cloth directly. Immerse the cloth in the sample bottle containing the stated volume of cleaning-verification solvent, squeeze to remove excess solvent, and wipe the designated location with overlapping horizontal then vertical strokes. Place the used cloth back into the sample bottle.",
          "Swab sampling using swab stick: Take the stated diluent volume in the sample bottle. Diluent shall be the cleaning agent used in the final rinse.",
          "Rinse sampling: Collect the final rinse from the equipment discharge as defined per equipment in Section 15.0. Include a solvent control sample.",
          "The overlapping horizontal/vertical stroke figure in the source form is a drawing — describe the stroke pattern in prose. Do not claim a figure was inserted unless insert_image was used.",
        ]),
      };
    case "cvp_swab_locations":
      return {
        narrative: narrativeDoc([
          "Swab sampling shall be performed irrespective of equipment capacity or size. Product-contact surfaces that are difficult to clean, difficult to access, prone to residue accumulation, or represent worst-case cleaning locations shall be included.",
          "For reactors or other product-contact vessels, the top dish, bottom dish, manhole seating area, agitator assembly, discharge valve, and other identified worst-case product-contact surfaces shall be included as mandatory locations.",
          CVP_STANDARD_SWAB_LEVELS,
          "Vessel sketches with labelled S-1 / S-2 callouts are Word drawings in the source form. List each Location ID and description in the equipment sampling block; do not invent a diagram.",
        ]),
      };
    case "cvp_sampling_plan":
      return {
        narrative: narrativeDoc([
          "This section summarises the sampling plan, acceptance criteria, and results for each product-contact equipment in the train, followed by nitrosamine and potential genotoxic impurity limits, process-line and manufacturing-area verification, and the overall results table.",
        ]),
      };
    case "cvp_equipment_sampling":
      return { items: [cvpEquipmentSamplingSeed(1)] };
    case "cvp_nitrosamine":
      return {
        table: tableDoc(CVP_NITROSAMINE_HEADERS, [
          ["Limit NMT (ppm)", "", "", "", "", "", "", "", ""],
        ]),
      };
    case "cvp_pgi":
      return {
        table: tableDoc(CVP_PGI_HEADERS, [
          ["Limit NMT (ppm)", "", "", "", ""],
        ]),
      };
    case "cvp_process_line":
      return { table: tableDoc(CVP_PROCESS_LINE_HEADERS) };
    case "cvp_manufacturing_area":
      return { table: tableDoc(CVP_MANUFACTURING_AREA_HEADERS) };
    case "cvp_overall_results":
      return {
        narrative: narrativeDoc(
          [
            "Summarise visual, swab, rinse, extraneous matter, nitrosamine, PGI, and manufacturing-area status for each equipment. A second table holds the protocol’s overall acceptance criteria.",
          ],
          [
            table(CVP_OVERALL_RESULTS_HEADERS),
            table(CVP_OVERALL_CRITERIA_HEADERS, OVERALL_CRITERIA_ROWS),
          ]
        ),
      };
    case "cvp_testing_procedure":
      return { table: tableDoc(CVP_TESTING_HEADERS) };
    case "cvp_method_validation":
      return { table: tableDoc(CVP_METHOD_VALIDATION_HEADERS) };
    case "cvp_evaluation":
      return {
        narrative: narrativeDoc([
          "The cleaning procedure shall be considered verified when all cleaning results comply with the visual inspection, swab, rinse, extraneous matter, pH (wherever applicable), nitrosamine, and potential genotoxic impurities acceptance criteria defined in this protocol.",
          "Results below the LOQ shall be reported as “Less than LOQ” and results below the LOD as “Not detected”, along with the LOQ / LOD values.",
          "Any result exceeding the acceptance criteria shall be investigated as per the OOS / deviation SOP. The equipment shall be re-cleaned and re-sampled, and the run shall not be counted as a successful run unless the investigation justifies it.",
          "A cleaning verification report shall be prepared including the cleaning records, sampling details, analytical results with chromatograms, deviations, conclusion and recommendations, and shall be approved by QA.",
        ]),
      };
    case "cvp_deviations":
      return {
        narrative: narrativeDoc([
          "Any deviation observed during execution of this protocol shall be recorded, investigated and closed as per the deviation management SOP, with an impact assessment on the effectiveness of the cleaning procedure and appropriate CAPA where required.",
        ]),
      };
    case "cvp_revalidation":
      return {
        narrative: narrativeDoc([
          "Revalidation of the cleaning procedure shall be performed whenever changes occur that may impact the effectiveness of the validated cleaning process. Such changes include, but are not limited to, modifications to cleaning procedures, equipment, product mix, batch size, cleaning agents, or sampling / analytical methods. Copy the site SOP number for revalidation from a cited page when it is named.",
        ]),
      };
    case "cvp_abbreviations":
      return { table: tableDoc(CVP_ABBREVIATION_HEADERS, ABBREVIATION_ROWS) };
    case "cvp_related_documents":
      return { table: tableDoc(CVP_DOCUMENT_LIST_HEADERS) };
    case "cvp_annexures":
      return { table: tableDoc(CVP_DOCUMENT_LIST_HEADERS, ANNEXURE_ROWS) };
    case "cvp_history":
      return {
        table: tableDoc(CVP_HISTORY_HEADERS, [["00", "", "New document"]]),
      };
    default: {
      const exhaustive: never = key;
      throw new Error(`Unknown CVP section: ${String(exhaustive)}`);
    }
  }
}

export const EMPTY_CVP_CONTENT = Object.fromEntries(
  CVP_SECTION_KEYS.map((key) => [key, emptyCvpContent(key)])
) as Record<CvpSectionKey, CvpSectionContent>;

export type CvpMetadata = {
  productName: string;
  productCode: string;
  stage: string;
  plant: string;
  department: string;
  documentTitle: string;
  version: string;
  effectiveDate: string;
};

export const CVP_DEFAULT_METADATA: CvpMetadata = {
  productName: "",
  productCode: "",
  stage: "",
  plant: "",
  department: "Production",
  documentTitle: "",
  version: "00",
  effectiveDate: "",
};

export function cvpMetadataFrom(metadata: unknown): CvpMetadata {
  const raw =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const pick = (key: keyof CvpMetadata) =>
    typeof raw[key] === "string" ? (raw[key] as string) : CVP_DEFAULT_METADATA[key];
  return {
    productName: pick("productName"),
    productCode: pick("productCode"),
    stage: pick("stage"),
    plant: pick("plant"),
    department: pick("department"),
    documentTitle: pick("documentTitle"),
    version: pick("version"),
    effectiveDate: pick("effectiveDate"),
  };
}

export function cvpPrintedDocumentTitle(meta: CvpMetadata): string {
  const title = meta.documentTitle.trim();
  if (title) return title;
  const product = meta.productName.trim();
  if (!product) {
    return "Cleaning Verification Protocol for Equipment and Associated Auxiliary Systems";
  }
  return `Cleaning Verification Protocol for Equipment and Associated Auxiliary Systems Used in the Production of ${product}`;
}
