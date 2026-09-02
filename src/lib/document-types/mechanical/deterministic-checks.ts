import type { JSONContent } from "@tiptap/core";
import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";
import {
  normalizeMechanicalVerdict,
  parseMechanicalResultsMatrix,
  parseRevisionHistoryMatrix,
  parseUutMatrix,
  tableFieldDoc,
} from "./matrix-parser";

function verdict(
  status: CriterionStatus,
  reasoning: string
): { status: CriterionStatus; reasoning: string } {
  return { status, reasoning };
}

/** Table 1 — one row per physical unit, identified by serial number. */
export function checkUutTablePresent(ctx: EvaluationContext) {
  const parsed = parseUutMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const required = ["Equipment", "Manufacturer", "Part Number"];
  const missingRequired = parsed.missingColumns.filter((c) =>
    required.includes(c)
  );
  if (missingRequired.length > 0) {
    return verdict(
      "not_met",
      `Units Under Test table is missing column(s): ${missingRequired.join(", ")}`
    );
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Units Under Test table has no data rows");
  }
  return verdict(
    "met",
    `Units Under Test table present with ${parsed.rows.length} row(s)`
  );
}

/**
 * Every row is identified by serial number, or N/A where the unit carries none.
 * A blank cell is not the same as N/A — the recipe requires the choice be made.
 */
export function checkUutRowsIdentified(ctx: EvaluationContext) {
  const parsed = parseUutMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.missingColumns.includes("Serial Number")) {
    return verdict("not_met", "Units Under Test table has no Serial Number column");
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Units Under Test table has no data rows");
  }
  const blank = parsed.rows.filter((r) => !r.serialNumber.trim());
  if (blank.length > 0) {
    return verdict(
      "partially_met",
      `${blank.length} row(s) leave Serial Number blank; use N/A where the unit carries none`
    );
  }
  const blankRevision = parsed.rows.filter((r) => !r.revision.trim());
  if (blankRevision.length > 0) {
    return verdict(
      "partially_met",
      `${blankRevision.length} row(s) leave Revision blank; use N/A for a system defined by its part number`
    );
  }
  return verdict(
    "met",
    `All ${parsed.rows.length} row(s) carry a serial number or N/A, and a revision`
  );
}

function nodePlainText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(nodePlainText).join("");
}

function nodeHasItalic(node: JSONContent | undefined): boolean {
  if (!node) return false;
  if ((node.marks ?? []).some((mark) => mark.type === "italic")) return true;
  return (node.content ?? []).some(nodeHasItalic);
}

function nodesAfterTable(doc: JSONContent | null | undefined): JSONContent[] {
  const content = doc?.content ?? [];
  const index = content.findIndex((node) => node.type === "table");
  if (index < 0) return [];
  return content.slice(index + 1);
}

function proseAfterTable(
  content: unknown,
  field: string
): { text: string; italic: boolean } {
  const nodes = nodesAfterTable(tableFieldDoc(content, field));
  const text = nodes.map(nodePlainText).join("\n").trim();
  return { text, italic: nodes.some(nodeHasItalic) };
}

function looksLikeFootnote(text: string, italic: boolean): boolean {
  if (!text) return false;
  if (italic) return true;
  return (
    text.includes("*") ||
    /see\s+deviation/i.test(text) ||
    (/prototype/i.test(text) && /equivalent/i.test(text))
  );
}

const RESULTS_FOOTNOTE_IN_LEAD_IN_RE =
  /see\s+deviation|deemed not applicable to the current testing/i;

/**
 * A prototype or functional equivalent carries an asterisk on its revision and
 * a footnote beneath the table (in the table field). A footnote still sitting
 * only in the lead-in narrative is accepted so older drafts are not failed
 * solely for field placement.
 */
