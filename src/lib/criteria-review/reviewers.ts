import { getLangfuseClient, isLangfuseConfigured } from "@/lib/langfuse/client";
import {
  humanReviewerSchema,
  type HumanReviewer,
} from "@/lib/criteria-review/human-judgment";
import { slugifyCriteriaReviewIdPart } from "@/lib/langfuse/criteria-dataset";

export const CRITERIA_REVIEW_REVIEWERS_DATASET_NAME =
  "criteria-evaluations/reviewers" as const;

type ReviewerDatasetRow = {
  id: string;
  input: unknown;
  metadata?: unknown;
};

function reviewerIdForEmployee(employeeId: string): string {
  return `reviewer-${slugifyCriteriaReviewIdPart(employeeId)}`;
}

export function defaultCriteriaReviewReviewers(): HumanReviewer[] {
  return [];
}

async function ensureReviewersDataset(): Promise<void> {
  if (!isLangfuseConfigured()) return;
  const langfuse = getLangfuseClient();
  try {
    await langfuse.api.datasets.create({
      name: CRITERIA_REVIEW_REVIEWERS_DATASET_NAME,
      description: "Reviewer registry for criteria evaluation human reviews.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists|duplicate|409/i.test(msg)) throw e;
  }
}

export async function listCriteriaReviewReviewers(): Promise<HumanReviewer[]> {
  const byId = new Map<string, HumanReviewer>();
  for (const reviewer of defaultCriteriaReviewReviewers()) {
    byId.set(reviewer.id, reviewer);
  }

  if (!isLangfuseConfigured()) {
    return [];
  }

  await ensureReviewersDataset();
  const langfuse = getLangfuseClient();
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await langfuse.api.datasetItems.list({
      datasetName: CRITERIA_REVIEW_REVIEWERS_DATASET_NAME,
      page,
      limit,
    });
    const data = res.data as ReviewerDatasetRow[];
    for (const row of data) {
      const parsed = humanReviewerSchema.safeParse(row.input);
      if (parsed.success) {
        byId.set(parsed.data.id, parsed.data);
      }
    }
    if (data.length < limit) break;
    page += 1;
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCriteriaReviewReviewer(params: {
  name: string;
  employeeId: string;
}): Promise<HumanReviewer> {
  const reviewer = humanReviewerSchema.parse({
    id: reviewerIdForEmployee(params.employeeId),
    name: params.name,
    employeeId: params.employeeId,
  });

  if (!isLangfuseConfigured()) return reviewer;

  await ensureReviewersDataset();
  const langfuse = getLangfuseClient();
  await langfuse.api.datasetItems.create({
    datasetName: CRITERIA_REVIEW_REVIEWERS_DATASET_NAME,
    id: reviewer.id,
    input: reviewer,
    metadata: { employeeId: reviewer.employeeId },
    status: "ACTIVE",
  });

  return reviewer;
}
