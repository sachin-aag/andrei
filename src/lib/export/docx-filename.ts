import type { DocumentType } from "@/db/schema";

export function reportExportDocxFileName(
  documentType: DocumentType,
  documentNo: string
): string {
  const safe = (documentNo || "report")
    .replace(/[^a-zA-Z0-9_\-/]/g, "_")
    .replace(/\//g, "-");
  switch (documentType) {
    case "design_verification":
      return `Design_Verification_Report_${safe}.docx`;
    case "investigation_report":
      return `Investigation_Report_${safe}.docx`;
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
    case "investigation_report":
      return "investigation-report.docx";
    default: {
      const _exhaustive: never = documentType;
      return _exhaustive;
    }
  }
}
