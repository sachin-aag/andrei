import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { attachmentAssets, attachmentLibraryFolders } from "@/db/schema";
import { collectFolderSubtreeIds } from "@/lib/attachments/folder-subtree";
import {
  canManageAttachmentAsset,
  loadAccessibleAsset,
} from "@/lib/attachments/library-access";
import { loadLibraryFolder } from "@/lib/attachments/library-folders";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export type LibraryFolderArchiveRef = {
  id: string;
  parentId: string | null;
  archivedAt: Date | string | null;
};

export type LibraryAssetArchiveRef = {
  id: string;
  libraryFolderId: string | null;
  archived: boolean;
};

export type ArchiveItemsResult =
  | { ok: true; archivedAssets: number; archivedFolders: number }
  | { ok: false; error: string; status: 400 | 403 | 404 };

export type UnarchiveItemsResult =
  | { ok: true; restoredAssets: number; restoredFolders: number }
  | { ok: false; error: string; status: 400 | 403 | 404 };

export function planLibraryArchive(
  folders: LibraryFolderArchiveRef[],
  selectedFolderIds: string[],
  selectedAssetIds: string[]
): { folderIds: string[]; assetIds: string[] } {
  const folderIds = new Set<string>();
  for (const folderId of selectedFolderIds) {
    for (const id of collectFolderSubtreeIds(folderId, folders)) {
      const folder = folders.find((row) => row.id === id);
      if (folder && folder.archivedAt == null) {
        folderIds.add(id);
      }
    }
  }
  return {
    folderIds: [...folderIds],
    assetIds: [...new Set(selectedAssetIds)],
  };
}

function liveAncestorFolderId(
  startParentId: string | null,
  folders: LibraryFolderArchiveRef[],
  restoringFolderIds: ReadonlySet<string>
): string | null {
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const archivedIds = new Set(
    folders
      .filter((folder) => folder.archivedAt != null)
      .map((folder) => folder.id)
  );
  let cursor = startParentId;
  while (cursor) {
    if (!archivedIds.has(cursor) || restoringFolderIds.has(cursor)) {
      return cursor;
    }
    cursor = parentById.get(cursor) ?? null;
  }
  return null;
}

