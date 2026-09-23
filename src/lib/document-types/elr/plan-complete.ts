/**
 * MJ ELR remaining-section completeness. Evidence sections are not done
 * after the table alone — the assessment (and trend / grade / recommendation
 * siblings) has to land in the same turn. Investigation / DV keys never match.
 */

import { recommendationHasSchedule } from "./recommendation-schedule";
import { continuationPageNumber } from "@/lib/ai/chat/page-continuation";

export const ELR_ASSESSMENT_SECTIONS = [
  "elr_qualification",
  "elr_media_fill",
  "elr_alarms",
  "elr_monitoring",
  "elr_calibration",
  "elr_preventive_maintenance",
  "elr_breakdowns",
  "elr_qms",
  "elr_access_control",
  "elr_audit_trail",
  "elr_csv_status",
] as const;

const TREND_SECTIONS = new Set(["elr_breakdowns", "elr_alarms"]);
const ASSESSMENT_SET = new Set<string>(ELR_ASSESSMENT_SECTIONS);
/** Privilege-matrix annexures that split across Page N of M. */
const ANNEXURE_SERIAL_SECTIONS = new Set(["elr_access_control"]);

const PLAN_EDIT_TOOLS = new Set(["draft_field", "edit_table", "propose_edit"]);

/** Tool results that actually persist a suggestion / rewrite. */
const PLAN_LANDED_STATUSES = new Set(["proposed", "drafted", "applied"]);

export function planEditOutputStatus(part: {
  output?: unknown;
  result?: unknown;
}): string {
  const raw = part.output ?? part.result;
  if (!raw || typeof raw !== "object") return "";
  const status = (raw as { status?: unknown }).status;
  return typeof status === "string" ? status.trim() : "";
}

/**
 * True when a remaining-section edit tool persisted. `review_incomplete` /
 * `unsupported_facts` still stream as `output-available` — they must not
 * mark QMS drafted or fire "Assistant is done with QMS Records".
 * Missing `output.status` (tests / in-progress finalize) still counts.
 */
export function planEditToolLanded(part: {
  state?: unknown;
  output?: unknown;
  result?: unknown;
}): boolean {
  const state = typeof part.state === "string" ? part.state : "";
  if (state === "output-error") return false;
  if (state !== "output-available" && state !== "") return false;
  const status = planEditOutputStatus(part);
  if (!status) return true;
  return PLAN_LANDED_STATUSES.has(status);
}

/** Extra fields that must be drafted before the remaining-section queue advances. */
export function elrPlanRequiredFields(
  section: string
): readonly string[] | null {
  if (section === "elr_risk_actions") return ["narrative", "overallGrade"];
  if (section === "elr_conclusion") {
    return ["narrative", "recommendation", "recommendationNarrative"];
  }
  if (section === "elr_system_trends") return ["narrative"];
  if (TREND_SECTIONS.has(section)) return ["narrative", "trend"];
  if (ASSESSMENT_SET.has(section)) return ["narrative"];
  return null;
}

type SectionEdit = {
  name: string;
  section: string;
  targetField: string;
  text: string;
  complete: boolean;
  input: Record<string, unknown> | null;
  bounced: boolean;
};

function toolNameFromPart(part: {
  type?: unknown;
  toolName?: unknown;
}): string {
  if (typeof part.toolName === "string" && part.toolName) return part.toolName;
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return "";
}

function editsFromParts(parts: unknown): SectionEdit[] {
  if (!Array.isArray(parts)) return [];
  const edits: SectionEdit[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const rec = part as {
      type?: unknown;
      toolName?: unknown;
      state?: unknown;
      input?: unknown;
      output?: unknown;
      result?: unknown;
    };
    const name = toolNameFromPart(rec);
    if (!PLAN_EDIT_TOOLS.has(name)) continue;
    const input = rec.input;
    if (!input || typeof input !== "object") continue;
    const section = (input as { section?: unknown }).section;
    if (typeof section !== "string" || !section.trim()) continue;
    const targetFieldRaw = (input as { targetField?: unknown }).targetField;
    const targetField =
      typeof targetFieldRaw === "string" ? targetFieldRaw.trim() : "";
    const markdown = (input as { markdown?: unknown }).markdown;
    const insertText = (input as { insertText?: unknown }).insertText;
    const text =
      typeof markdown === "string"
        ? markdown
        : typeof insertText === "string"
          ? insertText
          : "";
    const state = typeof rec.state === "string" ? rec.state : "";
    if (state === "output-error") continue;
    const complete = planEditToolLanded(rec);
    edits.push({
      name,
      section: section.trim(),
      targetField,
      text,
      complete,
      input: input as Record<string, unknown>,
      bounced: state === "output-available" && !complete,
    });
  }
  return edits;
}

