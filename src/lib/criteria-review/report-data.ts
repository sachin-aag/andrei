import type { SectionType, CriterionStatus } from "@/db/schema";
import { getCriteria } from "@/lib/ai/criteria";
import { contextForPrompt } from "@/lib/ai/section-context";
import { buildEvaluationSystemPrompt } from "@/lib/ai/section-prompts";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import type { BulkEvalRow } from "@/lib/sample-eval/bulk-eval-aggregates";
import {
  humanAnswerKey,
  type HumanReviewer,
  type HumanSubAnswerDraft,
} from "@/lib/criteria-review/human-judgment";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { EDITABLE_SECTIONS } from "@/types/sections";

export type CriteriaReviewCriterion = {
  index: number;
  answerKey: string;
  criterionKey: string;
  label: string;
  description: string;
  aiStatus: CriterionStatus;
  aiReasoning: string;
};

export type CriteriaReviewPreviousSection = {
  section: SectionType;
  content: string;
};

export type CriteriaReviewReportSection = {
  section: SectionType;
  sectionIndex: number;
  sectionContent: string;
  systemPrompt: string;
  previousSections: CriteriaReviewPreviousSection[];
  criteria: CriteriaReviewCriterion[];
};

export type CriteriaReviewReportInput = {
  deviationNo: string;
  sourceFile: string;
  reportDate: string;
  sections: CriteriaReviewReportSection[];
};

export type CriteriaReviewSessionExpectedOutput = {
  sections: Array<{
    section: SectionType;
    criteria: Array<{
      criterionKey: string;
      status: CriterionStatus;
      reasoning: string;
    }>;
  }>;
};

export type CriteriaReviewForReviewer = {
  reviewer: HumanReviewer;
  answers: Record<string, HumanSubAnswerDraft>;
  reviewedAt?: string;
  status: "pending" | "in_progress" | "completed";
};

export type CriteriaReviewSessionMetadata = {
  sourceFile: string;
  deviationNo: string;
  totalCriterionCount: number;
  promptVersion: string;
  humanReviewStatus: "pending" | "in_progress" | "completed";
  humanReviews?: Record<string, CriteriaReviewForReviewer>;
  /** Legacy section-level shape; ignored when loading from Neon. */
  humanReview?: {
    reviewer?: unknown;
    subAnswers?: Array<{
      section?: SectionType;
    criterionKey: string;
      criteriaEvaluationAgreement?: "yes" | "no";
      reasoningAgreement?: "yes" | "partially" | "no";
      comment?: string;
      suggestedStatus?: CriterionStatus | null;
    }>;
  };
};

export type CriteriaReviewDatasetItem = {
  id: string;
  input: CriteriaReviewReportInput;
  expectedOutput: CriteriaReviewSessionExpectedOutput;
  metadata: CriteriaReviewSessionMetadata;
};

export function slugifyCriteriaReviewIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.docx$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

export function criteriaReviewReportId(sourceFile: string): string {
  return `review-report-${slugifyCriteriaReviewIdPart(sourceFile)}`;
}

export function formatSectionContentForEvaluation(
  section: SectionType,
  content: unknown
): string {
  return typeof content === "string" ? content : contextForPrompt(section, content);
}

function rowsForSection(rows: BulkEvalRow[], section: SectionType): BulkEvalRow[] {
  const keys = getCriteria(section).map((c) => c.key);
  const byKey = new Map(rows.filter((r) => r.section === section).map((r) => [r.criterionKey, r]));
  return keys
    .map((key) => byKey.get(key))
    .filter((r): r is BulkEvalRow => r !== undefined);
}

function priorSections(section: SectionType): SectionType[] {
  const idx = EDITABLE_SECTIONS.indexOf(section as (typeof EDITABLE_SECTIONS)[number]);
  if (idx <= 0) return [];
  return EDITABLE_SECTIONS.slice(0, idx) as unknown as SectionType[];
}

function previousSectionsForReview(
  section: SectionType,
  allSections: AllSectionsContent
): CriteriaReviewPreviousSection[] {
  return priorSections(section).flatMap((priorSection) => {
    const content = allSections[priorSection];
    if (!content) return [];
    const formatted = formatSectionContentForEvaluation(priorSection, content);
    if (!formatted.trim() || formatted === "{}") return [];
    return [{ section: priorSection, content: formatted }];
  });
}