export function planLibraryUnarchive(
  folders: LibraryFolderArchiveRef[],
  assets: LibraryAssetArchiveRef[],
  selectedFolderIds: string[],
  selectedAssetIds: string[]
): {
  folderIds: string[];
  assetIds: string[];
  folderReparents: { id: string; parentId: string | null }[];
  assetRootIds: string[];
} {
  const archivedFolderIds = new Set(
    folders
      .filter((folder) => folder.archivedAt != null)
      .map((folder) => folder.id)
  );
  const folderIds = new Set<string>();
  for (const folderId of selectedFolderIds) {
    for (const id of collectFolderSubtreeIds(folderId, folders)) {
      if (archivedFolderIds.has(id)) folderIds.add(id);
    }
  }

  const assetIds = new Set<string>();
  for (const assetId of selectedAssetIds) {
    const asset = assets.find((row) => row.id === assetId);
    if (asset?.archived) assetIds.add(assetId);
  }
  for (const asset of assets) {
    if (
      asset.archived &&
      asset.libraryFolderId != null &&
      folderIds.has(asset.libraryFolderId)
    ) {
      assetIds.add(asset.id);
    }
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderReparents: { id: string; parentId: string | null }[] = [];
  for (const folderId of selectedFolderIds) {
    if (!folderIds.has(folderId)) continue;
    const parentId = folderById.get(folderId)?.parentId ?? null;
    if (parentId && archivedFolderIds.has(parentId) && !folderIds.has(parentId)) {
      folderReparents.push({
        id: folderId,
        parentId: liveAncestorFolderId(parentId, folders, folderIds),
      });
    }
  }

  const assetRootIds: string[] = [];
  for (const assetId of selectedAssetIds) {
    const asset = assets.find((row) => row.id === assetId);
    if (!asset?.archived || asset.libraryFolderId == null) continue;
    if (folderIds.has(asset.libraryFolderId)) continue;
    if (archivedFolderIds.has(asset.libraryFolderId)) {
      assetRootIds.push(asset.id);
    }
  }

  return {
    folderIds: [...folderIds],
    assetIds: [...assetIds],
    folderReparents,
    assetRootIds,
  };
}

async function loadOwnerFolders(
  ownerId: string
): Promise<LibraryFolderArchiveRef[]> {
  return db
    .select({
      id: attachmentLibraryFolders.id,
      parentId: attachmentLibraryFolders.parentId,
      archivedAt: attachmentLibraryFolders.archivedAt,
    })
    .from(attachmentLibraryFolders)
    .where(eq(attachmentLibraryFolders.ownerId, ownerId));
}

async function loadOwnerAssets(
  ownerId: string
): Promise<(typeof attachmentAssets.$inferSelect)[]> {
  return db
    .select()
    .from(attachmentAssets)
    .where(eq(attachmentAssets.ownerId, ownerId));
}

export async function archiveLibraryItems(
  user: Pick<WorkspaceUser, "id" | "role">,
  input: { assetIds: string[]; folderIds: string[] }
): Promise<ArchiveItemsResult> {
  const assetIds = [...new Set(input.assetIds)];
  const folderIds = [...new Set(input.folderIds)];
  if (assetIds.length === 0 && folderIds.length === 0) {
    return { ok: false, error: "No items selected", status: 400 };
  }

  const folders = await loadOwnerFolders(user.id);
  for (const folderId of folderIds) {
    if (!folders.some((folder) => folder.id === folderId)) {
      return { ok: false, error: "Folder not found", status: 404 };
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

  const plan = planLibraryArchive(folders, folderIds, assetIds);
  const archivedAt = new Date();

  await db.transaction(async (tx) => {
    if (plan.folderIds.length > 0) {
      await tx
        .update(attachmentLibraryFolders)
        .set({ archivedAt, updatedAt: archivedAt })
        .where(
          and(
            eq(attachmentLibraryFolders.ownerId, user.id),
            inArray(attachmentLibraryFolders.id, plan.folderIds),
            isNull(attachmentLibraryFolders.archivedAt)
          )
        );
      await tx
        .update(attachmentAssets)
        .set({ deletedAt: archivedAt })
        .where(
          and(
            eq(attachmentAssets.ownerId, user.id),
            inArray(attachmentAssets.libraryFolderId, plan.folderIds),
            isNull(attachmentAssets.deletedAt)
          )
        );
    }
    if (plan.assetIds.length > 0) {
      await tx
        .update(attachmentAssets)
        .set({ deletedAt: archivedAt })
        .where(
          and(
            eq(attachmentAssets.ownerId, user.id),
            inArray(attachmentAssets.id, plan.assetIds),
            isNull(attachmentAssets.deletedAt)
          )
        );
    }
  });

  return {
    ok: true,
    archivedFolders: plan.folderIds.length,
    archivedAssets: plan.assetIds.length,
  };
}

export async function unarchiveLibraryItems(
  user: Pick<WorkspaceUser, "id" | "role">,
  input: { assetIds: string[]; folderIds: string[] }
): Promise<UnarchiveItemsResult> {
  const assetIds = [...new Set(input.assetIds)];
  const folderIds = [...new Set(input.folderIds)];
  if (assetIds.length === 0 && folderIds.length === 0) {
    return { ok: false, error: "No items selected", status: 400 };
  }

  const folders = await loadOwnerFolders(user.id);
  for (const folderId of folderIds) {
    const folder = await loadLibraryFolder(user.id, folderId, {
      includeArchived: true,
    });
    if (!folder) {
      return { ok: false, error: "Folder not found", status: 404 };
    }
  }

  const ownedAssets = await loadOwnerAssets(user.id);
  for (const assetId of assetIds) {
    const asset = ownedAssets.find((row) => row.id === assetId);
    if (!asset) {
      return { ok: false, error: `File ${assetId} not found`, status: 404 };
    }
    if (!canManageAttachmentAsset(user, asset)) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
  }

  const plan = planLibraryUnarchive(
    folders,
    ownedAssets.map((asset) => ({
      id: asset.id,
      libraryFolderId: asset.libraryFolderId,
      archived: asset.deletedAt != null,
    })),
    folderIds,
    assetIds
  );

  await db.transaction(async (tx) => {
    if (plan.folderIds.length > 0) {
      await tx
        .update(attachmentLibraryFolders)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(attachmentLibraryFolders.ownerId, user.id),
            inArray(attachmentLibraryFolders.id, plan.folderIds),
            isNotNull(attachmentLibraryFolders.archivedAt)
          )
        );
    }
    for (const reparent of plan.folderReparents) {
      await tx
        .update(attachmentLibraryFolders)
        .set({ parentId: reparent.parentId, updatedAt: new Date() })
        .where(
          and(
            eq(attachmentLibraryFolders.ownerId, user.id),
            eq(attachmentLibraryFolders.id, reparent.id)
          )
        );
    }
    if (plan.assetIds.length > 0) {
      await tx
        .update(attachmentAssets)
        .set({ deletedAt: null })
        .where(
          and(
            eq(attachmentAssets.ownerId, user.id),
            inArray(attachmentAssets.id, plan.assetIds),
            isNotNull(attachmentAssets.deletedAt)
          )
        );
    }
    if (plan.assetRootIds.length > 0) {
      await tx
        .update(attachmentAssets)
        .set({ libraryFolderId: null })
        .where(
          and(
            eq(attachmentAssets.ownerId, user.id),
            inArray(attachmentAssets.id, plan.assetRootIds)
          )
        );
    }
  });

  return {
    ok: true,
    restoredFolders: plan.folderIds.length,
    restoredAssets: plan.assetIds.length,
  };
}
