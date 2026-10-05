import type { ReviewCategory } from "./ui";

export const REVIEW_SEVERITY_ORDER = ["critical", "major", "minor"] as const;

export type ReviewSeverity = (typeof REVIEW_SEVERITY_ORDER)[number];

export type ReviewSeverityCounts = Record<ReviewSeverity, number>;

export const REVIEW_SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

export const REVIEW_SEVERITY_CHIP_CLASS: Record<ReviewSeverity, string> = {
  critical: "bg-red-600 text-white",
  major: "bg-amber-500 text-white",
  minor: "bg-sky-600 text-white",
};

export function isReviewSeverity(value: string): value is ReviewSeverity {
  return (REVIEW_SEVERITY_ORDER as readonly string[]).includes(value);
}

export function coerceReviewSeverity(value: string): ReviewSeverity {
  if (isReviewSeverity(value)) return value;
  if (value === "error") return "critical";
  if (value === "warning") return "major";
  return "minor";
}

export function emptySeverityCounts(): ReviewSeverityCounts {
  return { critical: 0, major: 0, minor: 0 };
}

export function countFindingSeverities(
  findings: Array<{ severity: string }>
): ReviewSeverityCounts {
  const counts = emptySeverityCounts();
  for (const finding of findings) {
    counts[coerceReviewSeverity(finding.severity)] += 1;
  }
  return counts;
}

export function worstSeverity(
  counts: ReviewSeverityCounts
): ReviewSeverity | null {
  for (const severity of REVIEW_SEVERITY_ORDER) {
    if (counts[severity] > 0) return severity;
  }
  return null;
}

export function severityRank(severity: string): number {
  const index = REVIEW_SEVERITY_ORDER.indexOf(coerceReviewSeverity(severity));
  return index;
}

export function compareSeverityDesc(a: string, b: string): number {
  return severityRank(a) - severityRank(b);
}

export function severityForEvalStatus(status: string): ReviewSeverity {
  return status === "not_met" ? "critical" : "major";
}

export function sortCategoriesBySeverity(
  categories: readonly ReviewCategory[],
  countsFor: (category: ReviewCategory) => ReviewSeverityCounts
): ReviewCategory[] {
  return [...categories].toSorted((left, right) => {
    const leftCounts = countsFor(left);
    const rightCounts = countsFor(right);
    const leftWorst = worstSeverity(leftCounts);
    const rightWorst = worstSeverity(rightCounts);
    const leftRank = leftWorst ? severityRank(leftWorst) : REVIEW_SEVERITY_ORDER.length;
    const rightRank = rightWorst ? severityRank(rightWorst) : REVIEW_SEVERITY_ORDER.length;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (leftWorst) {
      const delta = rightCounts[leftWorst] - leftCounts[leftWorst];
      if (delta !== 0) return delta;
    }
    return categories.indexOf(left) - categories.indexOf(right);
  });
}

export function totalSeverityCount(counts: ReviewSeverityCounts): number {
  return counts.critical + counts.major + counts.minor;
}
