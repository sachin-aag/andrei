import { describe, expect, it } from "vitest";
import {
  criteriaReviewAnswerKeys,
  isReportLevelCriteriaReviewItem,
  parseCriteriaReviewDatasetItem,
  reviewerProgress,
  sessionProgress,
  type CriteriaReviewDatasetItem,
} from "@/lib/langfuse/criteria-dataset";

const item: CriteriaReviewDatasetItem = {
  id: "review-report-example",
  input: {
    deviationNo: "DEV-1",
    sourceFile: "example.docx",
    reportDate: "2026-05-21",
    sections: [
      {
        section: "define",
        sectionIndex: 1,
        sectionContent: "Define content",
        systemPrompt: "Prompt",
        previousSections: [],
        criteria: [
          {
            index: 1,
            answerKey: "define::define.what_happened",
            criterionKey: "define.what_happened",
            label: "What happened",
            description: "Description",
            aiStatus: "met",
            aiReasoning: "Reasoning",
          },
        ],
      },
      {
        section: "measure",
        sectionIndex: 2,
        sectionContent: "Measure content",
        systemPrompt: "Prompt",
        previousSections: [{ section: "define", content: "Define content" }],
        criteria: [
          {
            index: 1,
            answerKey: "measure::measure.evidence",
            criterionKey: "measure.evidence",
            label: "Evidence",
            description: "Description",
            aiStatus: "partially_met",
            aiReasoning: "Reasoning",
          },
        ],
      },
    ],
  },
  expectedOutput: {
    sections: [],
  },
  metadata: {
    sourceFile: "example.docx",
    deviationNo: "DEV-1",
    totalCriterionCount: 2,
    promptVersion: "test",
    humanReviewStatus: "in_progress",
    humanReviews: {
      "reviewer-1": {
        reviewer: {
          id: "reviewer-1",
          name: "Reviewer One",
          employeeId: "1",
        },
        status: "in_progress",
        answers: {
          "define::define.what_happened": {
            section: "define",
            criterionKey: "define.what_happened",
            criteriaEvaluationAgreement: "yes",
            reasoningAgreement: "yes",
          },
        },
      },
      "reviewer-2": {
        reviewer: {
          id: "reviewer-2",
          name: "Reviewer Two",
          employeeId: "2",
        },
        status: "pending",
        answers: {},
      },
    },
  },
};

describe("criteriaReviewAnswerKeys", () => {
  it("returns report-order section and criterion keys", () => {
    expect(criteriaReviewAnswerKeys(item)).toEqual([
      "define::define.what_happened",
      "measure::measure.evidence",
    ]);
  });

  it("does not treat legacy section-level items as report-level rows", () => {
    const legacy = parseCriteriaReviewDatasetItem({
      id: "review-old--define",
      input: {
        deviationNo: "DEV-1",
        sourceFile: "old.docx",
        section: "define",
        reportDate: "2026-05-21",
        context: { sectionContent: "Old content" },
        subQuestions: [],
      },
      metadata: {
        sourceFile: "old.docx",
        deviationNo: "DEV-1",
        section: "define",
        subQuestionCount: 0,
        promptVersion: "old",
        humanReviewStatus: "pending",
      },
    });

    expect(isReportLevelCriteriaReviewItem(legacy)).toBe(false);
    expect(criteriaReviewAnswerKeys(legacy)).toEqual([]);
  });
});

describe("reviewerProgress", () => {
  it("tracks progress independently per reviewer", () => {
    expect(reviewerProgress(item, "reviewer-1")).toMatchObject({
      answered: 1,
      total: 2,
      status: "in_progress",
    });
    expect(reviewerProgress(item, "reviewer-2")).toMatchObject({
      answered: 0,
      total: 2,
      status: "pending",
    });
  });
});

describe("sessionProgress", () => {
  it("summarizes report progress without collapsing reviewer answer sets", () => {
    expect(sessionProgress(item)).toMatchObject({
      answered: 1,
      total: 2,
      reviewerCount: 2,
      status: "in_progress",
    });
  });
});
