import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  attachmentPageUsageEvents,
  reportAttachments,
} from "@/db/schema";
import { currentYearMonthUtc } from "@/lib/ai/usage/cycle";
import { isAttachmentPageBudgetTrackingSkipped } from "./enforcement";

export type RecordAttachmentPageUsageInput = {
  ingestRunId: string;
  attachmentId: string;
  reportId: string;
  pageCount: number;
  metadata?: Record<string, unknown>;
};

export async function recordAttachmentPageUsage(
  input: RecordAttachmentPageUsageInput
): Promise<void> {
  if (isAttachmentPageBudgetTrackingSkipped()) return;
  if (input.pageCount <= 0) return;

  const { db } = await import("@/db");
  await db
    .insert(attachmentPageUsageEvents)
    .values({
      id: createId(),
      yearMonth: currentYearMonthUtc(),
      pageCount: input.pageCount,
      attachmentId: input.attachmentId,
      reportId: input.reportId,
      ingestRunId: input.ingestRunId,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({ target: attachmentPageUsageEvents.ingestRunId });
}

export type AttachmentPageMonthSummary = {
  yearMonth: string;
  pageCount: number;
  inFlightPageCount: number;
  totalCommittedPageCount: number;
  eventCount: number;
};

export async function getAttachmentPageMonthSummary(
  yearMonth = currentYearMonthUtc(),
  options: { excludeAttachmentId?: string } = {}
): Promise<AttachmentPageMonthSummary> {
  const { db } = await import("@/db");

  const [usageRow] = await db
    .select({
      pageCount: sql<number>`coalesce(sum(${attachmentPageUsageEvents.pageCount}), 0)`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(attachmentPageUsageEvents)
    .where(eq(attachmentPageUsageEvents.yearMonth, yearMonth));

  const inFlightConditions = [
    isNull(reportAttachments.deletedAt),
    inArray(reportAttachments.processingStatus, ["queued", "processing"]),
    options.excludeAttachmentId
      ? ne(reportAttachments.id, options.excludeAttachmentId)
      : undefined,
  ].filter(Boolean);

  const [inFlightRow] = await db
    .select({
      pageCount: sql<number>`coalesce(sum(coalesce(${reportAttachments.pageCount}, 1)), 0)`,
    })
    .from(reportAttachments)
    .where(and(...inFlightConditions));

  const recordedPageCount = Number(usageRow?.pageCount ?? 0);
  const inFlightPageCount = Number(inFlightRow?.pageCount ?? 0);

  return {
    yearMonth,
    pageCount: recordedPageCount,
    inFlightPageCount,
    totalCommittedPageCount: recordedPageCount + inFlightPageCount,
    eventCount: Number(usageRow?.eventCount ?? 0),
  };
}

export async function getCurrentMonthCommittedPageCount(
  options: { excludeAttachmentId?: string } = {}
): Promise<number> {
  const summary = await getAttachmentPageMonthSummary(
    currentYearMonthUtc(),
    options
  );
  return summary.totalCommittedPageCount;
}
