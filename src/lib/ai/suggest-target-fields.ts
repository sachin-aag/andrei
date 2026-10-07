import type { SectionType } from "@/db/schema";
import { cvpEquipmentItemIndexFromTarget } from "@/lib/document-types/cvp/equipment-item-path";

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
  // Demo-only continuous Word-like document
  body: ["narrative"],
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
  // MJ-only periodic equipment lifecycle report
  elr_objective: ["narrative"],
  elr_scope: ["narrative"],
  elr_responsibilities: ["narrative", "table"],
  elr_abbreviations: ["table"],
  elr_system_description: ["narrative"],
  elr_qualification: ["narrative", "table"],
  elr_process_validation: ["narrative", "table"],
  elr_cleaning_validation: ["narrative", "table"],
  elr_qra_review: ["narrative", "table"],
  elr_media_fill: ["narrative", "table"],
  elr_monitoring: ["narrative", "table"],
  elr_calibration: ["narrative", "table"],
  elr_preventive_maintenance: ["narrative", "table"],
  elr_breakdowns: ["narrative", "table", "trend"],
  elr_qms: ["narrative", "table"],
  elr_alarms: ["narrative", "table", "trend"],
  elr_access_control: ["narrative", "table"],
  elr_audit_trail: ["narrative", "table"],
  elr_csv_status: ["narrative", "table"],
  elr_discrepancies: ["narrative"],
  elr_system_trends: ["narrative", "table"],
  elr_risk_actions: ["narrative", "table", "overallGrade"],
  elr_conclusion: ["narrative", "recommendation", "recommendationNarrative"],
  elr_attachments: ["table"],
  elr_revision_history: ["table"],
  vq_cover: [
    "answers.cover_manufacturer",
    "answers.cover_material",
    "answers.cover_remarks",
  ],
  vq_section_a: ["narrative", "table"],
  vq_section_b: ["narrative"],
  vq_section_c: ["narrative"],
  vq_section_d: ["narrative"],
  vq_section_e: ["narrative"],
  vq_section_f: ["narrative"],
  vq_section_g: ["narrative", "table"],
  vq_section_h: ["narrative", "table"],
  vq_section_i: ["narrative", "table"],
  vq_section_j: ["narrative", "table"],
  vq_section_k: ["narrative"],
  vq_section_l: ["narrative"],
  vq_section_m: ["narrative"],
  vq_section_n: ["narrative", "table"],
  vq_scoring: ["narrative"],
  // 3xper Qualification Summary Report (QAD/016/F06-00).
  qsr_objective: ["narrative"],
  qsr_scope: ["narrative"],
  qsr_references: ["table"],
  qsr_acronyms: ["table"],
  qsr_overview: ["narrative"],
  qsr_background: ["narrative"],
  qsr_qualification_documents: ["table"],
  qsr_sops: ["table"],
  qsr_rtm_process: ["table"],
  qsr_rtm_control: ["table"],
  qsr_rtm_gmp: ["table"],
  qsr_rtm_safety: ["table"],
  qsr_rtm_csv: ["table"],
  qsr_rtm_maintenance: ["table"],
  qsr_volumetric_details: ["narrative"],
  qsr_operating_range: ["table"],
  qsr_other_details: ["narrative"],
  qsr_conclusion: ["narrative"],
  // 3xper Cleaning Verification Protocol (QAD-SOP-PS-003-F08-00).
  cvp_approvals: ["table"],
  cvp_objective: ["narrative"],
  cvp_scope: ["narrative"],
  cvp_responsibilities: ["table"],
  cvp_background: ["narrative"],
  cvp_prerequisites: ["narrative"],
  cvp_qualification_status: ["table"],
  cvp_surface_area: ["table"],
  cvp_rinse_volume: ["narrative"],
  cvp_maco: ["narrative"],
  cvp_acceptance_limits: ["narrative"],
  cvp_methodology: ["narrative"],
  cvp_sampling_procedure: ["narrative"],
  cvp_swab_locations: ["narrative"],
  cvp_sampling_plan: ["narrative"],
  cvp_equipment_sampling: ["items.[]"],
  cvp_nitrosamine: ["table"],
  cvp_pgi: ["table"],
  cvp_process_line: ["table"],
  cvp_manufacturing_area: ["table"],
  cvp_overall_results: ["narrative"],
  cvp_testing_procedure: ["table"],
  cvp_method_validation: ["table"],
  cvp_evaluation: ["narrative"],
  cvp_deviations: ["narrative"],
  cvp_revalidation: ["narrative"],
  cvp_abbreviations: ["table"],
  cvp_related_documents: ["table"],
  cvp_annexures: ["table"],
  cvp_history: ["table"],
  // MJ-only Investigation Report DS (SOP/QA/017-F01 R01). The fixed-list fields
  // (tools, classification, groups, applicable, resultsStatus, disposition) are
  // selects, so they are not suggestion targets.
  fir_event_description: ["narrative"],
  fir_standard_procedures: ["narrative"],
  fir_immediate_action: ["narrative"],
  fir_initial_impact: ["narrative"],
  fir_investigation_team: ["table"],
  fir_investigation_tools: ["narrative"],
  fir_chronology: ["narrative", "table"],
  fir_investigation_details: ["narrative"],
  fir_historic_review: ["narrative", "table"],
  fir_root_cause: ["narrative"],
  fir_human_error: ["table"],
  fir_impact_assessment: ["narrative"],
  fir_scope_assessment: ["narrative"],
  fir_batch_disposition: ["narrative"],
  fir_correction: ["narrative"],
  fir_corrective_action: ["narrative", "table"],
  fir_interim_control: ["narrative", "table"],
  fir_preventive_action: ["narrative", "table"],
  fir_capa_effectiveness: ["table"],
  fir_attachments: ["table"],
};

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/\[\]/g, "__IDX__");
  const reSource = escaped
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/__IDX__/g, "\\d+");
  return new RegExp(`^${reSource}$`);
}

