import type { DocumentType, ReviewFindingKind, ReviewFindingSeverity } from "@/db/schema";
import type { ReportWithManagers } from "@/lib/reports/require-report-access";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import type { AllSectionsContent } from "@/lib/ai/evaluation-content-hash";
import type { CommentRecord, EvaluationRecord } from "@/types/report";

export const REVIEW_CATEGORIES = [
  "report",
  "fda",
  "citations",
  "writing",
] as const;

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const STATIC_REVIEW_CHECK_IDS = [
  "report.placeholders",
  "citations.resolves",
  "citations.supports_claim",
  "citations.uncited_facts",
  "citations.external_refs",
  "writing.grammar",
  "writing.terminology",
  "writing.cross_references",
  "writing.tense",
] as const;

export type StaticReviewCheckId = (typeof STATIC_REVIEW_CHECK_IDS)[number];

export type ReviewCheckId =
  | StaticReviewCheckId
  | `report.criteria.${string}`
  | `fda.${string}`;

export type ReviewCheckKind = "live" | "run";

export type ReviewCheckUiStatus =
  | "never_run"
  | "running"
  | "clean"
  | "issues"
  | "out_of_date"
  | "failed";

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

export function isReviewCategory(value: string): value is ReviewCategory {
  return (REVIEW_CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(category: ReviewCategory): string {
  switch (category) {
    case "report":
      return "Report";
    case "fda":
      return "FDA";
    case "citations":
      return "Citations";
    case "writing":
      return "Writing";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
