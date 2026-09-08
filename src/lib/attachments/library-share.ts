import { and, eq, inArray, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import {
  attachmentAccessGrants,
  attachmentAssets,
  attachmentLibraryFolders,
  workspaceUsers,
} from "@/db/schema";
import {
  canManageAttachmentAsset,
  loadAccessibleAsset,
} from "@/lib/attachments/library-access";
import { planLibraryShare } from "@/lib/attachments/library-share-plan";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export type ShareLibraryItemsResult =
  | { ok: true; sharedAssets: number; granteeCount: number }
  | { ok: false; error: string; status: 400 | 403 | 404 };

export async function shareLibraryItems(
  user: Pick<WorkspaceUser, "id" | "role">,
  input: {
    assetIds: string[];
    folderIds: string[];
    excludedAssetIds?: string[];
    granteeUserIds: string[];
  }
): Promise<ShareLibraryItemsResult> {
  const requestedAssetIds = [...new Set(input.assetIds)];
  const folderIds = [...new Set(input.folderIds)];
  const requestedGrantees = [
    ...new Set(input.granteeUserIds.filter((id) => id !== user.id)),
  ];

  if (requestedAssetIds.length === 0 && folderIds.length === 0) {
    return { ok: false, error: "No items selected", status: 400 };
  }
  if (requestedGrantees.length === 0) {
    return { ok: false, error: "Choose at least one person to share with", status: 400 };
  }

  const [folders, ownedAssets, granteeRows] = await Promise.all([
    db
      .select({
        id: attachmentLibraryFolders.id,
        parentId: attachmentLibraryFolders.parentId,
      })
      .from(attachmentLibraryFolders)
      .where(eq(attachmentLibraryFolders.ownerId, user.id)),
    db
      .select({
        id: attachmentAssets.id,
        libraryFolderId: attachmentAssets.libraryFolderId,
        ownerId: attachmentAssets.ownerId,
      })
      .from(attachmentAssets)
      .where(
        and(
          eq(attachmentAssets.ownerId, user.id),
          isNull(attachmentAssets.deletedAt)
        )
      ),
    db
      .select({ id: workspaceUsers.id })
      .from(workspaceUsers)
      .where(inArray(workspaceUsers.id, requestedGrantees)),
  ]);

  if (granteeRows.length !== requestedGrantees.length) {
    return { ok: false, error: "A selected person was not found", status: 400 };
  }

  for (const folderId of folderIds) {
    if (!folders.some((folder) => folder.id === folderId)) {
      return { ok: false, error: "Folder not found", status: 404 };
    }
  }

  for (const assetId of requestedAssetIds) {
    const asset = await loadAccessibleAsset(user, assetId);
    if (!asset) {
      return { ok: false, error: `File ${assetId} not found`, status: 404 };
    }
    if (!canManageAttachmentAsset(user, asset)) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
  }

  const assetIds = planLibraryShare(
    folders,
    ownedAssets,
    folderIds,
    requestedAssetIds,
    input.excludedAssetIds ?? []
  );
  if (assetIds.length === 0) {
    return { ok: false, error: "No files to share in that selection", status: 400 };
  }

  const existing = await db
    .select({
      assetId: attachmentAccessGrants.assetId,
      granteeUserId: attachmentAccessGrants.granteeUserId,
    })
    .from(attachmentAccessGrants)
    .where(inArray(attachmentAccessGrants.assetId, assetIds));
  const existingKeys = new Set(
    existing.map((row) => `${row.assetId}:${row.granteeUserId}`)
  );

  const inserts: {
    id: string;
    assetId: string;
    granteeUserId: string;
    grantedById: string;
  }[] = [];
  for (const assetId of assetIds) {
    for (const granteeUserId of requestedGrantees) {
      if (existingKeys.has(`${assetId}:${granteeUserId}`)) continue;
      inserts.push({
        id: createId(),
        assetId,
        granteeUserId,
        grantedById: user.id,
      });
    }
  }

  if (inserts.length > 0) {
    await db.insert(attachmentAccessGrants).values(inserts);
  }

  return {
    ok: true,
    sharedAssets: assetIds.length,
    granteeCount: requestedGrantees.length,
  };
}
