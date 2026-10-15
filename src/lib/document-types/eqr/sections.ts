import type { JSONContent } from "@tiptap/core";
import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";

/**
 * Demo-pack Equipment Qualification Report: the executed IQ / OQ / PQ of one
 * piece of equipment and its resulting qualified state. Equipment-agnostic.
 *
 * Every section is made of separate rich boxes: prose (`narrative`,
 * `statistics`) and fixed-schema tables (`table`, `parameters`, `attributes`,
 * `processWindow`). Prose and tables never share a field, so a prose redraft
 * cannot delete a seeded table and table header rows stay fixed.
 * Workspace labels stay unnumbered — the Word export numbers 1.0 … 13.0.
 */
export const EQR_SECTION_KEYS = [
  "eqr_purpose",
  "eqr_scope",
  "eqr_references",
  "eqr_equipment",
  "eqr_approach",
  "eqr_iq",
  "eqr_oq",
  "eqr_pq",
  "eqr_deviations",
  "eqr_conclusion",
  "eqr_ongoing_control",
  "eqr_attachments",
  "eqr_approvals",
] as const;

export type EqrSectionKey = (typeof EQR_SECTION_KEYS)[number];

export type EqrSectionContent = Record<string, JSONContent>;

export const EQR_SECTION_LABELS: Record<EqrSectionKey, string> = {
  eqr_purpose: "Purpose",
  eqr_scope: "Scope",
  eqr_references: "References",
  eqr_equipment: "Equipment Identification",
  eqr_approach: "Qualification Approach",
  eqr_iq: "Installation Qualification (IQ)",
  eqr_oq: "Operational Qualification (OQ)",
  eqr_pq: "Performance Qualification (PQ)",
  eqr_deviations: "Deviations",
  eqr_conclusion: "Conclusion and Qualified State",
  eqr_ongoing_control: "Ongoing Control and Requalification",
  eqr_attachments: "Attachments",
  eqr_approvals: "Approvals",
};

export function isEqrSectionKey(key: string): key is EqrSectionKey {
  return (EQR_SECTION_KEYS as readonly string[]).includes(key);
}

export type EqrField =
  | { key: string; label: string; kind: "prose" }
  | { key: string; label: string; kind: "table"; headers: readonly string[]; rows?: readonly (readonly string[])[] };

const prose = (key = "narrative", label = "Summary"): EqrField => ({ key, label, kind: "prose" });

export const EQR_INSTRUMENT_HEADERS = ["Instrument ID", "Description", "Used for", "Calibration due"] as const;

export const EQR_TEST_HEADERS = ["Test ID", "Test / check", "Acceptance criterion", "Result", "Pass / Fail", "Evidence"] as const;

/** Box layout per section, in display / export order. */
export const EQR_FIELDS: Record<EqrSectionKey, readonly EqrField[]> = {
  eqr_purpose: [prose()],
  eqr_scope: [prose()],
  eqr_references: [
    {
      key: "table",
      label: "References",
      kind: "table",
      headers: ["Document", "Number", "Revision"],
      rows: [
        ["Equipment qualification plan / protocols", "", ""],
        ["User requirements specification", "", ""],
        ["Process FMEA", "", ""],
        ["Governing SOPs and standards", "", ""],
      ],
    },
  ],
  eqr_equipment: [
    {
      key: "table",
      label: "Equipment identification",
      kind: "table",
      headers: ["Attribute", "Value"],
      rows: [
        ["Equipment ID", ""],
        ["Description", ""],
        ["Manufacturer / model", ""],
        ["Serial number", ""],
        ["Location", ""],
        ["Software / firmware version", ""],
        ["Impact classification", ""],
      ],
    },
  ],
  eqr_approach: [
    prose(),
    {
      key: "parameters",
      label: "Critical process parameters",
      kind: "table",
      headers: ["Parameter", "Unit", "Lower limit", "Nominal", "Upper limit", "Rationale (pFMEA ref.)"],
    },
    {
      key: "attributes",
      label: "Critical quality attributes",
      kind: "table",
      headers: ["Attribute", "Test method", "Acceptance criterion", "Sampling"],
    },
  ],
  eqr_iq: [prose(), { key: "table", label: "IQ tests", kind: "table", headers: EQR_TEST_HEADERS }],
  eqr_oq: [
    prose(),
    { key: "table", label: "OQ tests", kind: "table", headers: EQR_TEST_HEADERS },
    {
      key: "instruments",
      label: "Test instruments",
      kind: "table",
      headers: EQR_INSTRUMENT_HEADERS,
    },
    {
      key: "processWindow",
      label: "Process window challenge",
      kind: "table",
      headers: ["Run", "Settings", "Samples", "Result", "Pass / Fail"],
    },
  ],
  eqr_pq: [
    prose(),
    {
      key: "table",
      label: "PQ runs",
      kind: "table",
      headers: ["Run / lot", "Operator / shift", "Material lots", "Samples", "Result summary", "Pass / Fail"],
    },
    prose("statistics", "Statistical summary"),
  ],
  eqr_deviations: [
    prose(),
    {
      key: "table",
      label: "Deviation log",
      kind: "table",
      headers: ["Deviation No.", "Stage / test", "Description", "Impact on qualification", "Resolution", "Status"],
    },
  ],
  eqr_conclusion: [prose()],
  eqr_ongoing_control: [prose()],
  eqr_attachments: [prose()],
  eqr_approvals: [
    {
      key: "table",
      label: "Approvals",
      kind: "table",
      headers: ["Role", "Name", "Signature", "Date"],
      rows: [
        ["Prepared by (Engineering)", "", "", ""],
        ["Reviewed by (Manufacturing)", "", "", ""],
        ["Approved by (Quality)", "", "", ""],
      ],
    },
  ],
};