/** Expand `items.[]` against live array length (at least `items.0`). */
export function expandIndexedFieldPaths(
  patterns: readonly string[],
  content?: unknown
): string[] {
  const rec =
    content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : null;
  const out: string[] = [];
  for (const pattern of patterns) {
    if (!pattern.includes("[]")) {
      out.push(pattern);
      continue;
    }
    const prefix = pattern.replace(/\.?\[\]$/, "");
    const arr = rec?.[prefix];
    const n = Array.isArray(arr) && arr.length > 0 ? arr.length : 1;
    for (let i = 0; i < n; i++) {
      out.push(pattern.replace("[]", String(i)));
    }
  }
  return out;
}

/** Concrete editable field paths. `items.[]` becomes `items.0` without live content. */
export function concreteTargetFields(section: SectionType): readonly string[] {
  return expandIndexedFieldPaths(SUGGEST_TARGET_FIELD_PATTERNS[section] ?? []);
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
  if (section === "cvp_equipment_sampling") {
    const itemIndex = cvpEquipmentItemIndexFromTarget(targetField);
    if (itemIndex != null) return `items.${itemIndex}`;
    if (
      targetField === "narrative" ||
      targetField === "table" ||
      targetField === section
    ) {
      return "items.0";
    }
  }
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
  body: ["narrative"],
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
  // ELR: `recommendation` is a select, so it is not a rich field.
  elr_objective: ["narrative"],
  elr_scope: ["narrative"],
  elr_responsibilities: ["narrative", "table"],
  elr_abbreviations: ["table"],
  elr_system_description: ["narrative"],
  elr_qualification: ["narrative", "table"],
  elr_process_validation: ["narrative", "table"],
  elr_cleaning_validation: ["narrative", "table"],
  elr_qra_review: ["narrative", "table"],
  elr_media_fill: ["narrative", "table"],
  elr_monitoring: ["narrative", "table"],
  elr_calibration: ["narrative", "table"],
  elr_preventive_maintenance: ["narrative", "table"],
  elr_breakdowns: ["narrative", "table", "trend"],
  elr_qms: ["narrative", "table"],
  elr_alarms: ["narrative", "table", "trend"],
  elr_access_control: ["narrative", "table"],
  elr_audit_trail: ["narrative", "table"],
  elr_csv_status: ["narrative", "table"],
  elr_discrepancies: ["narrative"],
  elr_system_trends: ["narrative", "table"],
  elr_risk_actions: ["narrative", "table"],
  elr_conclusion: ["narrative", "recommendationNarrative"],
  elr_attachments: ["table"],
  elr_revision_history: ["table"],
  vq_section_a: ["narrative", "table"],
  vq_section_b: ["narrative"],
  vq_section_c: ["narrative"],
  vq_section_d: ["narrative"],
  vq_section_e: ["narrative"],
  vq_section_f: ["narrative"],
  vq_section_g: ["narrative", "table"],
  vq_section_h: ["narrative", "table"],
  vq_section_i: ["narrative", "table"],
  vq_section_j: ["narrative", "table"],
  vq_section_k: ["narrative"],
  vq_section_l: ["narrative"],
  vq_section_m: ["narrative"],
  vq_section_n: ["narrative", "table"],
  vq_scoring: ["narrative"],
  // 3xper Qualification Summary Report (QAD/016/F06-00).
  qsr_objective: ["narrative"],
  qsr_scope: ["narrative"],
  qsr_references: ["table"],
  qsr_acronyms: ["table"],
  qsr_overview: ["narrative"],
  qsr_background: ["narrative"],
  qsr_qualification_documents: ["table"],
  qsr_sops: ["table"],
  qsr_rtm_process: ["table"],
  qsr_rtm_control: ["table"],
  qsr_rtm_gmp: ["table"],
  qsr_rtm_safety: ["table"],
  qsr_rtm_csv: ["table"],
  qsr_rtm_maintenance: ["table"],
  qsr_volumetric_details: ["narrative"],
  qsr_operating_range: ["table"],
  qsr_other_details: ["narrative"],
  qsr_conclusion: ["narrative"],
  cvp_approvals: ["table"],
  cvp_objective: ["narrative"],
  cvp_scope: ["narrative"],
  cvp_responsibilities: ["table"],
  cvp_background: ["narrative"],
  cvp_prerequisites: ["narrative"],
  cvp_qualification_status: ["table"],
  cvp_surface_area: ["table"],
  cvp_rinse_volume: ["narrative"],
  cvp_maco: ["narrative"],
  cvp_acceptance_limits: ["narrative"],
  cvp_methodology: ["narrative"],
  cvp_sampling_procedure: ["narrative"],
  cvp_swab_locations: ["narrative"],
  cvp_sampling_plan: ["narrative"],
  cvp_equipment_sampling: ["items.[]"],
  cvp_nitrosamine: ["table"],
  cvp_pgi: ["table"],
  cvp_process_line: ["table"],
  cvp_manufacturing_area: ["table"],
  cvp_overall_results: ["narrative"],
  cvp_testing_procedure: ["table"],
  cvp_method_validation: ["table"],
  cvp_evaluation: ["narrative"],
  cvp_deviations: ["narrative"],
  cvp_revalidation: ["narrative"],
  cvp_abbreviations: ["table"],
  cvp_related_documents: ["table"],
  cvp_annexures: ["table"],
  cvp_history: ["table"],
  // Investigation Report DS: the fixed-list fields are selects, not rich fields.
  fir_event_description: ["narrative"],
  fir_standard_procedures: ["narrative"],
  fir_immediate_action: ["narrative"],
  fir_initial_impact: ["narrative"],
  fir_investigation_team: ["table"],
  fir_investigation_tools: ["narrative"],
  fir_chronology: ["narrative", "table"],
  fir_investigation_details: ["narrative"],
  fir_historic_review: ["narrative", "table"],
  fir_root_cause: ["narrative"],
  fir_human_error: ["table"],
  fir_impact_assessment: ["narrative"],
  fir_scope_assessment: ["narrative"],
  fir_batch_disposition: ["narrative"],
  fir_correction: ["narrative"],
  fir_corrective_action: ["narrative", "table"],
  fir_interim_control: ["narrative", "table"],
  fir_preventive_action: ["narrative", "table"],
  fir_capa_effectiveness: ["table"],
  fir_attachments: ["table"],
  /** Virtual DV section: values live in reports.metadata, no rich field. */
  cover_page: [],
};

export function isRichTargetField(section: SectionType, contentPath: string): boolean {
  const paths = RICH_FIELD_PATHS[section];
  if (!paths || paths.length === 0) return false;
  return paths.some((pattern) => patternToRegex(pattern).test(contentPath));
}

/** @deprecated Use isRichTargetField(section, path) — kept for narrative-only call sites during migration. */
export function isNarrativeTargetField(targetField: string): boolean {
  return targetField === "narrative";
}
