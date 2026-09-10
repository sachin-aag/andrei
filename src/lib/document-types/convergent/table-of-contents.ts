import type { DocumentType, SectionType } from "@/db/schema";
import { getCustomerPack } from "@/lib/customers/packs";
import { resolveCustomerId, type CustomerId } from "@/lib/customers/resolve";
import { DV_SECTION_LABELS } from "@/lib/document-types/design-verification/sections";
import { GENERIC_DOCUMENT_SECTION_LABEL } from "@/lib/document-types/generic/sections";

/** One row in the left-rail table of contents (Word-recipe hierarchy). */
export type TableOfContentsEntry = {
  label: string;
  sectionKey?: SectionType;
  children?: TableOfContentsEntry[];
};

/**
 * Software DV headings from the Word recipe / export template.
 * Methods and Results nest the same subsection labels as mechanical DV even
 * though the editor keeps those children in one section (except Test Equipment).
 * Revision History is template-static (no editor section).
 */
const CONVERGENT_SOFTWARE_DV_TOC: TableOfContentsEntry[] = [
  { label: "Purpose", sectionKey: "purpose" },
  { label: "Scope", sectionKey: "scope" },
  { label: "Testers/Dates", sectionKey: "testers_dates" },
  {
    label: "Methods of Measurement",
    children: [
      { label: "Executed Protocol", sectionKey: "methods_of_measurement" },
      {
        label: "Protocol Modifications",
        sectionKey: "methods_of_measurement",
      },
      { label: "Units Under Test", sectionKey: "methods_of_measurement" },
      { label: "Test Equipment", sectionKey: "test_equipment" },
    ],
  },
  { label: "Deviations", sectionKey: "deviations" },
  {
    label: "Results and Discussion",
    children: [
      {
        label: "Data Collection Forms",
        sectionKey: "results_and_discussions",
      },
      {
        label: "Requirements Verified",
        sectionKey: "results_and_discussions",
      },
      { label: "Observations", sectionKey: "results_and_discussions" },
    ],
  },
  {
    label: "Problem or Failure Resolution",
    sectionKey: "problems_resolution",
  },
  { label: "Conclusion", sectionKey: "conclusion" },
  { label: "Revision History" },
];

/**
 * Mechanical DV numbered headings from
 * `templates/convergent-mechanical-dv-report-template.docx` (731-00008).
 */
const CONVERGENT_MECHANICAL_DV_TOC: TableOfContentsEntry[] = [
  { label: "Purpose", sectionKey: "purpose" },
  { label: "Scope", sectionKey: "scope" },
  { label: "1. Testers/Dates", sectionKey: "testers_dates" },
  {
    label: "2. Methods of Measurement",
    children: [
      { label: "2.1 Executed Protocol", sectionKey: "executed_protocol" },
      {
        label: "2.2 Protocol Deviations",
        sectionKey: "protocol_deviations",
      },
      { label: "2.3 Units Under Test", sectionKey: "units_under_test" },
      {
        label: "2.4 Test Equipment",
        sectionKey: "equipment_and_calibration",
      },
    ],
  },
  {
    label: "3. Failure/Out of Specification Forms",
    sectionKey: "failure_forms",
  },
  {
    label: "4. Results and Discussion",
    children: [
      {
        label: "4.1 Data Collection Forms",
        sectionKey: "data_collection_forms",
      },
      {
        label: "4.2 Requirements Verified",
        sectionKey: "requirements_verified",
      },
      { label: "4.3 Observations", sectionKey: "observations" },
    ],
  },
  {
    label: "5. Problem or Failure Resolution",
    sectionKey: "problems_resolution",
  },
  { label: "6. Conclusion", sectionKey: "conclusion" },
  { label: "Revision History", sectionKey: "revision_history" },
];

/**
 * Investigation DMAIC headings from the demo / MJ Word templates.
 * Analyze / Improve / Control nest the same subsection labels as the export
 * even though the editor keeps those children in one section.
 */
const INVESTIGATION_TOC: TableOfContentsEntry[] = [
  {
    label: "Define",
    sectionKey: "define",
    children: [{ label: "Details Investigation", sectionKey: "define" }],
  },
  { label: "Measure", sectionKey: "measure" },
  {
    label: "Analyze",
    sectionKey: "analyze",
    children: [
      { label: "6 M Method", sectionKey: "analyze" },
      { label: "5 Why Approach", sectionKey: "analyze" },
      { label: "Brainstorming", sectionKey: "analyze" },
      { label: "Other Tool if Any", sectionKey: "analyze" },
      { label: "Investigation Outcome", sectionKey: "analyze" },
      {
        label: "Identified Root Cause / Probable Cause",
        sectionKey: "analyze",
      },
      { label: "Impact Assessment", sectionKey: "analyze" },
    ],
  },
  {
    label: "Improve",
    sectionKey: "improve",
    children: [{ label: "Corrective Action", sectionKey: "improve" }],
  },
  {
    label: "Control",
    sectionKey: "control",
    children: [{ label: "Preventive Action", sectionKey: "control" }],
  },
  { label: "Conclusion", sectionKey: "conclusion" },
  {
    label: "Document Reviewed",
    sectionKey: "documents_reviewed",
    children: [{ label: "List of attachment", sectionKey: "attachments" }],
  },
];