function sectionCompleteFromEdits(
  section: string,
  edits: readonly SectionEdit[],
  parts?: unknown
): boolean {
  const required = elrPlanRequiredFields(section);
  if (!required) return true;
  const mineAll = edits.filter((edit) => edit.section === section);
  const mine = mineAll.filter((edit) => edit.complete);
  if (mineAll.length === 0) return true;
  if (mineAll.some((edit) => edit.bounced)) return false;
  if (mine.length === 0) return true;
  for (const field of required) {
    const hit = mine.some(
      (edit) =>
        (edit.name === "draft_field" || edit.name === "propose_edit") &&
        edit.targetField === field
    );
    if (!hit) return false;
  }
  if (required.includes("narrative") && mine.some((edit) => edit.name === "edit_table")) {
    const narrative = mine.find(
      (edit) =>
        (edit.name === "draft_field" || edit.name === "propose_edit") &&
        edit.targetField === "narrative"
    );
    // 5.1 narrative is a cross-cutting synthesis, not a count assessment.
    if (section !== "elr_system_trends" && (!narrative || !/\d/.test(narrative.text))) {
      return false;
    }
    if (section === "elr_system_trends" && !narrative) return false;
  }
  if (section === "elr_conclusion") {
    const recap = mine.find(
      (edit) =>
        (edit.name === "draft_field" || edit.name === "propose_edit") &&
        edit.targetField === "recommendationNarrative"
    );
    if (!recap || !recommendationHasSchedule(recap.text)) return false;
  }
  if (
    ANNEXURE_SERIAL_SECTIONS.has(section) &&
    !annexureCoverageComplete(section, mine, parts)
  ) {
    return false;
  }
  return true;
}

/** Sections edited this turn that still need assessment / trend / enum siblings. */
export function elrIncompleteSectionKeysFromParts(parts: unknown): string[] {
  const edits = editsFromParts(parts);
  const sections = [...new Set(edits.map((edit) => edit.section))];
  return sections.filter(
    (section) =>
      elrPlanRequiredFields(section) !== null &&
      !sectionCompleteFromEdits(section, edits, parts)
  );
}

export function elrPlanSectionCompleteFromParts(
  section: string,
  parts: unknown
): boolean {
  return sectionCompleteFromEdits(section, editsFromParts(parts), parts);
}

function parseSerialToken(text: string): number | null {
  const match = text.trim().match(/^(\d{1,3})\b/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function tableOperationFromInput(
  input: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!input) return null;
  const nested = input.operation;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  if (typeof input.kind === "string") return input;
  return null;
}

function serialsFromTableEdits(edits: readonly SectionEdit[]): number[] {
  const serials: number[] = [];
  for (const edit of edits) {
    if (edit.name !== "edit_table") continue;
    const operation = tableOperationFromInput(edit.input);
    if (!operation) continue;
    const kind = operation.kind;
    if (
      (kind === "insert_rows" || kind === "create_table") &&
      Array.isArray(operation.rows)
    ) {
      for (const row of operation.rows) {
        if (!Array.isArray(row) || typeof row[0] !== "string") continue;
        const serial = parseSerialToken(row[0]);
        if (serial != null) serials.push(serial);
      }
    }
    if (kind === "edit_cells" && Array.isArray(operation.cells)) {
      for (const cell of operation.cells) {
        if (!cell || typeof cell !== "object") continue;
        const rec = cell as { row?: unknown; col?: unknown; insertText?: unknown };
        if (rec.col !== 0 || typeof rec.row !== "number" || rec.row < 1) continue;
        if (typeof rec.insertText !== "string") continue;
        const serial = parseSerialToken(rec.insertText);
        if (serial != null) serials.push(serial);
      }
    }
  }
  return serials;
}

function serialsAreContiguousFromOne(serials: readonly number[]): boolean {
  if (serials.length === 0) return true;
  const unique = new Set(serials);
  const max = Math.max(...unique);
  for (let index = 1; index <= max; index += 1) {
    if (!unique.has(index)) return false;
  }
  return true;
}

function toolOutputFromPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return null;
  const rec = part as { output?: unknown; result?: unknown };
  return rec.output ?? rec.result ?? null;
}

