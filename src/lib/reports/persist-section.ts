import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSections, type SectionType } from "@/db/schema";
import { recordSectionVersion } from "@/lib/audit";
import type { AuditActorSnapshot } from "@/lib/audit";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;
type ReportSectionRow = typeof reportSections.$inferSelect;

export async function persistSectionContent(args: {
  actor: AuditActorSnapshot;
  reportId: string;
  section: SectionType;
  content: Record<string, unknown>;
  executor?: DbExecutor;
}): Promise<ReportSectionRow> {
  const executor = args.executor ?? db;
  const [existing] = await executor
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, args.reportId),
        eq(reportSections.section, args.section)
      )
    );

  if (!existing) {
    const [inserted] = await executor
      .insert(reportSections)
      .values({
        reportId: args.reportId,
        section: args.section,
        content: args.content,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert report section.");
    }

    await recordSectionVersion({
      actor: args.actor,
      reportId: args.reportId,
      sectionId: inserted.id,
      section: args.section,
      previousContent: {},
      newContent: args.content,
      executor: args.executor,
    });

    return inserted;
  }

  await recordSectionVersion({
    actor: args.actor,
    reportId: args.reportId,
    sectionId: existing.id,
    section: args.section,
    previousContent: existing.content,
    newContent: args.content,
    executor: args.executor,
  });

  const [updated] = await executor
    .update(reportSections)
    .set({ content: args.content, updatedAt: new Date() })
    .where(eq(reportSections.id, existing.id))
    .returning();

  if (!updated) {
    throw new Error("Failed to update report section.");
  }

  return updated;
}
