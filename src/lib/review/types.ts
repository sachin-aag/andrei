import type { DocumentType, ReviewFindingKind, ReviewFindingSeverity } from "@/db/schema";
import type { ReportWithManagers } from "@/lib/reports/require-report-access";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import type { AllSectionsContent } from "@/lib/ai/evaluation-content-hash";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import type { ReviewCategory, ReviewCheckId, ReviewCheckKind } from "./ui";

export {
  REVIEW_CATEGORIES,
  STATIC_REVIEW_CHECK_IDS,
  categoryLabel,
  isReviewCategory,
  type ReviewCategory,
  type ReviewCheckId,
  type ReviewCheckKind,
  type ReviewCheckUiStatus,
  type StaticReviewCheckId,
  type ReviewCheckDto,
  type ReviewFindingDto,
} from "./ui";

export type ReviewFindingDraft = {
  section: string | null;
  contentPath: string | null;
  anchorText: string;
  message: string;
  severity: ReviewFindingSeverity;
  kind: ReviewFindingKind;
  commentId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ReviewCheckResult = {
  findings: ReviewFindingDraft[];
};

export type ReviewRunContext = {
  report: ReportWithManagers;
  user: WorkspaceUser;
  documentType: DocumentType;
  sections: AllSectionsContent;
  sectionRows: Array<{ id: string; section: string }>;
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
  attachmentFilenames: string[];
  attachmentByFilename: Map<string, string>;
  attachmentPages: Array<{ filename: string; pageNumber: number | null }>;
};

export type ReviewCheckDefinition = {
  id: ReviewCheckId;
  category: ReviewCategory;
  label: string;
  description: string;
  standardTag: string;
  kind: ReviewCheckKind;
  appliesTo: (documentType: DocumentType) => boolean;
  run?: (ctx: ReviewRunContext) => Promise<ReviewCheckResult>;
};
