import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import { voiceUsageEvents } from "@/db/schema";
import { currentYearMonthUtc } from "@/lib/ai/usage/cycle";
import { isVoiceBudgetTrackingSkipped } from "./enforcement";

export type RecordVoiceUsageInput = {
  audioSeconds: number;
  reportId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordVoiceUsage(input: RecordVoiceUsageInput): Promise<void> {
  if (isVoiceBudgetTrackingSkipped()) return;
  if (input.audioSeconds <= 0) return;

  const { db } = await import("@/db");
  await db.insert(voiceUsageEvents).values({
    id: createId(),
    yearMonth: currentYearMonthUtc(),
    audioSeconds: input.audioSeconds,
    reportId: input.reportId ?? null,
    userId: input.userId ?? null,
    metadata: input.metadata ?? {},
  });
}

export type VoiceMonthSummary = {
  yearMonth: string;
  audioSeconds: number;
  eventCount: number;
};

export async function getVoiceMonthSummary(
  yearMonth = currentYearMonthUtc()
): Promise<VoiceMonthSummary> {
  const { db } = await import("@/db");
  const [usageRow] = await db
    .select({
      audioSeconds: sql<number>`coalesce(sum(${voiceUsageEvents.audioSeconds}), 0)`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(voiceUsageEvents)
    .where(eq(voiceUsageEvents.yearMonth, yearMonth));

  return {
    yearMonth,
    audioSeconds: Number(usageRow?.audioSeconds ?? 0),
    eventCount: Number(usageRow?.eventCount ?? 0),
  };
}

export async function getCurrentMonthAudioSeconds(): Promise<number> {
  const summary = await getVoiceMonthSummary();
  return summary.audioSeconds;
}