export function buildCriteriaReviewReportItem(params: {
  sourceFile: string;
  deviationNo: string;
  rows: BulkEvalRow[];
  allSections: AllSectionsContent;
  reportDate: string;
  promptVersion: string;
}): CriteriaReviewDatasetItem | null {
  const { rows, allSections } = params;
  const sections: CriteriaReviewReportSection[] = [];

  for (const section of EVALUATABLE_SECTIONS) {
    const sectionRows = rowsForSection(rows, section);
    if (sectionRows.length === 0) continue;

    const sectionContent = formatSectionContentForEvaluation(
      section,
      allSections[section]
    );
    if (!sectionContent.trim() || sectionContent === "{}") continue;

    const criteria = getCriteria(section);
    sections.push({
      section,
      sectionIndex: sections.length + 1,
      sectionContent,
      systemPrompt: buildEvaluationSystemPrompt(section),
      previousSections: previousSectionsForReview(section, allSections),
      criteria: sectionRows.map((row, i) => {
        const def = criteria.find((c) => c.key === row.criterionKey);
        return {
          index: i + 1,
          answerKey: humanAnswerKey(section, row.criterionKey),
          criterionKey: row.criterionKey,
          label: row.criterionLabel,
          description: def?.description ?? "",
          aiStatus: row.status,
          aiReasoning: row.reasoning,
        };
      }),
    });
  }

  if (sections.length === 0) return null;
  const totalCriterionCount = sections.reduce(
    (sum, section) => sum + section.criteria.length,
    0
  );

  return {
    id: criteriaReviewReportId(params.sourceFile),
    input: {
      deviationNo: params.deviationNo,
      sourceFile: params.sourceFile,
      reportDate: params.reportDate,
      sections,
    },
    expectedOutput: {
      sections: sections.map((section) => ({
        section: section.section,
        criteria: section.criteria.map((criterion) => ({
          criterionKey: criterion.criterionKey,
          status: criterion.aiStatus,
          reasoning: criterion.aiReasoning,
        })),
      })),
    },
    metadata: {
      sourceFile: params.sourceFile,
      deviationNo: params.deviationNo,
      totalCriterionCount,
      promptVersion: params.promptVersion,
      humanReviewStatus: "pending",
      humanReviews: {},
    },
  };
}

export function buildAllCriteriaReviewSessionItems(params: {
  sourceFile: string;
  deviationNo: string;
  rows: BulkEvalRow[];
  allSections: AllSectionsContent;
  reportDate: string;
  promptVersion: string;
}): CriteriaReviewDatasetItem[] {
  const item = buildCriteriaReviewReportItem(params);
  return item ? [item] : [];
}

export function parseCriteriaReviewDatasetItem(raw: {
  id: string;
  input: unknown;
  expectedOutput?: unknown;
  metadata?: unknown;
}): CriteriaReviewDatasetItem {
  return {
    id: raw.id,
    input: raw.input as CriteriaReviewReportInput,
    expectedOutput: (raw.expectedOutput ?? {
      sections: [],
    }) as CriteriaReviewSessionExpectedOutput,
    metadata: (raw.metadata ?? {
      humanReviewStatus: "pending",
      humanReviews: {},
    }) as CriteriaReviewSessionMetadata,
  };
}

export function isReportLevelCriteriaReviewItem(
  item: CriteriaReviewDatasetItem | null
): item is CriteriaReviewDatasetItem {
  return Boolean(
    item &&
      Array.isArray(item.input.sections) &&
      item.input.sections.every(
        (section) =>
          typeof section.section === "string" &&
          Array.isArray(section.criteria)
      )
  );
}

export function criteriaReviewAnswerKeys(item: CriteriaReviewDatasetItem): string[] {
  if (!isReportLevelCriteriaReviewItem(item)) return [];
  return item.input.sections.flatMap((section) =>
    section.criteria.map((criterion) => criterion.answerKey)
  );
}

export function reviewerProgress(
  item: CriteriaReviewDatasetItem,
  reviewerId: string
): {
  answered: number;
  total: number;
  status: CriteriaReviewForReviewer["status"];
} {
  const total = criteriaReviewAnswerKeys(item).length;
  const review = item.metadata.humanReviews?.[reviewerId];
  const answers = review?.answers ?? {};
  const answered = criteriaReviewAnswerKeys(item).filter((key) => {
    const answer = answers[key];
    return answer?.criteriaEvaluationAgreement && answer.reasoningAgreement;
  }).length;
  const status = review?.status ?? "pending";
  return { answered, total, status };
}

export function sessionProgress(item: CriteriaReviewDatasetItem): {
  answered: number;
  total: number;
  status: CriteriaReviewSessionMetadata["humanReviewStatus"];
  reviewerCount: number;
} {
  const total = criteriaReviewAnswerKeys(item).length;
  const reviews = Object.values(item.metadata.humanReviews ?? {});
  const answered = reviews.reduce((max, review) => {
    const count = Object.values(review.answers).filter(
      (answer) =>
        answer.criteriaEvaluationAgreement && answer.reasoningAgreement
    ).length;
    return Math.max(max, count);
  }, 0);
  const status = item.metadata.humanReviewStatus;
  return { answered, total, status, reviewerCount: reviews.length };
}
