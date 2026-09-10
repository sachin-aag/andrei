import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { attachmentAssets, attachmentLibraryFolders } from "@/db/schema";
import { toLibraryAssetDto } from "@/lib/attachments/library-dto";
import {
  canManageAttachmentAsset,
  loadAccessibleAsset,
} from "@/lib/attachments/library-access";
import {
  loadLibraryFolder,
  validateLibraryFolderPlacement,
} from "@/lib/attachments/library-folders";
import { archiveLibraryItems } from "@/lib/attachments/library-archive";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export type ManageAssetResult =
  | { ok: true; asset: ReturnType<typeof toLibraryAssetDto> }
  | { ok: false; error: string; status: 400 | 403 | 404 };

export type BulkMoveResult =
  | { ok: true; movedAssets: number; movedFolders: number }
  | { ok: false; error: string; status: 400 | 403 | 404 };

export async function moveLibraryAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  assetId: string,
  libraryFolderId: string | null
): Promise<ManageAssetResult> {
  const asset = await loadAccessibleAsset(user, assetId);
  if (!asset) {
    return { ok: false, error: "Not found", status: 404 };
  }
  if (!canManageAttachmentAsset(user, asset)) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  if (libraryFolderId != null) {
    const folder = await loadLibraryFolder(user.id, libraryFolderId);
    if (!folder) {
      return { ok: false, error: "Folder not found", status: 404 };
    }
  }

  const [updated] = await db
    .update(attachmentAssets)
    .set({ libraryFolderId })
    .where(
      and(
        eq(attachmentAssets.id, assetId),
        isNull(attachmentAssets.deletedAt)
      )
    )
    .returning();

  if (!updated) {
    return { ok: false, error: "Not found", status: 404 };
  }

  return { ok: true, asset: toLibraryAssetDto(updated, "mine") };
}

/** Archive removes the file from the live vault UI; report links stay. */
export async function softDeleteLibraryAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  assetId: string
): Promise<{ ok: true } | { ok: false; error: string; status: 400 | 403 | 404 }> {
  const result = await archiveLibraryItems(user, {
    assetIds: [assetId],
    folderIds: [],
  });
  if (!result.ok) return result;
  return { ok: true };
}

function isDescendantFolder(
  candidateId: string,
  ancestorId: string,
  parentById: Map<string, string | null>
): boolean {
  let cursor: string | null = candidateId;
  while (cursor !== null) {
    if (cursor === ancestorId) return true;
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

export async function moveLibraryItems(
  user: Pick<WorkspaceUser, "id" | "role">,
  input: {
    assetIds: string[];
    folderIds: string[];
    targetFolderId: string | null;
  }
): Promise<BulkMoveResult> {
  const assetIds = [...new Set(input.assetIds)];
  const folderIds = [...new Set(input.folderIds)];
  if (assetIds.length === 0 && folderIds.length === 0) {
    return { ok: false, error: "No items selected", status: 400 };
  }

  if (input.targetFolderId != null) {
    const target = await loadLibraryFolder(user.id, input.targetFolderId);
    if (!target) {
      return { ok: false, error: "Folder not found", status: 404 };
    }
    if (folderIds.includes(input.targetFolderId)) {
      return {
        ok: false,
        error: "Cannot move items into a folder that is also being moved",
        status: 400,
      };
    }
  }

  const folderRows = await db
    .select({
      id: attachmentLibraryFolders.id,
      parentId: attachmentLibraryFolders.parentId,
    })
    .from(attachmentLibraryFolders)
    .where(eq(attachmentLibraryFolders.ownerId, user.id));
  const parentById = new Map(folderRows.map((row) => [row.id, row.parentId]));

  for (const folderId of folderIds) {
    if (input.targetFolderId && isDescendantFolder(input.targetFolderId, folderId, parentById)) {
      return {
        ok: false,
        error: "Cannot move a folder into its own subtree",
        status: 400,
      };
    }
    const placementError = await validateLibraryFolderPlacement({
      ownerId: user.id,
      parentId: input.targetFolderId,
      folderId,
    });
    if (placementError) {
      const status: 400 | 404 =
        placementError.status === 404 ? 404 : 400;
      return {
        ok: false,
        error: placementError.error,
        status,
      };
    }
  }

  for (const assetId of assetIds) {
    const asset = await loadAccessibleAsset(user, assetId);
    if (!asset) {
      return { ok: false, error: `File ${assetId} not found`, status: 404 };
    }
    if (!canManageAttachmentAsset(user, asset)) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
  }

  await db.transaction(async (tx) => {
    if (folderIds.length > 0) {
      await tx
        .update(attachmentLibraryFolders)
        .set({ parentId: input.targetFolderId, updatedAt: new Date() })
        .where(
          and(
            eq(attachmentLibraryFolders.ownerId, user.id),
            inArray(attachmentLibraryFolders.id, folderIds)
          )
        );
    }
    if (assetIds.length > 0) {
      await tx
        .update(attachmentAssets)
        .set({ libraryFolderId: input.targetFolderId })
        .where(
          and(
            eq(attachmentAssets.ownerId, user.id),
            inArray(attachmentAssets.id, assetIds),
            isNull(attachmentAssets.deletedAt)
          )
        );
    }
  });

  return {
    ok: true,
    movedAssets: assetIds.length,
    movedFolders: folderIds.length,
  };
}
