/**
 * FDA clause catalog for Review mode. Clause wording needs QA sign-off
 * before treating these as a released regulatory checklist.
 */
import type { DocumentType } from "@/db/schema";
import type { CriterionDefinition } from "@/lib/document-types";
import { getCustomerPack } from "@/lib/customers/packs";

export type FdaCriterion = CriterionDefinition & {
  targetSection: string;
  contextSections: string[];
};

const IR_FDA: FdaCriterion[] = [
  {
    key: "fda.211_192_thorough",
    label: "Thorough investigation (21 CFR 211.192)",
    description:
      "Does the report document a thorough investigation of any unexplained discrepancy or failure of a batch or its components to meet specifications, including the findings and conclusions?",
    kind: "llm",
    targetSection: "define",
    contextSections: ["define", "measure", "analyze"],
    dependsOn: ["measure", "analyze"],
  },
  {
    key: "fda.211_192_other_batches",
    label: "Other batches that may have been associated (21 CFR 211.192)",
    description:
      "Does the investigation extend to other batches that may have been associated with the specific failure or discrepancy?",
    kind: "llm",
    targetSection: "analyze",
    contextSections: ["define", "analyze", "improve"],
    dependsOn: ["define", "improve"],
  },
  {
    key: "fda.211_192_conclusion",
    label: "Written record of conclusions and follow-up (21 CFR 211.192)",
    description:
      "Does a written record of the investigation include conclusions and follow-up, including CAPA where warranted?",
    kind: "llm",
    targetSection: "conclusion",
    contextSections: ["improve", "control", "conclusion"],
    dependsOn: ["improve", "control"],
  },
  {
    key: "fda.211_100b_deviation",
    label: "Deviation recorded and justified (21 CFR 211.100(b))",
    description:
      "Is any deviation from written production and process control procedures recorded and justified?",
    kind: "llm",
    targetSection: "define",
    contextSections: ["define", "analyze"],
    dependsOn: ["analyze"],
  },
  {
    key: "fda.oos_phase",
    label: "OOS investigation phases (FDA OOS guidance)",
    description:
      "If the deviation involves an out-of-specification result, does the record distinguish Phase I (laboratory) from Phase II (full-scale) investigation, or state that the event is not an OOS?",
    kind: "llm",
    targetSection: "analyze",
    contextSections: ["define", "measure", "analyze"],
    dependsOn: ["define", "measure"],
  },
];

const FIR_FDA: FdaCriterion[] = [
  {
    key: "fda.q7_deviation",
    label: "Deviation documented (ICH Q7 / 21 CFR 211)",
    description:
      "Are deviations from established procedures documented and explained, including impact on API quality?",
    kind: "llm",
    targetSection: "fir_event_description",
    contextSections: ["fir_event_description", "fir_impact_assessment"],
    dependsOn: ["fir_impact_assessment"],
  },
  {
    key: "fda.q7_investigation",
    label: "Critical deviation investigated (ICH Q7)",
    description:
      "Is a critical deviation investigated, with a conclusion on root cause and batch disposition?",
    kind: "llm",
    targetSection: "fir_root_cause",
    contextSections: [
      "fir_event_description",
      "fir_root_cause",
      "fir_batch_disposition",
    ],
    dependsOn: ["fir_event_description", "fir_batch_disposition"],
  },
];

const DV_FDA: FdaCriterion[] = [
  {
    key: "fda.820_verification_records",
    label: "Design verification records (21 CFR 820 / QMSR)",
    description:
      "Do verification records identify the design, the method, the date, and the individuals performing verification?",
    kind: "llm",
    targetSection: "test_methods",
    contextSections: ["purpose_scope", "test_methods", "test_results"],
    dependsOn: ["purpose_scope", "test_results"],
  },
  {
    key: "fda.820_results_vs_inputs",
    label: "Results confirm design inputs (21 CFR 820)",
    description:
      "Do the results confirm that design outputs meet design inputs, with deviations addressed?",
    kind: "llm",
    targetSection: "test_results",
    contextSections: ["traceability", "test_results", "deviations"],
    dependsOn: ["traceability", "deviations"],
  },
];

const CONVERGENT_DV_FDA: FdaCriterion[] = [
  {
    key: "fda.820_verification_records",
    label: "Design verification records (21 CFR 820 / QMSR)",
    description:
      "Do verification records identify the design, the method, the date, and the individuals performing verification?",
    kind: "llm",
    targetSection: "testers_dates",
    contextSections: ["purpose", "testers_dates", "methods_of_measurement"],
    dependsOn: ["purpose", "methods_of_measurement"],
  },
  {
    key: "fda.820_results_vs_inputs",
    label: "Results confirm design inputs (21 CFR 820)",
    description:
      "Do the results confirm that design outputs meet design inputs, with deviations addressed?",
    kind: "llm",
    targetSection: "results_and_discussions",
    contextSections: ["purpose", "results_and_discussions", "deviations"],
    dependsOn: ["purpose", "deviations"],
  },
];

