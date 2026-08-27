import type { JSONContent } from "@tiptap/core";
import { resolveColumns } from "@/lib/document-types/design-verification/matrix-columns";
import { extractRawRows } from "@/lib/document-types/design-verification/matrix-parser";
import { FMEA_COLUMN_SCHEMA, type FmeaColumnId } from "./matrix-columns";
import {
  computeRpn,
  formatComputedScore,
  formatYesNo,
  initialRiskAcceptable,
  parseLevel,
  parseScore,
  residualRiskAcceptable,
  rpnBand,
  rprBand,
  type AssessmentMode,
  type RiskBand,
} from "./scoring";

function findTable(doc: JSONContent | null | undefined): JSONContent | null {
  if (!doc) return null;
  if (doc.type === "table") return doc;
  for (const child of doc.content ?? []) {
    const found = findTable(child);
    if (found) return found;
  }
  return null;
}

function setCellText(cell: JSONContent, text: string): void {
  cell.content = [
    {
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    },
  ];
}

export type ComputedRisk = {
  band: RiskBand;
  rpn?: number;
  display: string;
  acceptable: string;
};

export function computeFromInputs(
  mode: AssessmentMode,
  severityRaw: string,
  probabilityRaw: string,
  detectabilityRaw: string,
  residual: boolean
): ComputedRisk | { error: string } | null {
  const sText = severityRaw.trim();
  const pText = probabilityRaw.trim();
  const dText = detectabilityRaw.trim();
  if (!sText && !pText && !dText) return null;

  if (mode === "quantitative") {
    const s = parseScore(sText);
    const p = parseScore(pText);
    const d = parseScore(dText);
    if (s == null || p == null || d == null) {
      return {
        error: "Severity, Probability and Detectability must each be 1–5",
      };
    }
    const rpn = computeRpn(s, p, d);
    const band = rpnBand(rpn);
    const acceptable = residual
      ? residualRiskAcceptable(band)
      : initialRiskAcceptable(band);
    return {
      band,
      rpn,
      display: formatComputedScore(mode, band, rpn),
      acceptable: formatYesNo(acceptable),
    };
  }

  const s = parseLevel(sText);
  const p = parseLevel(pText);
  const d = parseLevel(dText);
  if (s == null || p == null || d == null) {
    return {
      error: "Severity, Probability and Detectability must each be Low, Medium or High",
    };
  }
  const band = rprBand(s, p, d);
  const acceptable = residual
    ? residualRiskAcceptable(band)
    : initialRiskAcceptable(band);
  return {
    band,
    display: formatComputedScore(mode, band),
    acceptable: formatYesNo(acceptable),
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Writes RPN/RPR and Yes/No cells. Does not mutate the input document. */
export function recalculateFmeaTable(
  doc: JSONContent | null | undefined,
  mode: AssessmentMode
): { doc: JSONContent; errors: string[] } {
  const cloned = cloneJson(doc ?? { type: "doc", content: [] });
  const table = findTable(cloned);
  const errors: string[] = [];
  if (!table?.content) return { doc: cloned, errors: ["No FMEA table found"] };

  const raw = extractRawRows(cloned);
  if ("error" in raw) return { doc: cloned, errors: [raw.error] };

  const resolution = resolveColumns<FmeaColumnId>(
    raw.headers,
    raw.dataRows,
    FMEA_COLUMN_SCHEMA
  );
  const rows = table.content.filter((n) => n.type === "tableRow");

  rows.slice(1).forEach((row, i) => {
    const cells = row.content ?? [];
    const data = raw.dataRows[i] ?? [];
    const pick = (id: FmeaColumnId) => {
      const idx = resolution.indices[id];
      return idx == null ? "" : (data[idx] ?? "");
    };
    const write = (id: FmeaColumnId, text: string) => {
      const idx = resolution.indices[id];
      if (idx == null || !cells[idx]) return;
      setCellText(cells[idx], text);
    };

    const initial = computeFromInputs(
      mode,
      pick("severity"),
      pick("probability"),
      pick("detectability"),
      false
    );
    if (initial && "error" in initial) {
      errors.push(`Row ${i + 1}: ${initial.error}`);
    } else if (initial) {
      write("rpn", initial.display);
      write("acceptable", initial.acceptable);
    }

    const residual = computeFromInputs(
      mode,
      pick("revisedSeverity"),
      pick("revisedProbability"),
      pick("revisedDetectability"),
      true
    );
    if (residual && "error" in residual) {
      errors.push(`Row ${i + 1} revised: ${residual.error}`);
    } else if (residual) {
      write("finalRpn", residual.display);
      write("finalAcceptable", residual.acceptable);
    }
  });

  return { doc: cloned, errors };
}

export function normalizeComputedCell(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}
