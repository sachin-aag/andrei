import { LangfuseClient } from "@langfuse/client";
import {
  CRITERIA_REVIEW_DATASET_NAME,
  isReportLevelCriteriaReviewItem,
  parseCriteriaReviewDatasetItem,
  type CriteriaReviewDatasetItem,
  type CriteriaReviewSessionMetadata,
} from "@/lib/langfuse/criteria-dataset";
import type { HumanReviewDraft } from "@/lib/criteria-review/human-judgment";

let cachedClient: LangfuseClient | null = null;

export function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
      process.env.LANGFUSE_SECRET_KEY?.trim()
  );
}

export function getLangfuseClient(): LangfuseClient {
  if (!isLangfuseConfigured()) {
    throw new Error(
      "Langfuse is not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env.local."
    );
  }
  if (!cachedClient) {
    cachedClient = new LangfuseClient({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl:
        process.env.LANGFUSE_BASE_URL?.trim() ||
        process.env.LANGFUSE_HOST?.trim() ||
        "https://cloud.langfuse.com",
    });
  }
  return cachedClient;
}

export async function ensureCriteriaReviewDataset(): Promise<void> {
  const langfuse = getLangfuseClient();
  try {
    await langfuse.api.datasets.create({
      name: CRITERIA_REVIEW_DATASET_NAME,
      description:
        "Human review of criteria (traffic-light) evaluations on sample deviation reports. " +
        "One item per report with ordered sections and criteria.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists|duplicate|409/i.test(msg)) throw e;
  }
}

export async function upsertCriteriaReviewSessionItem(
  item: CriteriaReviewDatasetItem,
  options: { preserveHumanReview?: boolean } = {}
): Promise<void> {
  const langfuse = getLangfuseClient();
  const existing = options.preserveHumanReview
    ? await getCriteriaReviewSession(item.id)
    : null;
  const metadata: CriteriaReviewDatasetItem["metadata"] =
    existing?.metadata.humanReviews || existing?.metadata.humanReview
      ? {
          ...item.metadata,
          humanReviews: existing.metadata.humanReviews,
          humanReview: existing.metadata.humanReview,
          humanReviewStatus: existing.metadata.humanReviewStatus,
        }
      : item.metadata;

  await langfuse.api.datasetItems.create({
    datasetName: CRITERIA_REVIEW_DATASET_NAME,
    id: item.id,
    input: item.input,
    expectedOutput: item.expectedOutput,
    metadata,
    status: "ACTIVE",
  });
}

type DatasetItemRow = {
  id: string;
  input: unknown;
  expectedOutput?: unknown;
  metadata?: unknown;
};

export async function listCriteriaReviewSessions(): Promise<
  CriteriaReviewDatasetItem[]
> {
  const langfuse = getLangfuseClient();
  const items: CriteriaReviewDatasetItem[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await langfuse.api.datasetItems.list({
      datasetName: CRITERIA_REVIEW_DATASET_NAME,
      page,
      limit,
    });
    const data = res.data as DatasetItemRow[];
    for (const row of data) {
      const item = parseCriteriaReviewDatasetItem(row);
      if (isReportLevelCriteriaReviewItem(item)) {
        items.push(item);
      }
    }
    if (data.length < limit) break;
    page += 1;
  }

  return items.sort((a, b) => {
    const file = a.input.sourceFile.localeCompare(b.input.sourceFile);
    if (file !== 0) return file;
    return a.input.deviationNo.localeCompare(b.input.deviationNo);
  });
}

export async function getCriteriaReviewSession(
  id: string
): Promise<CriteriaReviewDatasetItem | null> {
  const langfuse = getLangfuseClient();
  try {
    const row = await langfuse.api.datasetItems.get(id);
    const item = parseCriteriaReviewDatasetItem({
      id: row.id,
      input: row.input,
      expectedOutput: row.expectedOutput,
      metadata: row.metadata,
    });
    return isReportLevelCriteriaReviewItem(item) ? item : null;
  } catch {
    return null;
  }
}

export async function updateCriteriaReviewHumanReview(
  id: string,
  params: {
    metadata: CriteriaReviewSessionMetadata;
    humanReview: HumanReviewDraft;
    status: CriteriaReviewSessionMetadata["humanReviewStatus"];
  }
): Promise<CriteriaReviewDatasetItem> {
  const existing = await getCriteriaReviewSession(id);
  if (!existing) {
    throw new Error(`Review session not found: ${id}`);
  }

  const metadata: CriteriaReviewSessionMetadata = {
    ...existing.metadata,
    ...params.metadata,
    humanReview: params.humanReview,
    humanReviewStatus: params.status,
  };

  if (params.status === "completed" && params.humanReview.reviewedAt) {
    metadata.humanReviewStatus = "completed";
  }

  const updated: CriteriaReviewDatasetItem = {
    ...existing,
    metadata,
  };

  await upsertCriteriaReviewSessionItem(updated);
  return updated;
}
