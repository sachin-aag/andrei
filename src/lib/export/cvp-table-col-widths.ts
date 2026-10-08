/**
 * Column widths (dxa) from QAD-SOP-PS-003-F08-00 Stage-4 source tables.
 * Matched at export by header row so stored reports without colWidths still
 * print the source grid instead of an equal split across the page.
 */
import {
  CVP_ABBREVIATION_HEADERS,
  CVP_ACCEPTANCE_RINSE_HEADERS,
  CVP_APPROVAL_HEADERS,
  CVP_CLEANING_METHOD_HEADERS,
  CVP_BATCH_EXECUTION_HEADERS,
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_DOCUMENT_LIST_HEADERS,
  CVP_EQUIPMENT_DOCUMENTS_HEADERS,
  CVP_EQUIPMENT_IDENTITY_HEADERS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_PREVIOUS_CLEANING_OPERATION_HEADERS,
  CVP_PREVIOUS_EXTRANEOUS_RESULTS_HEADERS,
  CVP_PREVIOUS_MANUFACTURING_AREA_HEADERS,
  CVP_PREVIOUS_NITROSAMINE_HEADERS,
  CVP_PREVIOUS_OVERALL_RESULTS_HEADERS,
  CVP_PREVIOUS_PGI_HEADERS,
  CVP_PREVIOUS_PROCESS_LINE_HEADERS,
  CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS,
  CVP_PREVIOUS_VISUAL_INSPECTION_HEADERS,
  CVP_HISTORY_HEADERS,
  CVP_MACO_EQUIPMENT_HEADERS,
  CVP_MACO_FORMULA_HEADERS,
  CVP_MANUFACTURING_AREA_HEADERS,
  CVP_METHOD_VALIDATION_HEADERS,
  CVP_NITROSAMINE_HEADERS,
  CVP_OVERALL_CRITERIA_HEADERS,
  CVP_OVERALL_RESULTS_HEADERS,
  CVP_PGI_HEADERS,
  CVP_PROCESS_LINE_HEADERS,
  CVP_QUALIFICATION_HEADERS,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_RESPONSIBILITY_HEADERS,
  CVP_RINSE_CALC_HEADERS,
  CVP_SCOPE_HEADERS,
  CVP_SHELL_CALC_HEADERS,
  CVP_SURFACE_AREA_HEADERS,
  CVP_SWAB_LOCATION_HEADERS,
  CVP_SWAB_RATIONALE_HEADERS,
  CVP_TESTING_HEADERS,
  CVP_VISUAL_INSPECTION_HEADERS,
  CVP_WAF_HEADERS,
} from "@/lib/document-types/cvp/sections";

const HEADER_STOP_WORDS = new Set([
  "a",
  "and",
  "for",
  "in",
  "no",
  "of",
  "on",
  "the",
  "to",
]);

type SourceTableWidths = {
  headers: readonly string[];
  widths: readonly number[];
};