/**
 * MJ quality risk assessment headings from
 * `templates/mj-quality-risk-assessment-template.docx` (SOP/DP/QA/010 F02).
 */
const QRA_TOC: TableOfContentsEntry[] = [
  { label: "A. Pre-approval (Before Implementation)" },
  {
    label: "1. Details of the Risk Assessment",
    children: [
      { label: "1.1 Objective", sectionKey: "qra_objective" },
      { label: "1.2 Scope", sectionKey: "qra_scope" },
      {
        label: "1.3 System / Equipment / Instrument Overview",
        sectionKey: "qra_overview",
      },
      { label: "1.4 Procedure", sectionKey: "qra_procedure" },
      { label: "1.5 Risk Assessment Team Members", sectionKey: "qra_team" },
      { label: "1.6 Risk Identification", sectionKey: "qra_risk_identification" },
      {
        label: "1.7 Risk Measurement by Failure Mode Effect Analysis",
        sectionKey: "qra_fmea",
      },
      { label: "1.8 Risk Assessment Approach", sectionKey: "qra_approach" },
    ],
  },
  {
    label: "2. Risk Identification and Evaluation",
    sectionKey: "qra_fmea",
  },
  {
    label: "3. Risk Communication",
    sectionKey: "qra_communication",
    children: [
      {
        label: "3.1 Summary and Conclusion (Before Implementation)",
        sectionKey: "qra_pre_conclusion",
      },
    ],
  },
  {
    label: "4. Mitigation Plan and Closure",
    sectionKey: "qra_mitigation",
    children: [
      {
        label: "4.1 New / Residual Risk",
        sectionKey: "qra_residual_risk",
      },
      {
        label: "4.2 Periodic Review of Identified Risks",
        sectionKey: "qra_periodic_review",
      },
      {
        label: "4.3 Summary and Conclusion (After Implementation)",
        sectionKey: "qra_post_conclusion",
      },
    ],
  },
  { label: "B. Revision History", sectionKey: "qra_revision_history" },
  { label: "C. Post-approval (After Implementation)" },
];

/**
 * MJ equipment lifecycle report headings from
 * `templates/mj-equipment-lifecycle-report-template.docx` (SOP/DP/QA/014 F10).
 * Approval Page is template-static (no editor section).
 */
const ELR_TOC: TableOfContentsEntry[] = [
  { label: "1.0 Purpose", sectionKey: "elr_objective" },
  { label: "2.0 Scope", sectionKey: "elr_scope" },
  {
    label: "3.0 Observations and Results",
    children: [
      { label: "3.1 Responsibility", sectionKey: "elr_responsibilities" },
      { label: "3.2 Abbreviations", sectionKey: "elr_abbreviations" },
      {
        label: "3.3 Equipment and System Description",
        sectionKey: "elr_system_description",
      },
      {
        label: "3.4 Qualification and Periodic Re-Qualification History",
        sectionKey: "elr_qualification",
      },
      {
        label: "3.5 Media Fill / Aseptic Process Simulation",
        sectionKey: "elr_media_fill",
      },
      { label: "3.6 Monitoring", sectionKey: "elr_monitoring" },
      {
        label: "3.7 Calibration of Associated Instruments",
        sectionKey: "elr_calibration",
      },
      {
        label: "3.8 Preventive Maintenance",
        sectionKey: "elr_preventive_maintenance",
      },
      {
        label: "3.9 Breakdowns and Trends",
        sectionKey: "elr_breakdowns",
        children: [
          {
            label: "3.9.1 Breakdown Trend Summary",
            sectionKey: "elr_breakdowns",
          },
        ],
      },
      {
        label: "3.10 QMS Records since Last Periodic Re-Qualification",
        sectionKey: "elr_qms",
      },
      {
        label: "3.11 Alarm Trends",
        sectionKey: "elr_alarms",
        children: [
          { label: "3.11.1 Alarm Trend Summary", sectionKey: "elr_alarms" },
        ],
      },
      { label: "3.12 Access Control", sectionKey: "elr_access_control" },
      { label: "3.13 Audit Trail Review", sectionKey: "elr_audit_trail" },
      {
        label: "3.14 Computerized System Validation Status",
        sectionKey: "elr_csv_status",
      },
    ],
  },
  {
    label: "4.0 Discrepancy / Deviations",
    sectionKey: "elr_discrepancies",
  },
  { label: "5.0 Summary and Conclusion", sectionKey: "elr_conclusion" },
  { label: "6.0 Recommendation", sectionKey: "elr_conclusion" },
  { label: "7.0 Attachments", sectionKey: "elr_attachments" },
  { label: "8.0 Revision History", sectionKey: "elr_revision_history" },
  { label: "9.0 Approval Page" },
];

