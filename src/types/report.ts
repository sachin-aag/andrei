import type {
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
  suggestedFix: { anchorText: string; replacementText: string };
  fixApplied: boolean;
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
  evaluationId: string | null;
  createdAt: string;
};

export type ReportBundle = {
  report: ReportRecord;
  sections: ReportSectionRecord[];
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
};
