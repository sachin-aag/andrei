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
import { loadAccessibleAsset } from "@/lib/attachments/library-access";
import { classifyAssetsForLibraryLink } from "@/lib/attachments/library-link-classify";
import { reportProcessingForLinkedAsset } from "@/lib/attachments/library-link-ingest";
import { startIngestForLinkedVaultAsset } from "@/lib/attachments/start-vault-ingest";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import { isPostgresUniqueViolation } from "@/lib/reports/document-no";
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
  excludedAssetIds?: string[];
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
  const liveFolders = allFolders.filter((folder) => folder.archivedAt == null);
  const byParent = new Map<string | null, typeof liveFolders>();
  for (const folder of liveFolders) {
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

  return liveFolders.filter((folder) => selected.has(folder.id));
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
  const excludedAssetIds = new Set(input.excludedAssetIds ?? []);
  if (assetIds.length === 0 && libraryFolderIds.length === 0) {
    return { ok: false, error: "No vault items selected", status: 400 };
  }

  const folderTree = await loadLibraryFolderTree(libraryFolderIds);
  const folderAssets = (
    await loadAssetsForLibraryFolders(folderTree.map((folder) => folder.id))
  ).filter((asset) => !excludedAssetIds.has(asset.id));
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

    const uniqueAssetIds = uniqueAssets.map((asset) => asset.id);
    const existingForAssets =
      uniqueAssetIds.length === 0
        ? []
        : await tx
            .select({
              id: reportAttachments.id,
              assetId: reportAttachments.assetId,
              deletedAt: reportAttachments.deletedAt,
            })
            .from(reportAttachments)
            .where(
              and(
                eq(reportAttachments.reportId, input.reportId),
                inArray(reportAttachments.assetId, uniqueAssetIds)
              )
            );
    const classified = classifyAssetsForLibraryLink(
      uniqueAssets,
      existingForAssets
    );

    const ingestAssetIds = new Set<string>();
    for (const asset of classified.skip) {
      if (reportProcessingForLinkedAsset(asset).shouldStartIngest) {
        ingestAssetIds.add(asset.id);
      }
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

    const reportFolderIdForAsset = (
      asset: (typeof uniqueAssets)[number]
    ) =>
      asset.libraryFolderId
        ? (reportFolderIdByLibraryFolderId.get(asset.libraryFolderId) ??
          input.targetFolderId)
        : input.targetFolderId;

    const restoreLink = async (
      attachmentId: string,
      asset: (typeof uniqueAssets)[number]
    ) => {
      const reportFolderId = reportFolderIdForAsset(asset);
      const { processingStatus, shouldStartIngest } =
        reportProcessingForLinkedAsset(asset);
      const [row] = await tx
        .update(reportAttachments)
        .set({
          deletedAt: null,
          deletedById: null,
          folderId: reportFolderId,
          filename: asset.filename,
          description: asset.description,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          sha256: asset.sha256,
          pageCount: asset.pageCount,
          processingStatus,
          processingProgress: shouldStartIngest ? 0 : asset.processingProgress,
          processingPage: shouldStartIngest ? null : asset.processingPage,
          processingError: shouldStartIngest ? null : asset.processingError,
          activeIngestRunId: shouldStartIngest ? null : asset.activeIngestRunId,
          gcsGeneration: asset.gcsGeneration,
        })
        .where(eq(reportAttachments.id, attachmentId))
        .returning();
      if (!row) {
        throw new Error("Failed to restore vault link");
      }
      return { row, shouldStartIngest };
    };

    for (const { asset, attachmentId } of classified.restore) {
      const { row, shouldStartIngest } = await restoreLink(
        attachmentId,
        asset
      );
      createdAttachments.push(
        toLinkedAttachmentDto(row, asset, shouldStartIngest)
      );
      if (shouldStartIngest) ingestAssetIds.add(asset.id);
    }

    for (const asset of classified.insert) {
      const attachmentId = createId();
      const reportFolderId = reportFolderIdForAsset(asset);
      const { processingStatus, shouldStartIngest } =
        reportProcessingForLinkedAsset(asset);

      let row: typeof reportAttachments.$inferSelect;
      try {
        const inserted = await tx
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
            processingPage: shouldStartIngest ? null : asset.processingPage,
            processingError: shouldStartIngest ? null : asset.processingError,
            activeIngestRunId: shouldStartIngest ? null : asset.activeIngestRunId,
            gcsGeneration: asset.gcsGeneration,
            uploadedById: input.user.id,
          })
          .returning();
        const insertedRow = inserted[0];
        if (!insertedRow) {
          throw new Error("Failed to link vault file");
        }
        row = insertedRow;
      } catch (error) {
        if (!isPostgresUniqueViolation(error)) throw error;
        const [existing] = await tx
          .select()
          .from(reportAttachments)
          .where(
            and(
              eq(reportAttachments.reportId, input.reportId),
              eq(reportAttachments.assetId, asset.id)
            )
          );
        if (!existing) throw error;
        if (existing.deletedAt == null) {
          if (reportProcessingForLinkedAsset(asset).shouldStartIngest) {
            ingestAssetIds.add(asset.id);
          }
          continue;
        }
        const restored = await restoreLink(existing.id, asset);
        createdAttachments.push(
          toLinkedAttachmentDto(restored.row, asset, restored.shouldStartIngest)
        );
        if (restored.shouldStartIngest) ingestAssetIds.add(asset.id);
        continue;
      }

      createdAttachments.push(
        toLinkedAttachmentDto(row, asset, shouldStartIngest)
      );
      if (shouldStartIngest) ingestAssetIds.add(asset.id);
    }

    return {
      ok: true as const,
      attachments: createdAttachments,
      folders: createdFolders,
      ingestAssetIds: [...ingestAssetIds],
    };
  }).then(async (result) => {
    if (!result.ok) return result;
    for (const assetId of result.ingestAssetIds) {
      try {
        await startIngestForLinkedVaultAsset(assetId);
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

function toLinkedAttachmentDto(
  row: typeof reportAttachments.$inferSelect,
  asset: typeof attachmentAssets.$inferSelect,
  shouldStartIngest: boolean
) {
  return toAttachmentDto(
    row,
    shouldStartIngest
      ? {
          ...asset,
          processingStatus: "queued",
          processingProgress: 0,
          processingPage: null,
          processingError: null,
        }
      : asset
  );
}
