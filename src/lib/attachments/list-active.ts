import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import type { ReportAttachmentRecord } from "@/types/report";
import { toAttachmentDto } from "@/lib/attachments/dto";

export async function listActiveAttachments(
  reportId: string
): Promise<ReportAttachmentRecord[]> {
  const rows = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    )
    .orderBy(asc(reportAttachments.uploadedAt));
  return rows.map(toAttachmentDto);
}
