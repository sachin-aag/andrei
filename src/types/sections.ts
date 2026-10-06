import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";

export type DefineSection = {
  narrative: JSONContent;
};

/**
 * Single narrative box. The optional fields only exist on legacy stored rows;
 * `mergeMeasureSection` folds them into `narrative` and drops the keys.
 */
export type MeasureSection = {
  narrative: JSONContent;
  regulatoryNotification?: string;
  experimentNumber?: string;
  experimentTitle?: string;
  purpose?: JSONContent;
  conclusion?: JSONContent;
};

export type FiveWhyEntry = {
  question: string;
  answer: string;
};

export type AnalyzeSection = {
  sixM: {
    man: string;
    machine: string;
    measurement: string;
    material: string;
    method: string;
    milieu: string;
    conclusion: string;
  };
  fiveWhy: {
    /** Full 5-Why chain and conclusion (single rich field in the UI). */
    narrative: JSONContent;
    /** Legacy second slot; always normalized empty after merge / save. */
    conclusion: string;
  };
  brainstorming: string;
  otherTools: string;
  investigationOutcome: JSONContent;
  rootCause: {
    narrative: JSONContent;
  };
  /** System/Document/Product/Equipment/Patient safety — single rich block. */
  impactAssessment: JSONContent;
};

export type ImproveSection = {
  narrative: JSONContent;
  correctiveActions: JSONContent;
};

export type ControlSection = {
  /** All preventive-action and closure content in one rich field. */
  preventiveActions: JSONContent;
};

export type ConclusionSection = {
  narrative: JSONContent;
};

export type DocumentsReviewedSection = {
  items: string[];
};

export type AttachmentsSection = {
  items: Array<{ label: string; description: string }>;
};

/** Bottom QC/QA sign-off table (imported from uploaded DOCX; read-only in the app). */
export type SignatureApprovalsSection = {
  table: JSONContent | null;
  headerRowXml?: string;
  dataRowXml?: string;
};

export type SectionContentMap = {
  define: DefineSection;
  measure: MeasureSection;
  analyze: AnalyzeSection;
  improve: ImproveSection;
  control: ControlSection;
  conclusion: ConclusionSection;
  documents_reviewed: DocumentsReviewedSection;
  attachments: AttachmentsSection;
  signature_approvals: SignatureApprovalsSection;
};

export const EMPTY_CONTENT: SectionContentMap = {
  define: {
    narrative: emptyDoc(),
  },
  measure: {
    narrative: emptyDoc(),
  },
  analyze: {
    sixM: {
      man: "",
      machine: "",
      measurement: "",
      material: "",
      method: "",
      milieu: "",
      conclusion: "",
    },
    fiveWhy: {
      narrative: emptyDoc(),
      conclusion: "",
    },
    brainstorming: "",
    otherTools: "",
    investigationOutcome: emptyDoc(),
    rootCause: {
      narrative: emptyDoc(),
    },
    impactAssessment: emptyDoc(),
  },
  improve: {
    narrative: emptyDoc(),
    correctiveActions: emptyDoc(),
  },
  control: {
    preventiveActions: emptyDoc(),
  },
  conclusion: {
    narrative: emptyDoc(),
  },
  documents_reviewed: {
    items: [],
  },
  attachments: {
    items: [],
  },
  signature_approvals: {
    table: null,
  },
};

