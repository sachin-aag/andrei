import type { SectionType } from "@/db/schema";

/** Pattern entries use `[]` for a numeric array index slot. */
export const SUGGEST_TARGET_FIELD_PATTERNS: Record<SectionType, readonly string[]> = {
  define: ["narrative"],
  measure: [
    "narrative",
    "experimentNumber",
    "experimentTitle",
    "purpose",
    "conclusion",
  ],
  analyze: [
    "sixM.man",
    "sixM.machine",
    "sixM.measurement",
    "sixM.material",
    "sixM.method",
    "sixM.milieu",
    "sixM.conclusion",
    "brainstorming",
    "otherTools",
    "investigationOutcome",
    "rootCause.narrative",
    "impactAssessment",
  ],
  improve: ["narrative", "correctiveActions"],
  control: ["preventiveActions"],
  conclusion: ["narrative"],
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

/** Rich TipTap fields per section (dot paths). */
export const RICH_FIELD_PATHS: Partial<Record<SectionType, readonly string[]>> = {
  define: ["narrative"],
  measure: ["narrative", "purpose", "conclusion"],
  analyze: [
    "fiveWhy.narrative",
    "investigationOutcome",
    "rootCause.narrative",
    "impactAssessment",
  ],
  improve: ["narrative", "correctiveActions"],
  control: ["preventiveActions"],
  conclusion: ["narrative"],
};

export function isRichTargetField(section: SectionType, contentPath: string): boolean {
  const paths = RICH_FIELD_PATHS[section];
  return paths?.includes(contentPath) ?? false;
}

/** @deprecated Use isRichTargetField(section, path) — kept for narrative-only call sites during migration. */
export function isNarrativeTargetField(targetField: string): boolean {
  return targetField === "narrative";
}
