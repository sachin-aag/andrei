import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";

export type ImportedSections = SectionContentMap;

export type ImportedReportHeader = {
  date?: Date;
  deviationNo?: string;
  otherTools?: string;
};

export type ImportedReportComment = {
  parentExternalCommentId: string | null;
  externalCommentId: string;
  externalAuthorName: string;
  externalAuthorInitials: string | null;
  externalCreatedAt: Date | null;
  content: string;
  anchorText: string;
  section: SectionType;
  contentPath: string | null;
  fromPos: number | null;
  toPos: number | null;
};

export type ImportedReportContent = {
  sections: ImportedSections;
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean };
  header: ImportedReportHeader;
  comments: ImportedReportComment[];
};

export type ImportSectionKey = keyof SectionContentMap;
export type EditableKey = ImportSectionKey;

export const SECTION_ORDER: ImportSectionKey[] = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "documents_reviewed",
  "attachments",
  "signature_approvals",
];

export type HeadingMatch = {
  key: ImportSectionKey;
  remainder: string;
};

export const NON_EDITABLE_EXPORT_HEADING_RE =
  /^(?:details\s+investigation|prepared\s+by|reviewed\s+by|approved(?:\s+by)?)/i;
