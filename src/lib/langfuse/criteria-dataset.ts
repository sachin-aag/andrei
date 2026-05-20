import type { SectionType } from "@/db/schema";
import { formatSectionContentForEvaluation } from "@/lib/ai/evaluate";
import { getCriteria, type CriterionDefinition } from "@/lib/ai/criteria";
import type { BulkEvalRow } from "@/lib/sample-eval/bulk-eval-aggregates";
import type { AllSectionsContent } from "@/lib/ai/evaluate";

export const CRITERIA_EVAL_DATASET_NAME =
  "criteria-evaluations/sample-human-review" as const;

export type CriteriaDatasetItemInput = {
  deviationNo: string;
  sourceFile: string;
  section: SectionType;
  criterion: {
    key: string;
    label: string;
    description: string;
  };
  sectionContent: string;
  reportDate: string;
};

export type CriteriaDatasetItemOutput = {
  status: BulkEvalRow["status"];
  reasoning: string;
};

export type CriteriaDatasetItemMetadata = {
  sourceFile: string;
  deviationNo: string;
  section: SectionType;
  criterionKey: string;
  reportDate: string;
  reviewIndex: number;
  humanReviewStatus: "pending";
};

export type CriteriaDatasetItemPayload = {
  id: string;
  input: CriteriaDatasetItemInput;
  expectedOutput: CriteriaDatasetItemOutput;
  metadata: CriteriaDatasetItemMetadata;
};

function slugifyIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.docx$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

export function criteriaDatasetItemId(
  sourceFile: string,
  criterionKey: string
): string {
  return `criteria-${slugifyIdPart(sourceFile)}--${criterionKey}`;
}

function criterionByKey(
  section: SectionType,
  criterionKey: string
): CriterionDefinition | undefined {
  return getCriteria(section).find((c) => c.key === criterionKey);
}

export function buildCriteriaDatasetItem(params: {
  row: BulkEvalRow;
  sectionContent: unknown;
  reportDate: string;
  reviewIndex: number;
}): CriteriaDatasetItemPayload | null {
  const { row, sectionContent, reportDate, reviewIndex } = params;
  const criterion = criterionByKey(row.section, row.criterionKey);
  if (!criterion) return null;

  const contentStr = formatSectionContentForEvaluation(row.section, sectionContent);
  if (!contentStr.trim() || contentStr === "{}") return null;

  return {
    id: criteriaDatasetItemId(row.sourceFile, row.criterionKey),
    input: {
      deviationNo: row.deviationNo,
      sourceFile: row.sourceFile,
      section: row.section,
      criterion: {
        key: criterion.key,
        label: criterion.label,
        description: criterion.description,
      },
      sectionContent: contentStr,
      reportDate,
    },
    expectedOutput: {
      status: row.status,
      reasoning: row.reasoning,
    },
    metadata: {
      sourceFile: row.sourceFile,
      deviationNo: row.deviationNo,
      section: row.section,
      criterionKey: row.criterionKey,
      reportDate,
      reviewIndex,
      humanReviewStatus: "pending",
    },
  };
}

export function buildCriteriaDatasetItemsFromRun(params: {
  rows: BulkEvalRow[];
  allSections: AllSectionsContent;
  reportDate: string;
  startIndex: number;
}): CriteriaDatasetItemPayload[] {
  const items: CriteriaDatasetItemPayload[] = [];
  let index = params.startIndex;

  for (const row of params.rows) {
    const sectionContent = params.allSections[row.section];
    const item = buildCriteriaDatasetItem({
      row,
      sectionContent,
      reportDate: params.reportDate,
      reviewIndex: index,
    });
    if (item) {
      items.push(item);
      index += 1;
    }
  }

  return items;
}