export function eqrFieldKeys(section: EqrSectionKey): string[] {
  return EQR_FIELDS[section].map((f) => f.key);
}

/** Fixed-schema table box: header row is the schema, never rewritten by chat. */
export function isEqrTableField(section: string, field: string): boolean {
  if (!isEqrSectionKey(section)) return false;
  return EQR_FIELDS[section].some((f) => f.key === field && f.kind === "table");
}

const CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null };

function paragraph(text = ""): JSONContent {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function table(headers: readonly string[], rows: readonly (readonly string[])[] = []): JSONContent {
  const body = rows.length ? rows : [headers.map(() => "")];
  const cell = (type: "tableHeader" | "tableCell", text: string): JSONContent => ({
    type,
    attrs: { ...CELL_ATTRS },
    content: [paragraph(text)],
  });
  return {
    type: "table",
    content: [
      { type: "tableRow", content: headers.map((h) => cell("tableHeader", h)) },
      ...body.map((row) => ({
        type: "tableRow",
        content: headers.map((_, i) => cell("tableCell", row[i] ?? "")),
      })),
    ],
  };
}

export function emptyEqrField(field: EqrField): JSONContent {
  return {
    type: "doc",
    content: [field.kind === "table" ? table(field.headers, field.rows) : paragraph()],
  };
}

/** Seeded content: the whitelabel template, equipment-agnostic. */
export function emptyEqrContent(key: EqrSectionKey): EqrSectionContent {
  return Object.fromEntries(EQR_FIELDS[key].map((f) => [f.key, emptyEqrField(f)]));
}

export const EMPTY_EQR_CONTENT: Record<EqrSectionKey, EqrSectionContent> = Object.fromEntries(
  EQR_SECTION_KEYS.map((key) => [key, emptyEqrContent(key)])
) as Record<EqrSectionKey, EqrSectionContent>;

/* ---------- deterministic checks ---------- */

type Verdict = { status: CriterionStatus; reasoning: string };

function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content.map(textOf).join(" ");
}

function fields(ctx: EvaluationContext): Record<string, JSONContent> {
  return (ctx.content as Record<string, JSONContent> | null | undefined) ?? {};
}

function layout(ctx: EvaluationContext): readonly EqrField[] {
  return isEqrSectionKey(ctx.section) ? EQR_FIELDS[ctx.section] : [];
}

/** The section's own prose boxes carry written content. */
export function checkProsePresent(ctx: EvaluationContext): Verdict {
  const content = fields(ctx);
  const text = layout(ctx)
    .filter((f) => f.kind === "prose")
    .map((f) => textOf(content[f.key]))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 20
    ? { status: "met", reasoning: "The section has written content." }
    : { status: "not_met", reasoning: "The section has no written content yet." };
}

