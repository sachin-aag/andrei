import type {
  AttachmentProcessingStatus,
  CriterionStatus,
  DocumentType,
  ReportStatus,
  SectionType,
  CommentStatus,
  CommentKind,
  InvestigationReportMetadata,
  DesignVerificationMetadata,
  ReportMetadata,
} from "@/db/schema";

export type ReportRecord = {
  id: string;
  documentType: DocumentType;
  documentNo: string;
  date: string;
  metadata: ReportMetadata;
  status: ReportStatus;
  authorId: string;
  assignedManagerId: string | null;
  assignedManagerIds?: string[];
  createdAt: string;
  updatedAt: string;
};

/** Convenience accessors for investigation_report metadata. */
export function investigationToolsUsed(report: {
  metadata: ReportMetadata;
}): {
  sixM: boolean;
  fiveWhy: boolean;
  brainstorming: boolean;
} {
  const meta = report.metadata as InvestigationReportMetadata;
  return (
    meta.toolsUsed ?? { sixM: false, fiveWhy: false, brainstorming: false }
  );
}

export function investigationOtherTools(report: {
  metadata: ReportMetadata;
}): string {
  const meta = report.metadata as InvestigationReportMetadata;
  return meta.otherTools ?? "";
}

export function isInvestigationReport(report: {
  documentType: DocumentType;
}): boolean {
  return report.documentType === "investigation_report";
}

export function isDesignVerification(report: {
  documentType: DocumentType;
}): boolean {
  return report.documentType === "design_verification";
}

export function designVerificationMetadata(report: {
  metadata: ReportMetadata;
}): DesignVerificationMetadata {
  const meta = report.metadata as Partial<DesignVerificationMetadata>;
  return {
    revision: meta.revision ?? "",
    effectiveDate: meta.effectiveDate ?? "",
    productName: meta.productName ?? "",
    modelNumber: meta.modelNumber ?? "",
    projectName: meta.projectName ?? "",
    authorName: meta.authorName ?? "",
    reviewerName: meta.reviewerName ?? "",
    approverName: meta.approverName ?? "",
  };
}

export type ReportSectionRecord = {
  id: string;
  reportId: string;
  section: SectionType;
  content: unknown;
  updatedAt: string;
};

export type EvaluationRecord = {
  id: string;
  reportId: string;
  sectionId: string;
  section: SectionType;
  criterionKey: string;
  criterionLabel: string;
  status: CriterionStatus;
  reasoning: string;
  bypassed: boolean;
  evaluatedContentHash: string;
  updatedAt: string;
};

export type CommentRecord = {
  id: string;
  reportId: string;
  parentId: string | null;
  sectionId: string | null;
  section: SectionType | null;
  authorId: string;
  content: string;
  anchorText: string;
  contentPath: string | null;
  fromPos: number | null;
  toPos: number | null;
  status: CommentStatus;
  kind: CommentKind;
  source: string;
  externalAuthorName: string | null;
  externalAuthorInitials: string | null;
  externalCommentId: string | null;
  externalCreatedAt: string | null;
  locked: boolean;
  evaluationId: string | null;
  createdAt: string;
};

/** Client-facing attachment DTO — never includes object keys or hashes. */
export type ReportAttachmentRecord = {
  id: string;
  reportId: string;
  /** Null = top level of the report's document tree. */
  folderId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  processingStatus: AttachmentProcessingStatus;
  processingProgress: number;
  processingError: string | null;
  uploadedAt: string;
  deletedAt: string | null;
};

/** Folder node in a report's document tree. */
export type ReportAttachmentFolderRecord = {
  id: string;
  reportId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
};

export type ReportBundle = {
  report: ReportRecord;
  sections: ReportSectionRecord[];
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
  attachments: ReportAttachmentRecord[];
  attachmentFolders: ReportAttachmentFolderRecord[];
};
