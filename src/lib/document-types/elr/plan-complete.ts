/**
 * MJ ELR remaining-section completeness. Evidence sections are not done
 * after the table alone — the assessment (and trend / grade / recommendation
 * siblings) has to land in the same turn. Investigation / DV keys never match.
 */

import { recommendationHasSchedule } from "./recommendation-schedule";

export const ELR_ASSESSMENT_SECTIONS = [
  "elr_qualification",
  "elr_media_fill",
  "elr_monitoring",
  "elr_calibration",
  "elr_preventive_maintenance",
  "elr_alarms",
  "elr_breakdowns",
  "elr_qms",
  "elr_access_control",
  "elr_audit_trail",
  "elr_csv_status",
] as const;

const TREND_SECTIONS = new Set(["elr_breakdowns", "elr_alarms"]);
const ASSESSMENT_SET = new Set<string>(ELR_ASSESSMENT_SECTIONS);

const PLAN_EDIT_TOOLS = new Set(["draft_field", "edit_table", "propose_edit"]);

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
    edits.push({
      name,
      section: section.trim(),
      targetField,
      text,
      complete: state === "output-available" || state === "",
    });
  }
  return edits;
}

function sectionCompleteFromEdits(
  section: string,
  edits: readonly SectionEdit[]
): boolean {
  const required = elrPlanRequiredFields(section);
  if (!required) return true;
  const mine = edits.filter((edit) => edit.section === section && edit.complete);
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
  return true;
}

/** Sections edited this turn that still need assessment / trend / enum siblings. */
export function elrIncompleteSectionKeysFromParts(parts: unknown): string[] {
  const edits = editsFromParts(parts);
  const sections = [...new Set(edits.map((edit) => edit.section))];
  return sections.filter(
    (section) =>
      elrPlanRequiredFields(section) !== null &&
      !sectionCompleteFromEdits(section, edits)
  );
}

export function elrPlanSectionCompleteFromParts(
  section: string,
  parts: unknown
): boolean {
  return sectionCompleteFromEdits(section, editsFromParts(parts));
}
