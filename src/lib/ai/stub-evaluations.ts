import type { CriterionStatus, SectionType } from "@/db/schema";
import type { CriterionEvaluationResult } from "@/lib/ai/evaluate";
import { CRITERIA_BY_SECTION, EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import stubEvaluationsJson from "@/lib/improve-ai/fixtures/stub-evaluations.json";

type StubEvaluationEntry = {
  section: SectionType;
  criterionKey: string;
  status: "met" | "partially_met" | "not_met";
  reasoning: string;
};

const stubByKey = new Map<string, StubEvaluationEntry>(
  (stubEvaluationsJson as StubEvaluationEntry[]).map((entry) => [
    entry.criterionKey,
    entry,
  ])
);

function defaultStatusForKey(key: string, index: number): CriterionStatus {
  const override = stubByKey.get(key);
  if (override) return override.status;
  return index % 3 === 0 ? "met" : index % 3 === 1 ? "partially_met" : "not_met";
}

function defaultReasoningForKey(key: string): string {
  return stubByKey.get(key)?.reasoning ?? "Stub evaluation for automated tests.";
}

/** Returns criterion evaluation results for a section using the static fixture. */
export function getStubCriterionEvaluations(
  section: SectionType
): CriterionEvaluationResult[] {
  const criteria = CRITERIA_BY_SECTION[section] ?? [];
  return criteria.map((criterion, index) => ({
    criterionKey: criterion.key,
    criterionLabel: criterion.label,
    status: defaultStatusForKey(criterion.key, index),
    reasoning: defaultReasoningForKey(criterion.key),
  }));
}

/** Validates fixture covers every evaluable criterion key. */
export function assertStubEvaluationsComplete(): void {
  const missing: string[] = [];
  for (const section of EVALUATABLE_SECTIONS) {
    for (const criterion of CRITERIA_BY_SECTION[section] ?? []) {
      if (!stubByKey.has(criterion.key)) {
        missing.push(criterion.key);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `stub-evaluations.json missing keys: ${missing.join(", ")}`
    );
  }
}
