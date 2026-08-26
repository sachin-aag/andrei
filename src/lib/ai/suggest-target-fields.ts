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
  // Convergent mechanical DV (825-00101 family). 2.4 keeps its own key because
  // it carries a lead-in sentence as well as the table, and test_equipment must
  // stay single-field for the software type's targetField remap.
  equipment_and_calibration: ["narrative", "table"],
  executed_protocol: ["narrative"],
  protocol_deviations: ["narrative"],
  units_under_test: ["narrative", "table"],
  failure_forms: ["narrative"],
  data_collection_forms: ["narrative"],
  requirements_verified: ["narrative", "hardwareTable", "systemTable"],
  observations: ["narrative"],
  revision_history: ["table"],
  qra_approach: ["narrative", "impactKnown", "scopeDefined", "scopeNarrow"],
  qra_objective: ["narrative"],
  qra_scope: ["narrative"],
  qra_overview: ["narrative"],
  qra_procedure: ["narrative"],
  qra_team: ["table"],
  qra_risk_identification: ["table"],
  qra_fmea: ["narrative", "table"],
  qra_communication: ["narrative", "table"],
  qra_pre_conclusion: ["narrative"],
  qra_mitigation: ["narrative", "table"],
  qra_residual_risk: ["narrative", "table"],
  qra_periodic_review: ["narrative", "applicable"],
  qra_post_conclusion: ["narrative"],
  qra_revision_history: ["table"],
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
  // Convergent mechanical DV (825-00101 family). 2.4 keeps its own key because
  // it carries a lead-in sentence as well as the table, and test_equipment must
  // stay single-field for the software type's targetField remap.
  equipment_and_calibration: ["narrative", "table"],
  executed_protocol: ["narrative"],
  protocol_deviations: ["narrative"],
  units_under_test: ["narrative", "table"],
  failure_forms: ["narrative"],
  data_collection_forms: ["narrative"],
  requirements_verified: ["narrative", "hardwareTable", "systemTable"],
  observations: ["narrative"],
  revision_history: ["table"],
  qra_approach: ["narrative"],
  qra_objective: ["narrative"],
  qra_scope: ["narrative"],
  qra_overview: ["narrative"],
  qra_procedure: ["narrative"],
  qra_team: ["table"],
  qra_risk_identification: ["table"],
  qra_fmea: ["narrative", "table"],
  qra_communication: ["narrative", "table"],
  qra_pre_conclusion: ["narrative"],
  qra_mitigation: ["narrative", "table"],
  qra_residual_risk: ["narrative", "table"],
  qra_periodic_review: ["narrative"],
  qra_post_conclusion: ["narrative"],
  qra_revision_history: ["table"],
};

export function isRichTargetField(section: SectionType, contentPath: string): boolean {
  const paths = RICH_FIELD_PATHS[section];
  return paths?.includes(contentPath) ?? false;
}

/** @deprecated Use isRichTargetField(section, path) — kept for narrative-only call sites during migration. */
export function isNarrativeTargetField(targetField: string): boolean {
  return targetField === "narrative";
}