export function checkUutPrototypeFootnote(ctx: EvaluationContext) {
  const parsed = parseUutMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const starred = parsed.rows.filter((r) => r.revision.includes("*"));
  if (starred.length === 0) {
    return verdict(
      "met",
      "No revision is asterisked, so no equivalence footnote is required"
    );
  }
  const afterTable = proseAfterTable(ctx.content, "table");
  const narrative = nodePlainText(
    tableFieldDoc(ctx.content, "narrative") ?? undefined
  );
  const narrativeItalic = nodeHasItalic(
    tableFieldDoc(ctx.content, "narrative") ?? undefined
  );
  if (
    looksLikeFootnote(afterTable.text, afterTable.italic) ||
    looksLikeFootnote(narrative, narrativeItalic) ||
    JSON.stringify(
      (ctx.content as { narrative?: unknown } | null)?.narrative ?? ""
    ).includes("*")
  ) {
    return verdict(
      "met",
      `${starred.length} asterisked revision(s) with a footnote present`
    );
  }
  return verdict(
    "not_met",
    `${starred.length} row(s) carry an asterisked revision but no footnote explains what the part was equivalent to`
  );
}

/** 4.2 lead-in must not carry the Table 3 / Table 4 qualified-verdict footnote. */
export function checkResultsLeadInNoFootnote(ctx: EvaluationContext) {
  const narrative = nodePlainText(
    tableFieldDoc(ctx.content, "narrative") ?? undefined
  ).trim();
  if (!narrative) {
    return verdict("not_met", "Requirements Verified lead-in is empty");
  }
  if (RESULTS_FOOTNOTE_IN_LEAD_IN_RE.test(narrative)) {
    return verdict(
      "not_met",
      "Lead-in contains a table footnote (See Deviation / Not Applicable). Put that italic note immediately after Table 3 or Table 4 in the table field."
    );
  }
  return verdict("met", "Lead-in has no table footnote");
}

/**
 * An asterisked Pass/Fail needs an italic footnote after that table, in the
 * same table field — not dumped into the 4.2 lead-in.
 */
export function checkResultsFootnotePlacement(ctx: EvaluationContext) {
  const missing: string[] = [];
  let starred = 0;

  for (const [field, label] of [
    ["hardwareTable", "Hardware"],
    ["systemTable", "System"],
  ] as const) {
    const parsed = parseMechanicalResultsMatrix(ctx.content, field);
    if (!parsed.ok) continue;
    const needsFootnote = parsed.rows.some((row) => row.passFail.includes("*"));
    if (!needsFootnote) continue;
    starred += 1;
    const after = proseAfterTable(ctx.content, field);
    if (!looksLikeFootnote(after.text, after.italic)) {
      missing.push(label);
    }
  }

  if (starred === 0) {
    return verdict(
      "met",
      "No qualified (asterisked) verdict, so no table footnote is required"
    );
  }
  if (missing.length > 0) {
    return verdict(
      "not_met",
      `Asterisked verdict(s) in the ${missing.join(" and ")} table have no italic footnote after that table`
    );
  }
  return verdict(
    "met",
    `Qualified verdict footnote sits after the table in ${starred} field(s)`
  );
}

/** Tables 3 and 4 — one per discipline, hardware first. */
export function checkResultsTablesPresent(ctx: EvaluationContext) {
  const required = ["Req ID", "Requirement Description", "Pass/Fail"];
  const problems: string[] = [];
  let total = 0;

  for (const [field, label] of [
    ["hardwareTable", "Hardware"],
    ["systemTable", "System"],
  ] as const) {
    const parsed = parseMechanicalResultsMatrix(ctx.content, field);
    if (!parsed.ok) {
      problems.push(`${label} results table: ${parsed.reason}`);
      continue;
    }
    const missingRequired = parsed.missingColumns.filter((c) =>
      required.includes(c)
    );
    if (missingRequired.length > 0) {
      problems.push(
        `${label} results table is missing column(s): ${missingRequired.join(", ")}`
      );
      continue;
    }
    if (parsed.rows.length === 0) {
      problems.push(`${label} results table has no data rows`);
      continue;
    }
    total += parsed.rows.length;
  }

  if (problems.length === 2) return verdict("not_met", problems.join("; "));
  if (problems.length === 1) return verdict("partially_met", problems[0]!);
  return verdict(
    "met",
    `Hardware and system results tables present with ${total} requirement row(s)`
  );
}