/** Every body cell of every table box in the section is filled. */
export function checkTablesFilled(ctx: EvaluationContext): Verdict {
  const content = fields(ctx);
  let cells = 0;
  let filled = 0;
  for (const f of layout(ctx)) {
    if (f.kind !== "table") continue;
    for (const node of content[f.key]?.content ?? []) {
      if (node.type !== "table") continue;
      for (const row of node.content ?? []) {
        const rowCells = row.content ?? [];
        if (rowCells.every((c) => c.type === "tableHeader")) continue;
        for (const c of rowCells) {
          cells += 1;
          if (textOf(c).trim()) filled += 1;
        }
      }
    }
  }
  if (cells === 0 || filled === 0) return { status: "not_met", reasoning: "No table values are filled in." };
  if (filled < cells) {
    return { status: "partially_met", reasoning: `${cells - filled} of ${cells} table cell(s) are still empty.` };
  }
  return { status: "met", reasoning: `All ${cells} table cells are filled in.` };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ISO_DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
const DAY_MONTH_YEAR = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(20\d{2})\b/g;
const MONTH_DAY_YEAR = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g;

function iso(year: string, month: number, day: string): string | null {
  if (month < 1 || month > 12) return null;
  const d = Number(day);
  if (d < 1 || d > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

/** Dates in ISO, "2 September 2026" / "02-Sep-2026", or "September 2, 2026" form, as ISO. */
export function datesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ISO_DATE)) out.push(m[0]);
  for (const m of text.matchAll(DAY_MONTH_YEAR)) {
    const d = iso(m[3], monthIndex(m[2]), m[1]);
    if (d) out.push(d);
  }
  for (const m of text.matchAll(MONTH_DAY_YEAR)) {
    const d = iso(m[3], monthIndex(m[1]), m[2]);
    if (d) out.push(d);
  }
  return out;
}

function bodyRows(doc: JSONContent | undefined): string[][] {
  const rows: string[][] = [];
  for (const node of doc?.content ?? []) {
    if (node.type !== "table") continue;
    for (const row of node.content ?? []) {
      const cells = row.content ?? [];
      if (cells.every((c) => c.type === "tableHeader")) continue;
      rows.push(cells.map((c) => textOf(c).replace(/\[\d+(?:,\s*\d+)*\]/g, "").trim()));
    }
  }
  return rows;
}

/**
 * OQ instruments were in calibration on every execution date — or each one that
 * was not is recorded in Deviations (that is its disposition). Compares the
 * Test instruments table's due dates with the dates stated in the OQ write-up.
 */
export function checkInstrumentCalibration(ctx: EvaluationContext): Verdict {
  const content = fields(ctx);
  const instruments = bodyRows(content.instruments)
    .map((cells) => {
      const dueCell = datesIn(cells[3] ?? "");
      return {
        id: cells[0] ?? "",
        due: dueCell[0],
        // Any other date on the row (e.g. "expired before OQ on 2026-09-02") is execution evidence.
        others: [...cells.slice(0, 3).flatMap((c) => datesIn(c)), ...dueCell.slice(1)],
      };
    })
    .filter((row) => row.id);
  if (instruments.length === 0) {
    return { status: "not_met", reasoning: "The OQ test instruments and their calibration due dates are not listed." };
  }
  const undated = instruments.filter((i) => !i.due).map((i) => i.id);
  if (undated.length > 0) {
    return { status: "partially_met", reasoning: `No calibration due date for ${undated.join(", ")}.` };
  }
  const dueDates = new Set(instruments.map((i) => i.due as string));
  const executed = [
    ...datesIn(textOf(content.narrative)),
    ...bodyRows(content.table).flatMap((cells) => datesIn(cells.join(" "))),
    ...bodyRows(content.processWindow).flatMap((cells) => datesIn(cells.join(" "))),
    ...instruments.flatMap((i) => i.others),
  ].filter((d) => !dueDates.has(d));
  if (executed.length === 0) {
    return { status: "partially_met", reasoning: "The OQ execution dates are not stated, so calibration at execution cannot be confirmed." };
  }
  const lastRun = executed.sort().at(-1) as string;
  const expired = instruments.filter((i) => (i.due as string) < lastRun);
  if (expired.length === 0) {
    return { status: "met", reasoning: `All ${instruments.length} instruments were within calibration through ${lastRun}.` };
  }
  // Dependencies carry the whole section: every box, not one doc.
  const deviationBoxes = ctx.dependencies.eqr_deviations as Record<string, unknown> | undefined;
  const deviations = Object.values(deviationBoxes ?? {}).map(textOf).join(" ");
  const open = expired.filter((i) => !deviations.includes(i.id));
  const detail = expired.map((i) => `${i.id} (due ${i.due})`).join(", ");
  if (open.length === 0) {
    return {
      status: "met",
      reasoning: `${detail} was past calibration when OQ ran through ${lastRun}; this is recorded in Deviations with its disposition.`,
    };
  }
  return {
    status: "not_met",
    reasoning: `${open.map((i) => `${i.id} (due ${i.due})`).join(", ")} was past its calibration due date when OQ ran through ${lastRun}, and no deviation records it.`,
  };
}