/** Demo / MJ software DV (cover page + 10-section template). */
const DEMO_SOFTWARE_DV_TOC: TableOfContentsEntry[] = [
  { label: DV_SECTION_LABELS.cover_page, sectionKey: "cover_page" },
  { label: DV_SECTION_LABELS.purpose_scope, sectionKey: "purpose_scope" },
  { label: DV_SECTION_LABELS.references, sectionKey: "references" },
  { label: DV_SECTION_LABELS.traceability, sectionKey: "traceability" },
  { label: DV_SECTION_LABELS.test_methods, sectionKey: "test_methods" },
  { label: DV_SECTION_LABELS.test_results, sectionKey: "test_results" },
  { label: DV_SECTION_LABELS.deviations, sectionKey: "deviations" },
  { label: DV_SECTION_LABELS.conclusion, sectionKey: "conclusion" },
  { label: DV_SECTION_LABELS.approval_signoff, sectionKey: "approval_signoff" },
  { label: DV_SECTION_LABELS.appendices, sectionKey: "appendices" },
];

const GENERIC_DOCUMENT_TOC: TableOfContentsEntry[] = [
  { label: GENERIC_DOCUMENT_SECTION_LABEL, sectionKey: "body" },
];

export function getConvergentTableOfContents(
  documentType: DocumentType
): TableOfContentsEntry[] | null {
  switch (documentType) {
    case "design_verification":
      return CONVERGENT_SOFTWARE_DV_TOC;
    case "mechanical_design_verification":
      return CONVERGENT_MECHANICAL_DV_TOC;
    default:
      return null;
  }
}

function investigationTableOfContents(
  customerId: CustomerId
): TableOfContentsEntry[] {
  const hidden = new Set(getCustomerPack(customerId).hiddenInvestigationSections);
  return pruneHiddenEntries(INVESTIGATION_TOC, hidden);
}

/** Drop entries whose editor section is hidden on this pack (e.g. MJ Conclusion). */
function pruneHiddenEntries(
  entries: readonly TableOfContentsEntry[],
  hidden: ReadonlySet<string>
): TableOfContentsEntry[] {
  const next: TableOfContentsEntry[] = [];
  for (const entry of entries) {
    if (entry.sectionKey && hidden.has(entry.sectionKey)) continue;
    const children = entry.children
      ? pruneHiddenEntries(entry.children, hidden)
      : undefined;
    if (entry.children && (!children || children.length === 0)) {
      if (!entry.sectionKey) continue;
      next.push({ label: entry.label, sectionKey: entry.sectionKey });
      continue;
    }
    next.push(
      children?.length
        ? { ...entry, children }
        : { label: entry.label, sectionKey: entry.sectionKey }
    );
  }
  return next;
}

/**
 * Left-rail Contents outline for every document type. The Attachments |
 * Contents chrome is the same on every pack; this returns the Word recipe
 * when the type has one, otherwise the editor section list.
 */
export function getReportTableOfContents(
  documentType: DocumentType,
  customerId = resolveCustomerId()
): TableOfContentsEntry[] {
  switch (documentType) {
    case "design_verification":
      return customerId === "convergent"
        ? CONVERGENT_SOFTWARE_DV_TOC
        : DEMO_SOFTWARE_DV_TOC;
    case "mechanical_design_verification":
      return CONVERGENT_MECHANICAL_DV_TOC;
    case "investigation_report":
      return investigationTableOfContents(customerId);
    case "quality_risk_assessment":
      return QRA_TOC;
    case "equipment_lifecycle_report":
      return ELR_TOC;
    case "generic_document":
      return GENERIC_DOCUMENT_TOC;
    default: {
      const _exhaustive: never = documentType;
      return _exhaustive;
    }
  }
}

/** Flatten nested TOC entries (parent before children) for tests and scroll targets. */
export function flattenTableOfContents(
  entries: readonly TableOfContentsEntry[]
): TableOfContentsEntry[] {
  const flat: TableOfContentsEntry[] = [];
  for (const entry of entries) {
    flat.push(entry);
    if (entry.children?.length) {
      flat.push(...flattenTableOfContents(entry.children));
    }
  }
  return flat;
}
