import { z } from "zod";
import type { CriterionStatus, SectionType } from "@/db/schema";

export const CRITERIA_EVALUATION_AGREEMENTS = [
  "yes",
  "no",
] as const;

export const REASONING_AGREEMENTS = [
  "yes",
  "partially",
  "no",
] as const;

export type CriteriaEvaluationAgreement =
  (typeof CRITERIA_EVALUATION_AGREEMENTS)[number];
export type ReasoningAgreement = (typeof REASONING_AGREEMENTS)[number];

export const CRITERIA_EVALUATION_AGREEMENT_LABELS: Record<
  CriteriaEvaluationAgreement,
  string
> = {
  yes: "Yes",
  no: "No",
};

export const REASONING_AGREEMENT_LABELS: Record<ReasoningAgreement, string> = {
  yes: "Yes",
  partially: "Partially",
  no: "No",
};

export const MIN_HUMAN_COMMENT_LENGTH = 20;

export const REVIEWABLE_SECTION_TYPES = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
] as const;

export const humanReviewerSchema = z.object({
  id: z.string().trim().min(1, "Reviewer ID is required."),
  name: z.string().trim().min(1, "Reviewer name is required."),
  email: z.string().email("Valid email is required."),
});

export const humanSubAnswerSchema = z.object({
  section: z.enum(REVIEWABLE_SECTION_TYPES),
  criterionKey: z.string().min(1),
  criteriaEvaluationAgreement: z.enum(CRITERIA_EVALUATION_AGREEMENTS),
  reasoningAgreement: z.enum(REASONING_AGREEMENTS),
  comment: z.string().optional(),
  suggestedStatus: z
    .enum(["met", "partially_met", "not_met", "not_evaluated"])
    .optional()
    .nullable(),
});

/** Draft saves may omit judgment on unanswered sub-questions. */
export const humanSubAnswerDraftSchema = z.object({
  section: z.enum(REVIEWABLE_SECTION_TYPES),
  criterionKey: z.string().min(1),
  criteriaEvaluationAgreement: z
    .enum(CRITERIA_EVALUATION_AGREEMENTS)
    .optional(),
  reasoningAgreement: z.enum(REASONING_AGREEMENTS).optional(),
  comment: z.string().optional(),
  suggestedStatus: z
    .enum(["met", "partially_met", "not_met", "not_evaluated"])
    .optional()
    .nullable(),
});

export const humanReviewDraftSchema = z.object({
  reviewedAt: z.string().datetime().optional(),
  reviewer: humanReviewerSchema,
  subAnswers: z.array(humanSubAnswerDraftSchema),
});

export type HumanSubAnswer = z.infer<typeof humanSubAnswerSchema>;
export type HumanSubAnswerDraft = z.infer<typeof humanSubAnswerDraftSchema>;
export type HumanReviewer = z.infer<typeof humanReviewerSchema>;

export const humanReviewSchema = z.object({
  reviewedAt: z.string().datetime().optional(),
  reviewer: humanReviewerSchema,
  subAnswers: z.array(humanSubAnswerSchema),
});

export type HumanReview = z.infer<typeof humanReviewSchema>;

/** Stored on dataset metadata while review is in progress. */
export type HumanReviewDraft = z.infer<typeof humanReviewDraftSchema>;

export function humanAnswerKey(section: SectionType, criterionKey: string): string {
  return `${section}::${criterionKey}`;
}

export function humanCommentRequired(
  criteriaEvaluationAgreement?: CriteriaEvaluationAgreement,
  reasoningAgreement?: ReasoningAgreement
): boolean {
  return !(
    criteriaEvaluationAgreement === "yes" && reasoningAgreement === "yes"
  );
}

const INCOMPLETE_ANSWER_MESSAGE =
  "Complete all required fields for this criterion.";

export function getHumanSubAnswerValidationError(
  draft: HumanSubAnswerDraft
): string | null {
  const parsed = humanSubAnswerSchema.safeParse(draft);
  if (!parsed.success) {
    return INCOMPLETE_ANSWER_MESSAGE;
  }
  return validateHumanSubAnswer(parsed.data);
}

export function isHumanSubAnswerComplete(draft: HumanSubAnswerDraft): boolean {
  return getHumanSubAnswerValidationError(draft) === null;
}

export function validateHumanSubAnswer(answer: HumanSubAnswer): string | null {
  if (
    answer.criteriaEvaluationAgreement === "no" &&
    !answer.suggestedStatus
  ) {
    return "Correct traffic-light status is required when you do not agree with the criteria evaluation.";
  }
  if (
    !humanCommentRequired(
      answer.criteriaEvaluationAgreement,
      answer.reasoningAgreement
    )
  ) {
    return null;
  }
  const comment = answer.comment?.trim() ?? "";
  if (comment.length < MIN_HUMAN_COMMENT_LENGTH) {
    return `Your reasoning is required (at least ${MIN_HUMAN_COMMENT_LENGTH} characters) unless both answers are Yes.`;
  }
  return null;
}

export function validateHumanReview(
  subAnswers: HumanSubAnswer[],
  expectedAnswerKeys: string[]
): string | null {
  if (subAnswers.length !== expectedAnswerKeys.length) {
    return `Expected ${expectedAnswerKeys.length} answers, got ${subAnswers.length}.`;
  }
  const keys = new Set(
    subAnswers.map((a) => humanAnswerKey(a.section, a.criterionKey))
  );
  for (const key of expectedAnswerKeys) {
    if (!keys.has(key)) {
      return `Missing answer for ${key}.`;
    }
  }
  for (const answer of subAnswers) {
    const err = validateHumanSubAnswer(answer);
    if (err) return err;
  }
  return null;
}

export const AI_STATUS_LABEL: Record<CriterionStatus, string> = {
  met: "Met",
  partially_met: "Partially met",
  not_met: "Not met",
  not_evaluated: "Not evaluated",
};
