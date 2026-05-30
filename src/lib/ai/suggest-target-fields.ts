import type { SectionType } from "@/db/schema";

/** Pattern entries use `[]` for a numeric array index slot. */
export const SUGGEST_TARGET_FIELD_PATTERNS: Record<SectionType, readonly string[]> = {
  define: ["narrative"],
  measure: ["narrative"],
  analyze: [
    "sixM.man",
    "sixM.machine",
    "sixM.measurement",
    "sixM.material",
    "sixM.method",
    "sixM.milieu",
    "sixM.conclusion",
    "fiveWhy.narrative",
    "brainstorming",
    "otherTools",
    "investigationOutcome",
    "rootCause.narrative",
    "impactAssessment",
  ],
  improve: ["correctiveActions"],
  control: ["preventiveActions"],
  documents_reviewed: [],
  attachments: [],
  signature_approvals: [],
};

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/\[\]/g, "__IDX__");
  const reSource = escaped
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/__IDX__/g, "\\d+");
  return new RegExp(`^${reSource}$`);
}

export function isAllowedTargetField(section: SectionType, targetField: string): boolean {
  const patterns = SUGGEST_TARGET_FIELD_PATTERNS[section];
  return patterns.some((p) => patternToRegex(p).test(targetField));
}

export function isNarrativeTargetField(targetField: string): boolean {
  return targetField === "narrative";
}
