import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import {
  attachmentAssets,
  attachmentLibraryFolders,
  reportAttachmentFolders,
  reportAttachments,
  reports,
} from "@/db/schema";
import { toAttachmentDto } from "@/lib/attachments/dto";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import { loadAccessibleAsset } from "@/lib/attachments/library-access";
import { reportProcessingForLinkedAsset } from "@/lib/attachments/library-link-ingest";
import { startDocumentIngest } from "@/lib/attachments/start-ingest";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import {
  permanentObjectKey,
  stagingObjectKey,
} from "@/lib/storage/attachments";

export type LinkLibraryInput = {
  reportId: string;
  user: Pick<WorkspaceUser, "id" | "role">;
  targetFolderId: string | null;
  assetIds?: string[];
  libraryFolderIds?: string[];
};

export type LinkLibraryResult =
  | {
      ok: true;
      attachments: ReturnType<typeof toAttachmentDto>[];
      folders: { id: string; name: string; parentId: string | null }[];
    }
  | { ok: false; error: string; status: 400 | 403 | 404 };

async function loadLibraryFolderTree(rootFolderIds: string[]) {
  const allFolders = await db.select().from(attachmentLibraryFolders);
  const byParent = new Map<string | null, typeof allFolders>();
  for (const folder of allFolders) {
    const key = folder.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(folder);
    byParent.set(key, list);
  }

  const selected = new Set<string>();
  const queue = [...rootFolderIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (selected.has(id)) continue;
    selected.add(id);
    const children = byParent.get(id) ?? [];
    for (const child of children) {
      queue.push(child.id);
    }
  }

  return allFolders.filter((folder) => selected.has(folder.id));
}

async function loadAssetsForLibraryFolders(folderIds: string[]) {
  if (folderIds.length === 0) return [];
  return db
    .select()
    .from(attachmentAssets)
    .where(
      and(
        inArray(attachmentAssets.libraryFolderId, folderIds),
        isNull(attachmentAssets.deletedAt)
      )
    );
}

export async function linkLibraryItemsToReport(
  input: LinkLibraryInput
): Promise<LinkLibraryResult> {
  const assetIds = [...new Set(input.assetIds ?? [])];
  const libraryFolderIds = [...new Set(input.libraryFolderIds ?? [])];
  if (assetIds.length === 0 && libraryFolderIds.length === 0) {
    return { ok: false, error: "No vault items selected", status: 400 };
  }

  const limits = getAttachmentLimits();

  const folderTree = await loadLibraryFolderTree(libraryFolderIds);
  const folderAssets = await loadAssetsForLibraryFolders(
    folderTree.map((folder) => folder.id)
  );
  const directAssetIds = assetIds.filter(
    (id) => !folderAssets.some((asset) => asset.id === id)
  );

  const assetsToLink: (typeof attachmentAssets.$inferSelect)[] = [];
  for (const id of directAssetIds) {
    const asset = await loadAccessibleAsset(input.user, id);
    if (!asset) {
      return { ok: false, error: `Asset ${id} not found`, status: 404 };
    }
    assetsToLink.push(asset);
  }
  for (const asset of folderAssets) {
    const accessible = await loadAccessibleAsset(input.user, asset.id);
    if (!accessible) {
      return { ok: false, error: `Asset ${asset.id} not found`, status: 404 };
    }
    assetsToLink.push(accessible);
  }

  const uniqueAssets = [
    ...new Map(assetsToLink.map((asset) => [asset.id, asset])).values(),
  ];

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${reports.id} from ${reports} where ${reports.id} = ${input.reportId} for update`
    );

    const existingLinks = await tx
      .select({ assetId: reportAttachments.assetId })
      .from(reportAttachments)
      .where(
        and(
          eq(reportAttachments.reportId, input.reportId),
          isNull(reportAttachments.deletedAt)
        )
      );
    const linkedAssetIds = new Set(
      existingLinks
        .map((row) => row.assetId)
        .filter((id): id is string => id != null)
    );

    const newAssets = uniqueAssets.filter((asset) => !linkedAssetIds.has(asset.id));
    const activeCount = existingLinks.length;
    if (activeCount + newAssets.length > limits.maxAttachmentsPerReport) {
      return {
        ok: false as const,
        error: `Report already has ${limits.maxAttachmentsPerReport} attachments`,
        status: 400 as const,
      };
    }

    const reportFolderIdByLibraryFolderId = new Map<string, string>();
    const createdFolders: { id: string; name: string; parentId: string | null }[] =
      [];

    const sortedFolders = [...folderTree].sort((a, b) => {
      const depth = (folder: typeof a) => {
        let count = 0;
        let current: string | null = folder.parentId;
        while (current) {
          count += 1;
          current =
            folderTree.find((item) => item.id === current)?.parentId ?? null;
        }
        return count;
      };
      return depth(a) - depth(b);
    });

    for (const folder of sortedFolders) {
      const parentReportFolderId = folder.parentId
        ? (reportFolderIdByLibraryFolderId.get(folder.parentId) ??
          input.targetFolderId)
        : input.targetFolderId;
      const reportFolderId = createId();
      await tx.insert(reportAttachmentFolders).values({
        id: reportFolderId,
        reportId: input.reportId,
        parentId: parentReportFolderId,
        name: folder.name,
        createdById: input.user.id,
      });
      reportFolderIdByLibraryFolderId.set(folder.id, reportFolderId);
      createdFolders.push({
        id: reportFolderId,
        name: folder.name,
        parentId: parentReportFolderId,
      });
    }

    const createdAttachments: ReturnType<typeof toAttachmentDto>[] = [];
    const ingestStarts: { attachmentId: string; generation: string }[] = [];
    for (const asset of newAssets) {
      const attachmentId = createId();
      const reportFolderId = asset.libraryFolderId
        ? (reportFolderIdByLibraryFolderId.get(asset.libraryFolderId) ??
          input.targetFolderId)
        : input.targetFolderId;
      const { processingStatus, shouldStartIngest } =
        reportProcessingForLinkedAsset(asset);

      const [row] = await tx
        .insert(reportAttachments)
        .values({
          id: attachmentId,
          reportId: input.reportId,
          assetId: asset.id,
          folderId: reportFolderId,
          filename: asset.filename,
          description: asset.description,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          sha256: asset.sha256,
          stagingObjectKey: stagingObjectKey(attachmentId),
          permanentObjectKey: permanentObjectKey(input.reportId, attachmentId),
          pageCount: asset.pageCount,
          processingStatus,
          processingProgress: shouldStartIngest ? 0 : asset.processingProgress,
          processingPage: asset.processingPage,
          processingError: asset.processingError,
          activeIngestRunId: asset.activeIngestRunId,
          uploadedById: input.user.id,
        })
        .returning();

      createdAttachments.push(toAttachmentDto(row, asset));
      if (shouldStartIngest && asset.gcsGeneration) {
        ingestStarts.push({
          attachmentId,
          generation: asset.gcsGeneration,
        });
      }
    }

    return {
      ok: true as const,
      attachments: createdAttachments,
      folders: createdFolders,
      ingestStarts,
    };
  }).then(async (result) => {
    if (!result.ok) return result;
    for (const start of result.ingestStarts) {
      try {
        await startDocumentIngest(start.attachmentId, start.generation);
      } catch {
        // Page-budget / ingest failures are recorded on the attachment row.
      }
    }
    return {
      ok: true as const,
      attachments: result.attachments,
      folders: result.folders,
    };
  });
}
