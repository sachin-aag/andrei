import type { DocumentType } from "@/db/schema";

export function reportExportDocxFileName(
  documentType: DocumentType,
  documentNo: string,
  options?: { omitCitations?: boolean }
): string {
  const safe = (documentNo || "report")
    .replace(/[^a-zA-Z0-9_\-/]/g, "_")
    .replace(/\//g, "-");
  const suffix = options?.omitCitations ? "_without_citations" : "";
  switch (documentType) {
    case "design_verification":
      return `Design_Verification_Report_${safe}${suffix}.docx`;
    case "mechanical_design_verification":
      return `Mechanical_DV_Report_${safe}${suffix}.docx`;
    case "quality_risk_assessment":
      return `Quality_Risk_Assessment_${safe}${suffix}.docx`;
    case "investigation_report":
      return `Investigation_Report_${safe}${suffix}.docx`;
    case "generic_document":
      return `Document_${safe}${suffix}.docx`;
    default: {
      const _exhaustive: never = documentType;
      return _exhaustive;
    }
  }
}

export function reportExportDocxArchiveName(documentType: DocumentType): string {
  switch (documentType) {
    case "design_verification":
      return "design-verification-report.docx";
    case "mechanical_design_verification":
      return "mechanical-dv-report.docx";
    case "quality_risk_assessment":
      return "quality-risk-assessment.docx";
    case "investigation_report":
      return "investigation-report.docx";
    case "generic_document":
      return "document.docx";
    default: {
      const _exhaustive: never = documentType;
      return _exhaustive;
    }
  }
}