export const SECTION_LABELS: Record<string, string> = {
  define: "Define",
  measure: "Measure",
  analyze: "Analyze",
  improve: "Improve",
  control: "Control",
  conclusion: "Conclusion",
  documents_reviewed: "Documents Reviewed",
  attachments: "Attachments",
  signature_approvals: "Approvals (QC / QA)",
  // Design verification
  cover_page: "Cover Page",
  identity: "Cover identity",
  purpose_scope: "Purpose & Scope",
  references: "References",
  traceability: "Traceability",
  test_methods: "Test Methods / Protocol Summary",
  test_results: "Test Results",
  deviations: "Deviations & Nonconformances",
  approval_signoff: "Approval / Sign-off",
  appendices: "Appendices",
  purpose: "Purpose",
  scope: "Scope",
  testers_dates: "Testers/Dates",
  methods_of_measurement: "Methods of Measurement",
  test_equipment: "Test Equipment",
  results_and_discussions: "Results and Discussion",
  problems_resolution: "Problem or Failure Resolution",
  executed_protocol: "Executed Protocol",
  protocol_deviations: "Protocol Deviations",
  units_under_test: "Units Under Test",
  equipment_and_calibration: "Test Equipment",
  failure_forms: "Failure/Out of Specification Forms",
  data_collection_forms: "Data Collection Forms",
  requirements_verified: "Requirements Verified",
  observations: "Observations",
  revision_history: "Revision History",
  body: "Document",
  qra_approach: "Risk Assessment Approach",
  qra_objective: "Objective",
  qra_scope: "Scope",
  qra_overview: "System / Equipment Overview",
  qra_procedure: "Procedure",
  qra_team: "Risk Assessment Team",
  qra_risk_identification: "Risk Identification",
  qra_fmea: "Risk Identification and Evaluation",
  qra_communication: "Risk Communication",
  qra_pre_conclusion: "Summary and Conclusion (Before Implementation)",
  qra_mitigation: "Mitigation Plan and Closure",
  qra_residual_risk: "New / Residual Risk",
  qra_periodic_review: "Periodic Review",
  qra_post_conclusion: "Summary and Conclusion (After Implementation)",
  qra_revision_history: "Revision History",
  vq_cover: "Cover",
  vq_section_a: "A. General Company Information and Quality Management",
  vq_section_b: "B. TSE/BSE Risk Analysis Questionnaire",
  vq_section_c: "C. GMO – Vegetable Origin Questionnaire",
  vq_section_d: "D. Allergen Questionnaire",
  vq_section_e: "E. Extended Quality Questionnaire",
  vq_section_f: "F. Packaging Material Questionnaire",
  vq_section_g: "G. Elemental Impurities Questionnaire",
  vq_section_h: "H. Residual Solvent Questionnaire",
  vq_section_i: "I. Potential Genotoxic Impurity (PGI) Questionnaire",
  vq_section_j: "J. Nitrosamine Impurity Questionnaire",
  vq_section_k: "K. Willingness to Inspection",
  vq_section_l: "L. Change Notification",
  vq_section_m: "M. Quality Agreement",
  vq_section_n: "N. Audit Checklist",
  vq_scoring: "Approval of Vendor Qualification",
  cvp_approvals: "1.0 Approval Signatures",
  cvp_objective: "2.0 Objective",
  cvp_scope: "3.0 Scope",
  cvp_responsibilities: "4.0 Responsibilities",
  cvp_background: "5.0 Background and Cleaning Procedure",
  cvp_prerequisites: "6.0 Pre-requisites",
  cvp_qualification_status: "7.0 Equipment Qualification Status",
  cvp_surface_area: "8.0 Surface Area of the Equipment",
  cvp_rinse_volume: "9.0 Rinse Volume Calculation",
  cvp_maco: "10.0 Maximum Allowable Carryover (MACO)",
  cvp_acceptance_limits: "11.0 Acceptance Limit Calculation (Swab and Rinse)",
  cvp_methodology: "12.0 Cleaning Verification Methodology",
  cvp_sampling_procedure: "13.0 Sampling Procedure",
  cvp_swab_locations: "14.0 Determination of Swab Sample Locations",
  cvp_sampling_plan:
    "15.0 Sampling Plan, Acceptance Criteria and Cleaning Validation Results Summary",
  cvp_equipment_sampling: "15.1–15.10 Equipment Sampling Plans",
  cvp_nitrosamine: "15.11 Nitrosamine Limits in the Rinse Samples",
  cvp_pgi: "15.12 Potential Genotoxic Impurities Limits in the Rinse Samples",
  cvp_process_line: "Process Line Cleaning Verification Summary",
  cvp_manufacturing_area: "Manufacturing Area Cleaning Verification",
  cvp_overall_results: "Overall Cleaning Results Summary",
  cvp_testing_procedure: "16.0 Testing Procedure",
  cvp_method_validation: "17.0 Status of Cleaning Analytical Method Validation",
  cvp_evaluation: "18.0 Evaluation of Results and Reporting",
  cvp_deviations: "19.0 Deviations",
  cvp_revalidation: "20.0 Revalidation",
  cvp_abbreviations: "21.0 Abbreviations",
  cvp_related_documents: "22.0 Related Documents",
  cvp_annexures: "23.0 List of Annexures",
  cvp_history: "24.0 History of the Document",
};

/** Title-case a section key so Criteria and comments never show `revision_history`. */
export function humanizeSectionKey(section: string): string {
  return section
    .replace(/^qra_/, "")
    .replace(/^elr_/, "")
    .replace(/^vq_/, "")
    .replace(/^cvp_/, "")
    .replace(/^qsr_/, "")
    .replace(/^fir_/, "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Human-readable section title for Criteria, comments, and status pills. */
export function displaySectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? humanizeSectionKey(section);
}

export const EDITABLE_SECTIONS = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "conclusion",
] as const satisfies readonly (keyof SectionContentMap)[];

/** All `report_sections` rows created for a report (DMAIC + document metadata blocks). */
export const REPORT_SECTION_ROW_ORDER = [
  ...EDITABLE_SECTIONS,
  "documents_reviewed",
  "attachments",
  "signature_approvals",
] as const satisfies readonly (keyof SectionContentMap)[];

/** Sections rendered as editors in the report workspace (same as DB row order). */
export const REPORT_WORKSPACE_SECTIONS = REPORT_SECTION_ROW_ORDER;
