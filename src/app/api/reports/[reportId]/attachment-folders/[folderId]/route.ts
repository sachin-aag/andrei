import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportAttachmentFolders, reportAttachments } from "@/db/schema";
import { toAttachmentFolderDto } from "@/lib/attachments/dto";
import {
  loadFolder,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderName,
  validateFolderPlacement,
} from "@/lib/attachments/folders";
import { collectFolderSubtreeIds } from "@/lib/attachments/folder-subtree";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(MAX_FOLDER_NAME_LENGTH).optional(),
  parentId: z.string().min(1).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ reportId: string; folderId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId, folderId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.canMutateAttachments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folder = await loadFolder(reportId, folderId);
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates: { name?: string; parentId?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) {
    const name = normalizeFolderName(parsed.data.name);
    if (!name) {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }
    updates.name = name;
  }

  if (parsed.data.parentId !== undefined) {
    const placementError = await validateFolderPlacement({
      reportId,
      parentId: parsed.data.parentId,
      folderId,
    });
    if (placementError) {
      return NextResponse.json(
        { error: placementError.error },
        { status: placementError.status }
      );
    }
    updates.parentId = parsed.data.parentId;
  }

  const [updated] = await db
    .update(reportAttachmentFolders)
    .set(updates)
    .where(
      and(
        eq(reportAttachmentFolders.id, folderId),
        eq(reportAttachmentFolders.reportId, reportId)
      )
    )
    .returning();

  return NextResponse.json({ folder: toAttachmentFolderDto(updated) });
}

/** Deletes the folder and every nested subfolder and attachment inside it. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; folderId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId, folderId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.canMutateAttachments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folder = await loadFolder(reportId, folderId);
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allFolders = await db
    .select({
      id: reportAttachmentFolders.id,
      parentId: reportAttachmentFolders.parentId,
    })
    .from(reportAttachmentFolders)
    .where(eq(reportAttachmentFolders.reportId, reportId));

  const subtreeFolderIds = [
    ...collectFolderSubtreeIds(folderId, allFolders),
  ];

  const deletedAttachments = await db.transaction(async (tx) => {
    const attachments = await tx
      .select()
      .from(reportAttachments)
      .where(
        and(
          eq(reportAttachments.reportId, reportId),
          inArray(reportAttachments.folderId, subtreeFolderIds),
          isNull(reportAttachments.deletedAt)
        )
      );

    if (attachments.length > 0) {
      await tx
        .update(reportAttachments)
        .set({
          deletedAt: new Date(),
          deletedById: access.user.id,
        })
        .where(
          and(
            eq(reportAttachments.reportId, reportId),
            inArray(reportAttachments.id, attachments.map((row) => row.id)),
            isNull(reportAttachments.deletedAt)
          )
        );
    }

    await tx
      .delete(reportAttachmentFolders)
      .where(
        and(
          eq(reportAttachmentFolders.reportId, reportId),
          inArray(reportAttachmentFolders.id, subtreeFolderIds)
        )
      );

    return attachments;
  });

  for (const attachment of deletedAttachments) {
    await recordAuditEvent({
      actor: auditActorFromUser(access.user),
      action: "attachment_deleted",
      entityType: "attachment",
      entityId: attachment.id,
      reportId,
      summary: `Attachment deleted: ${attachment.filename}`,
      oldValue: {
        filename: attachment.filename,
        sizeBytes: attachment.sizeBytes,
        pageCount: attachment.pageCount,
        processingStatus: attachment.processingStatus,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
