import type {
  AttachmentProcessingStatus,
  CriterionStatus,
  ReportStatus,
  SectionType,
  CommentStatus,
  CommentKind,
} from "@/db/schema";


export type ReportRecord = {
  id: string;
  deviationNo: string;
  date: string;
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean };
  otherTools: string;
  status: ReportStatus;
  authorId: string;
  assignedManagerId: string | null;
  assignedManagerIds?: string[];
  createdAt: string;
  updatedAt: string;
};

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

export type ReportBundle = {
  report: ReportRecord;
  sections: ReportSectionRecord[];
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
  attachments: ReportAttachmentRecord[];
};
