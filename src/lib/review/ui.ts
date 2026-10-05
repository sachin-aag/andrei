export const REVIEW_CATEGORIES = [
  "report",
  "fda",
  "citations",
  "writing",
] as const;

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const STATIC_REVIEW_CHECK_IDS = [
  "citations.resolves",
  "citations.supports_claim",
  "citations.uncited_facts",
  "citations.external_refs",
  "writing.grammar",
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

export type ReviewFindingDto = {
  id: string;
  checkId: string;
  section: string | null;
  contentPath: string | null;
  anchorText: string;
  message: string;
  severity: string;
  kind: string;
  commentId: string | null;
  status: string;
  metadata: Record<string, unknown>;
};

export type ReviewRunWave = {
  category?: ReviewCategory;
  checkIds?: string[];
};

/** Split Run all into one request per category so a 60s function cannot eat every LLM check. */
export function reviewRunWaves(
  checks: Array<{ id: string; kind: string; category: ReviewCategory }>,
  requested?: { checkIds?: string[]; category?: ReviewCategory }
): ReviewRunWave[] {
  if (requested?.checkIds && requested.checkIds.length > 0) {
    return [{ checkIds: requested.checkIds }];
  }
  if (requested?.category) {
    return [{ category: requested.category }];
  }
  return REVIEW_CATEGORIES.flatMap((category) => {
    const hasRun = checks.some(
      (check) => check.kind === "run" && check.category === category
    );
    return hasRun ? [{ category }] : [];
  });
}

export type ReviewCheckDto = {
  id: ReviewCheckId;
  category: ReviewCategory;
  categoryLabel: string;
  label: string;
  description: string;
  standardTag: string;
  kind: ReviewCheckKind;
  status: ReviewCheckUiStatus;
  issueCount: number;
  lastRunAt: string | null;
  error: string | null;
};
