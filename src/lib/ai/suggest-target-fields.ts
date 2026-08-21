import type { SectionType } from "@/db/schema";

/** Pattern entries use `[]` for a numeric array index slot. */
export const SUGGEST_TARGET_FIELD_PATTERNS: Record<string, readonly string[]> = {
  // Investigation report
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
  improve: ["narrative", "correctiveActions"],
  control: ["preventiveActions"],
  conclusion: ["narrative"],
  documents_reviewed: [],
  attachments: [],
  signature_approvals: [],
  // Design verification (section key ≠ field path — models often pass the section key)
  purpose_scope: ["narrative"],
  references: ["narrative"],
  traceability: ["table"],
  test_methods: ["narrative"],
  test_results: ["table"],
  deviations: ["narrative"],
  approval_signoff: ["narrative"],
  appendices: ["narrative"],
  cover_page: [],
  purpose: ["narrative"],
  scope: ["narrative"],
  testers_dates: ["testers"],
  methods_of_measurement: ["narrative"],
  test_equipment: ["table"],
  results_and_discussions: ["narrative", "table"],
  problems_resolution: ["narrative"],
};

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/\[\]/g, "__IDX__");
  const reSource = escaped
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/__IDX__/g, "\\d+");
  return new RegExp(`^${reSource}$`);
}

/** Concrete editable field paths for a section (excludes `[]` index patterns). */
export function concreteTargetFields(section: SectionType): readonly string[] {
  return (SUGGEST_TARGET_FIELD_PATTERNS[section] ?? []).filter(
    (p) => !p.includes("[]")
  );
}

export function isAllowedTargetField(section: SectionType, targetField: string): boolean {
  const patterns = SUGGEST_TARGET_FIELD_PATTERNS[section] ?? [];
  return patterns.some((p) => patternToRegex(p).test(targetField));
}

/**
 * Normalize a model-supplied targetField. Models often pass the section key
 * (e.g. purpose_scope) instead of the in-section path (e.g. narrative). When
 * the section has exactly one editable field, remap that mistake.
 */
export function resolveTargetField(
  section: SectionType,
  targetField: string
): string | null {
  if (isAllowedTargetField(section, targetField)) return targetField;
  const allowed = concreteTargetFields(section);
  if (targetField === section && allowed.length === 1) {
    return allowed[0] ?? null;
  }
  return null;
}

/** Rich TipTap fields per section (dot paths). */
export const RICH_FIELD_PATHS: Partial<Record<string, readonly string[]>> = {
  // Investigation report
  define: ["narrative"],
  measure: ["narrative"],
  analyze: [
    "fiveWhy.narrative",
    "investigationOutcome",
    "rootCause.narrative",
    "impactAssessment",
  ],
  improve: ["narrative", "correctiveActions"],
  control: ["preventiveActions"],
  conclusion: ["narrative"],
  // Design verification
  purpose_scope: ["narrative"],
  references: ["narrative"],
  traceability: ["table"],
  test_methods: ["narrative"],
  test_results: ["table"],
  deviations: ["narrative"],
  approval_signoff: ["narrative"],
  appendices: ["narrative"],
  purpose: ["narrative"],
  scope: ["narrative"],
  testers_dates: ["testers"],
  methods_of_measurement: ["narrative"],
  test_equipment: ["table"],
  results_and_discussions: ["narrative", "table"],
  problems_resolution: ["narrative"],
};

export function isRichTargetField(section: SectionType, contentPath: string): boolean {
  const paths = RICH_FIELD_PATHS[section];
  return paths?.includes(contentPath) ?? false;
}

/** @deprecated Use isRichTargetField(section, path) — kept for narrative-only call sites during migration. */
export function isNarrativeTargetField(targetField: string): boolean {
  return targetField === "narrative";
}