const SOURCE_TABLE_WIDTHS: readonly SourceTableWidths[] = [
  { headers: CVP_APPROVAL_HEADERS, widths: [1524, 2340, 2225, 2020, 1773] },
  {
    headers: CVP_SCOPE_HEADERS,
    widths: [567, 1891, 1364, 1132, 1140, 2128, 1660],
  },
  { headers: CVP_RESPONSIBILITY_HEADERS, widths: [1460, 7900] },
  {
    headers: CVP_CLEANING_METHOD_HEADERS,
    widths: [810, 3150, 1440, 2466, 1504],
  },
  {
    headers: CVP_QUALIFICATION_HEADERS,
    widths: [1328, 1365, 1391, 1456, 1481, 1418, 1443],
  },
  {
    headers: CVP_SURFACE_AREA_HEADERS,
    widths: [1231, 3534, 1927, 3190],
  },
  { headers: CVP_WAF_HEADERS, widths: [838, 3251, 1996] },
  {
    headers: CVP_RINSE_CALC_HEADERS,
    widths: [460, 1172, 1172, 983, 915, 1407, 1595, 1194, 984],
  },
  {
    headers: [
      "S. No",
      "Name of the Equipment",
      "Equipment No.",
      "Capacity",
      "Internal surface area m²",
      "Rinsing Volume (L) based on RF Formula= SA X RF",
      "Rinsing Volume based on SAF Formula = SAXSAFXSF",
      "Considered volume",
      "Rinsing Sample Quantity",
    ],
    widths: [460, 1172, 1172, 983, 915, 1407, 1595, 1194, 984],
  },
  {
    headers: CVP_MACO_EQUIPMENT_HEADERS,
    widths: [595, 1514, 1269, 1060, 802, 802, 1125, 1405, 1310],
  },
  {
    headers: ["Attribute", "Description of Attribute", "Value"],
    widths: [1870, 4146, 3372],
  },
  {
    headers: ["Attribute", "Description of Attribute", "Calculation / MACO value"],
    widths: [1443, 5576, 2328],
  },
  {
    headers: CVP_MACO_FORMULA_HEADERS,
    widths: [1982, 5625, 2275],
  },
  {
    headers: ["Attribute", "Description", "Value / Calculation"],
    widths: [2605, 4951, 2326],
  },
  {
    headers: CVP_ACCEPTANCE_RINSE_HEADERS,
    widths: [2168, 1324, 1642, 963, 1336, 2449],
  },
  {
    headers: CVP_EQUIPMENT_IDENTITY_HEADERS,
    widths: [1763, 1130, 3096],
  },
  {
    headers: CVP_EQUIPMENT_DOCUMENTS_HEADERS,
    widths: [3162, 2963, 2783],
  },
  { headers: CVP_SWAB_LOCATION_HEADERS, widths: [1450, 3349] },
  { headers: CVP_SHELL_CALC_HEADERS, widths: [2688, 1403, 816, 4975] },
  {
    headers: CVP_SWAB_RATIONALE_HEADERS,
    widths: [1345, 2431, 5220, 886],
  },
  {
    headers: [
      "Swab ID. #",
      "Description",
      "Rationale (Based on operation and design of equipment)",
      "No. of samples",
    ],
    widths: [1345, 2431, 5220, 886],
  },
  {
    headers: CVP_PREVIOUS_CLEANING_OPERATION_HEADERS,
    widths: [2532, 2330, 5020],
  },
  {
    headers: CVP_CLEANING_OPERATION_HEADERS,
    widths: [2532, 2330, 1674, 1674, 1672],
  },
  {
    headers: [
      "Cleaning Parameter",
      "Acceptance Criteria / Target",
      "ISM1 Batch No.",
      "ISM2 Batch No.",
      "ISM3 Batch No.",
    ],
    widths: [2532, 2330, 1674, 1674, 1672],
  },
  { headers: CVP_PREVIOUS_VISUAL_INSPECTION_HEADERS, widths: [5724, 4158] },
  { headers: CVP_VISUAL_INSPECTION_HEADERS, widths: [5724, 1386, 1386, 1386] },
  { headers: CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS, widths: [5079, 1038, 3765] },
  { headers: CVP_RESIDUE_RESULTS_HEADERS, widths: [5079, 1038, 1255, 1255, 1255] },
  {
    headers: CVP_PREVIOUS_EXTRANEOUS_RESULTS_HEADERS,
    widths: [4494, 1214, 4097],
  },
  {
    headers: CVP_EXTRANEOUS_RESULTS_HEADERS,
    widths: [4494, 1214, 1366, 1366, 1365],
  },
  {
    headers: CVP_PREVIOUS_NITROSAMINE_HEADERS,
    widths: [1614, 1468, 976, 976, 976, 977, 977, 977, 941],
  },
  {
    headers: CVP_NITROSAMINE_HEADERS,
    widths: [1400, 1200, 700, 940, 940, 940, 940, 940, 940, 941],
  },
  {
    headers: [
      "Equipment Name",
      "Equipment ID",
      "Nitrosamine impurity limits in Rinse sample (in ppm)",
    ],
    widths: [1614, 1468, 6800],
  },
  { headers: CVP_PREVIOUS_PGI_HEADERS, widths: [2784, 2271, 1601, 1601, 1625] },
  { headers: CVP_PGI_HEADERS, widths: [2200, 1800, 700, 1601, 1601, 1625] },
  {
    headers: [
      "Equipment Name",
      "Equipment ID",
      "PGI limits in Rinse sample (in ppm)",
    ],
    widths: [2784, 2271, 4827],
  },
  {
    headers: CVP_PREVIOUS_PROCESS_LINE_HEADERS,
    widths: [3294, 3295, 3293],
  },
  {
    headers: CVP_PROCESS_LINE_HEADERS,
    widths: [2800, 800, 3295, 3293],
  },
  {
    headers: CVP_PREVIOUS_MANUFACTURING_AREA_HEADERS,
    widths: [1068, 1107, 1210, 1065, 1065, 889, 1065, 1164, 757, 492],
  },
  {
    headers: CVP_MANUFACTURING_AREA_HEADERS,
    widths: [900, 600, 1000, 1100, 1000, 1000, 800, 1000, 1100, 700, 682],
  },
  {
    headers: CVP_PREVIOUS_OVERALL_RESULTS_HEADERS,
    widths: [406, 1108, 1087, 883, 795, 1132, 1279, 476, 1006, 749, 961],
  },
  {
    headers: CVP_OVERALL_RESULTS_HEADERS,
    widths: [380, 900, 600, 980, 800, 720, 1020, 1150, 430, 900, 680, 880],
  },
  {
    headers: CVP_BATCH_EXECUTION_HEADERS,
    widths: [1000, 2200, 1600, 1600, 1800, 1682],
  },
  { headers: CVP_OVERALL_CRITERIA_HEADERS, widths: [4135, 5760] },
  {
    headers: CVP_TESTING_HEADERS,
    widths: [2385, 2306, 2306, 887, 889, 1109],
  },
  {
    headers: CVP_METHOD_VALIDATION_HEADERS,
    widths: [1497, 1040, 1470, 1470, 1470, 1470, 1465],
  },
  { headers: CVP_ABBREVIATION_HEADERS, widths: [2123, 7759] },
  { headers: CVP_DOCUMENT_LIST_HEADERS, widths: [618, 6617, 2057] },
  { headers: CVP_HISTORY_HEADERS, widths: [1579, 1260, 6210] },
];