/** Pass/Fail carries Pass, Fail or N/A only; a trailing asterisk keys a footnote. */
export function checkResultsVerdictValues(ctx: EvaluationContext) {
  const invalid: string[] = [];
  const blank: string[] = [];
  let checked = 0;

  for (const [field, label] of [
    ["hardwareTable", "Hardware"],
    ["systemTable", "System"],
  ] as const) {
    const parsed = parseMechanicalResultsMatrix(ctx.content, field);
    if (!parsed.ok) continue;
    for (const row of parsed.rows) {
      checked += 1;
      const id = row.requirementId.trim() || "(no Req ID)";
      if (!row.passFail.trim()) {
        blank.push(`${label} ${id}`);
        continue;
      }
      if (normalizeMechanicalVerdict(row.passFail) === null) {
        invalid.push(`${label} ${id}: "${row.passFail.trim()}"`);
      }
    }
  }

  if (checked === 0) {
    return verdict("not_met", "No requirement rows to check a verdict on");
  }
  if (blank.length > 0 || invalid.length > 0) {
    const parts: string[] = [];
    if (blank.length > 0) {
      parts.push(`${blank.length} row(s) with no verdict (${blank.slice(0, 3).join(", ")})`);
    }
    if (invalid.length > 0) {
      parts.push(
        `${invalid.length} verdict(s) other than Pass, Fail or N/A (${invalid.slice(0, 3).join("; ")})`
      );
    }
    return verdict("not_met", parts.join("; "));
  }
  return verdict("met", `All ${checked} verdict(s) are Pass, Fail or N/A`);
}

/** Requirement IDs are unique within each discipline's table. */
export function checkResultsIdsUnique(ctx: EvaluationContext) {
  const duplicates: string[] = [];
  let checked = 0;

  for (const [field, label] of [
    ["hardwareTable", "Hardware"],
    ["systemTable", "System"],
  ] as const) {
    const parsed = parseMechanicalResultsMatrix(ctx.content, field);
    if (!parsed.ok) continue;
    const seen = new Set<string>();
    for (const row of parsed.rows) {
      const id = row.requirementId.trim().toUpperCase();
      if (!id) continue;
      checked += 1;
      if (seen.has(id)) duplicates.push(`${label} ${row.requirementId.trim()}`);
      seen.add(id);
    }
  }

  if (checked === 0) {
    return verdict("not_met", "No requirement IDs to check");
  }
  if (duplicates.length > 0) {
    return verdict(
      "not_met",
      `Duplicate requirement ID(s): ${duplicates.slice(0, 5).join(", ")}`
    );
  }
  return verdict("met", `All ${checked} requirement ID(s) are unique`);
}

const REVISION_LEVEL_RE = /^[A-Z]$/;

/** Table 5 — one row per revision, oldest at the top, letters sequential from A. */
export function checkRevisionHistoryTable(ctx: EvaluationContext) {
  const parsed = parseRevisionHistoryMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.missingColumns.length > 0) {
    return verdict(
      "not_met",
      `Revision History table is missing column(s): ${parsed.missingColumns.join(", ")}`
    );
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Revision History table has no data rows");
  }

  const incomplete = parsed.rows.filter(
    (r) =>
      !r.revisionLevel.trim() ||
      !r.revisionDate.trim() ||
      !r.changeOrderNo.trim() ||
      !r.description.trim() ||
      !r.author.trim()
  );
  if (incomplete.length > 0) {
    return verdict(
      "partially_met",
      `${incomplete.length} revision row(s) leave a column blank`
    );
  }

  const levels = parsed.rows.map((r) => r.revisionLevel.trim().toUpperCase());
  const malformed = levels.filter((l) => !REVISION_LEVEL_RE.test(l));
  if (malformed.length > 0) {
    return verdict(
      "partially_met",
      `Revision Level should be a single sequential letter starting at A; found ${malformed.join(", ")}`
    );
  }
  const expected = levels.map((_, i) => String.fromCharCode(65 + i));
  if (levels.join("") !== expected.join("")) {
    return verdict(
      "partially_met",
      `Revision levels are ${levels.join(", ")}; expected ${expected.join(", ")} with the oldest revision at the top`
    );
  }

  return verdict(
    "met",
    `Revision History complete with ${parsed.rows.length} row(s), ${levels.join(" → ")}`
  );
}