const MECHANICAL_DV_FDA: FdaCriterion[] = [
  {
    key: "fda.820_verification_records",
    label: "Design verification records (21 CFR 820 / QMSR)",
    description:
      "Do verification records identify the design, the method, the date, and the individuals performing verification?",
    kind: "llm",
    targetSection: "purpose",
    contextSections: ["purpose"],
    dependsOn: [],
  },
  {
    key: "fda.820_results_vs_inputs",
    label: "Results confirm design inputs (21 CFR 820)",
    description:
      "Do the results confirm that design outputs meet design inputs, with deviations addressed?",
    kind: "llm",
    targetSection: "conclusion",
    contextSections: ["purpose", "conclusion"],
    dependsOn: ["purpose"],
  },
];

const QRA_FDA: FdaCriterion[] = [
  {
    key: "fda.q9_risk_process",
    label: "Risk management process (FDA Q9(R1))",
    description:
      "Does the assessment follow a defined risk process (identify, analyze, evaluate, control, communicate) with a documented conclusion?",
    kind: "llm",
    targetSection: "qra_approach",
    contextSections: ["qra_approach", "qra_post_conclusion"],
    dependsOn: ["qra_post_conclusion"],
  },
];

const ELR_FDA: FdaCriterion[] = [
  {
    key: "fda.211_63_equipment",
    label: "Equipment design and maintenance (21 CFR 211.63 / 211.67)",
    description:
      "Does the review show that equipment of appropriate design was maintained in a clean and suitable state over the period?",
    kind: "llm",
    targetSection: "elr_objective",
    contextSections: ["elr_objective", "elr_system_description", "elr_conclusion"],
    dependsOn: ["elr_system_description", "elr_conclusion"],
  },
  {
    key: "fda.pv_stage3",
    label: "Continued process verification (FDA Process Validation Stage 3)",
    description:
      "Does the period review address continued process verification — monitoring, deviations, and a qualified-state conclusion?",
    kind: "llm",
    targetSection: "elr_conclusion",
    contextSections: ["elr_system_trends", "elr_conclusion"],
    dependsOn: ["elr_system_trends"],
  },
];

const QSR_FDA: FdaCriterion[] = [
  {
    key: "fda.211_63_equipment",
    label: "Equipment of appropriate design (21 CFR 211.63)",
    description:
      "Does the qualification summary identify the equipment and show that design/qualification evidence supports intended use?",
    kind: "llm",
    targetSection: "qsr_objective",
    contextSections: ["qsr_objective", "qsr_conclusion"],
    dependsOn: ["qsr_conclusion"],
  },
  {
    key: "fda.pv_stage3",
    label: "Qualification traceability (FDA Process Validation)",
    description:
      "Is URS → IQ/OQ/PQ traceability complete enough to support a qualified-state conclusion?",
    kind: "llm",
    targetSection: "qsr_conclusion",
    contextSections: ["qsr_rtm_process", "qsr_conclusion"],
    dependsOn: ["qsr_rtm_process"],
  },
];

const VQ_FDA: FdaCriterion[] = [
  {
    key: "fda.211_84_components",
    label: "Component testing and supplier reliance (21 CFR 211.84)",
    description:
      "Does the qualification support reliance on the supplier, including identity/testing of components or a documented skip-lot/COA rationale?",
    kind: "llm",
    targetSection: "vq_cover",
    contextSections: ["vq_cover", "vq_scoring"],
    dependsOn: ["vq_scoring"],
  },
];

export function fdaCriteriaForDocumentType(
  documentType: DocumentType
): FdaCriterion[] {
  switch (documentType) {
    case "investigation_report":
      return IR_FDA;
    case "failure_investigation_report":
      return FIR_FDA;
    case "design_verification":
      return getCustomerPack().id === "convergent" ? CONVERGENT_DV_FDA : DV_FDA;
    case "mechanical_design_verification":
      return MECHANICAL_DV_FDA;
    case "quality_risk_assessment":
      return QRA_FDA;
    case "equipment_lifecycle_report":
      return ELR_FDA;
    case "qualification_summary_report":
      return QSR_FDA;
    case "vendor_qualification":
      return VQ_FDA;
    case "generic_document":
      return [];
    default: {
      const _exhaustive: never = documentType;
      return _exhaustive;
    }
  }
}

/** Convergent DV uses different section keys than demo/MJ DV. */
export function fdaCriteriaForDesignVerification(pack: string): FdaCriterion[] {
  return pack === "convergent" ? CONVERGENT_DV_FDA : DV_FDA;
}