function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/×/g, "x")
    .replace(/[#.(),:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerScore(actual: string, expected: string): number {
  const a = normalizeHeader(actual);
  const b = normalizeHeader(expected);
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.startsWith(b) || b.startsWith(a)) return 2;
  const tokensA = new Set(
    a.split(" ").filter((t) => t.length > 1 && !HEADER_STOP_WORDS.has(t))
  );
  const tokensB = new Set(
    b.split(" ").filter((t) => t.length > 1 && !HEADER_STOP_WORDS.has(t))
  );
  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) shared += 1;
  }
  if (shared >= 2) return 1;
  if (shared === 1 && Math.min(tokensA.size, tokensB.size) === 1) return 1;
  return 0;
}

function scoreHeaders(
  actual: readonly string[],
  expected: readonly string[]
): number | null {
  if (actual.length !== expected.length) return null;
  let score = 0;
  for (let i = 0; i < actual.length; i++) {
    const part = headerScore(actual[i]!, expected[i]!);
    if (part === 0) return null;
    score += part;
  }
  return score;
}

function batchOperationWidths(colCount: number): number[] | null {
  if (colCount < 3) return null;
  if (colCount === 3) return [2532, 2330, 5020];
  const rest = 5020;
  const n = colCount - 2;
  const per = Math.floor(rest / n);
  const widths = [2532, 2330, ...Array.from({ length: n }, () => per)];
  widths[widths.length - 1] += rest - per * n;
  return widths;
}

/**
 * Source-protocol grid widths for a table header row, or null when the
 * headers are not a known CVP form table.
 */
export function cvpSourceColWidthsForHeaders(
  headers: readonly string[]
): number[] | null {
  if (headers.length === 0) return null;

  let best: { score: number; widths: readonly number[] } | null = null;
  for (const entry of SOURCE_TABLE_WIDTHS) {
    const score = scoreHeaders(headers, entry.headers);
    if (score === null) continue;
    if (!best || score > best.score) {
      best = { score, widths: entry.widths };
    }
  }
  if (best) return [...best.widths];

  const first = normalizeHeader(headers[0] ?? "");
  const second = normalizeHeader(headers[1] ?? "");
  if (
    headers.length >= 3 &&
    first.includes("cleaning parameter") &&
    second.includes("acceptance")
  ) {
    return batchOperationWidths(headers.length);
  }

  return null;
}