function unwrapOutput(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const rec = output as Record<string, unknown>;
  if (
    rec.value !== undefined &&
    (rec.type === "json" || rec.type === "text")
  ) {
    return unwrapOutput(rec.value);
  }
  return rec;
}

type ContinuationNeed = {
  filename: string;
  pageNumber: number;
};

function continuationNeedsFromParts(parts: unknown): ContinuationNeed[] {
  if (!Array.isArray(parts)) return [];
  const needs: ContinuationNeed[] = [];
  const seen = new Set<string>();
  const add = (filename: string, pageNumber: number) => {
    const name = filename.trim();
    if (!name || !Number.isInteger(pageNumber) || pageNumber < 1) return;
    const key = `${name.toLowerCase()}|${pageNumber}`;
    if (seen.has(key)) return;
    seen.add(key);
    needs.push({ filename: name, pageNumber });
  };
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const name = toolNameFromPart(part as { type?: unknown; toolName?: unknown });
    const output = unwrapOutput(toolOutputFromPart(part));
    if (!output) continue;
    if (name === "read_document_page") {
      if (typeof output.nextPage === "number") {
        const page = output.page as { filename?: unknown } | undefined;
        const filename =
          typeof page?.filename === "string"
            ? page.filename
            : typeof output.continuation === "object" &&
                output.continuation &&
                "page" in output.continuation &&
                typeof (output.continuation as { page?: { filename?: unknown } }).page
                  ?.filename === "string"
              ? String(
                  (output.continuation as { page: { filename: string } }).page
                    .filename
                )
              : "";
        add(filename, output.nextPage);
      }
      const continuation = output.continuation as
        | { page?: { filename?: unknown; pageNumber?: unknown } }
        | undefined;
      if (
        continuation?.page &&
        typeof continuation.page.filename === "string" &&
        typeof continuation.page.pageNumber === "number"
      ) {
        add(continuation.page.filename, continuation.page.pageNumber);
      }
      const page = output.page as ContinuationPageLike | undefined;
      if (page && typeof page.pageNumber === "number") {
        const next = continuationPageNumber({
          pageNumber: page.pageNumber,
          transcript: typeof page.transcript === "string" ? page.transcript : null,
          pageContext: typeof page.pageContext === "string" ? page.pageContext : null,
        });
        if (next != null) {
          add(typeof page.filename === "string" ? page.filename : "", next);
        }
      }
    }
    if (name === "finish_document_review" && Array.isArray(output.findings)) {
      for (const finding of output.findings) {
        if (!finding || typeof finding !== "object") continue;
        const rec = finding as {
          filename?: unknown;
          pageNumber?: unknown;
          heading?: unknown;
          summary?: unknown;
        };
        if (typeof rec.pageNumber !== "number") continue;
        const next = continuationPageNumber({
          pageNumber: rec.pageNumber,
          heading: typeof rec.heading === "string" ? rec.heading : null,
          summary: typeof rec.summary === "string" ? rec.summary : null,
        });
        if (next != null) {
          add(typeof rec.filename === "string" ? rec.filename : "", next);
        }
      }
    }
  }
  return needs;
}

type ContinuationPageLike = {
  filename?: unknown;
  pageNumber?: unknown;
  transcript?: unknown;
  pageContext?: unknown;
};

function citedBlobFromEdits(edits: readonly SectionEdit[]): string {
  const chunks: string[] = [edits.map((edit) => edit.text).join("\n")];
  for (const edit of edits) {
    if (!edit.input) continue;
    chunks.push(JSON.stringify(edit.input));
  }
  return chunks.join("\n");
}

function editsCiteContinuation(
  blob: string,
  need: ContinuationNeed
): boolean {
  const pageRe = new RegExp(`p\\.\\s*${need.pageNumber}\\b`, "i");
  if (!pageRe.test(blob)) return false;
  if (!need.filename) return true;
  const stem = need.filename.replace(/\.[^.]+$/, "").toLowerCase();
  return blob.toLowerCase().includes(stem);
}

function annexureCoverageComplete(
  _section: string,
  edits: readonly SectionEdit[],
  parts: unknown
): boolean {
  const serials = serialsFromTableEdits(edits);
  if (serials.length > 0 && !serialsAreContiguousFromOne(serials)) {
    return false;
  }
  const blob = citedBlobFromEdits(edits);
  const needs = continuationNeedsFromParts(parts);
  for (const need of needs) {
    if (!editsCiteContinuation(blob, need)) return false;
  }
  return true;
}
