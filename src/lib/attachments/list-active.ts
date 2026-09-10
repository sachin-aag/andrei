import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { attachmentAssets, reportAttachments } from "@/db/schema";
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

  const assetIds = [
    ...new Set(
      rows
        .map((row) => row.assetId)
        .filter((id): id is string => id != null)
    ),
  ];
  const assets =
    assetIds.length === 0
      ? []
      : await db
          .select()
          .from(attachmentAssets)
          .where(inArray(attachmentAssets.id, assetIds));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  return rows.map((row) =>
    toAttachmentDto(row, row.assetId ? assetById.get(row.assetId) : null)
  );
}
