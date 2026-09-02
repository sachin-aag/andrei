import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";
import { sectionHasPrototypeFootnote } from "@/lib/export/mechanical-table-footnotes";
import {
  normalizeMechanicalVerdict,
  parseMechanicalResultsMatrix,
  parseRevisionHistoryMatrix,
  parseUutMatrix,
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

/**
 * A prototype or functional equivalent carries an asterisk on its revision and
 * a footnote beneath the table. An asterisked revision with no footnote in a
 * paragraph (lead-in or after the table) is the failure this catches. A star
 * only inside a table cell does not count.
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
  const content = ctx.content as {
    narrative?: unknown;
    table?: unknown;
  } | null;
  if (!sectionHasPrototypeFootnote(content?.narrative, content?.table)) {
    return verdict(
      "not_met",
      `${starred.length} row(s) carry an asterisked revision but no footnote explains what the part was equivalent to`
    );
  }
  return verdict(
    "met",
    `${starred.length} asterisked revision(s) with a footnote present`
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
