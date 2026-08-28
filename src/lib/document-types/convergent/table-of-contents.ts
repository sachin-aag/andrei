import type { DocumentType, SectionType } from "@/db/schema";
import { resolveCustomerId } from "@/lib/customers/resolve";

/** One row in the Convergent report table of contents (export-template hierarchy). */
export type TableOfContentsEntry = {
  label: string;
  sectionKey?: SectionType;
  children?: TableOfContentsEntry[];
};

/**
 * Software DV headings from `templates/convergent-design-verification-report-template.docx`.
 * Revision History is template-static (no editor section).
 */
const CONVERGENT_SOFTWARE_DV_TOC: TableOfContentsEntry[] = [
  { label: "Purpose", sectionKey: "purpose" },
  { label: "Scope", sectionKey: "scope" },
  { label: "Testers/Dates", sectionKey: "testers_dates" },
  { label: "Methods of Measurement", sectionKey: "methods_of_measurement" },
  { label: "Test Equipment", sectionKey: "test_equipment" },
  { label: "Deviations", sectionKey: "deviations" },
  { label: "Results and Discussion", sectionKey: "results_and_discussions" },
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

/** Convergent pack only — demo/MJ design verification uses a different shape. */
export function getReportTableOfContents(
  documentType: DocumentType,
  customerId = resolveCustomerId()
): TableOfContentsEntry[] | null {
  if (customerId !== "convergent") return null;
  return getConvergentTableOfContents(documentType);
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
