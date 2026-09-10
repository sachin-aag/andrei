import { folderAncestorIds } from "@/lib/attachments/folder-subtree";
import type {
  AttachmentLibraryAssetRecord,
  AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";

export const SHARED_WITH_ME_FOLDER_ID = "__shared_with_me__";
export const SHARED_WITH_ME_FOLDER_NAME = "Shared with me";

export function isSharedWithMeFolderId(
  folderId: string | null | undefined
): boolean {
  return folderId === SHARED_WITH_ME_FOLDER_ID;
}

/** Live folders on the path to each shared file (no unshared siblings). */
export function liveAncestorFolders<T extends { id: string; parentId: string | null }>(
  assets: { libraryFolderId: string | null }[],
  folders: T[]
): T[] {
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const keep = new Set<string>();
  for (const asset of assets) {
    for (const id of folderAncestorIds(asset.libraryFolderId, parentById)) {
      keep.add(id);
    }
  }
  return folders.filter((folder) => keep.has(folder.id));
}

export function userOwnsVaultItem(
  currentUserId: string,
  ownerId: string
): boolean {
  return ownerId === currentUserId;
}

/**
 * Puts files and folders the current user does not own under a synthetic
 * "Shared with me" root so they appear in the vault explorer.
 */
export function attachSharedWithMeRoot(
  currentUserId: string,
  folders: AttachmentLibraryFolderRecord[],
  assets: AttachmentLibraryAssetRecord[]
): {
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
} {
  const sharedFolderIds = new Set(
    folders
      .filter((folder) => folder.ownerId !== currentUserId)
      .map((folder) => folder.id)
  );
  const hasShared =
    sharedFolderIds.size > 0 ||
    assets.some((asset) => asset.ownerId !== currentUserId);
  if (!hasShared) {
    return { folders, assets };
  }

  const sharedRoot: AttachmentLibraryFolderRecord = {
    id: SHARED_WITH_ME_FOLDER_ID,
    ownerId: "",
    parentId: null,
    name: SHARED_WITH_ME_FOLDER_NAME,
    createdAt: "",
    archivedAt: null,
  };

  const remappedFolders = folders.map((folder) => {
    if (folder.ownerId === currentUserId) return folder;
    const parentShared =
      folder.parentId != null && sharedFolderIds.has(folder.parentId);
    return parentShared
      ? folder
      : { ...folder, parentId: SHARED_WITH_ME_FOLDER_ID };
  });

  const remappedAssets = assets.map((asset) => {
    if (asset.ownerId === currentUserId) return asset;
    const folderShared =
      asset.libraryFolderId != null && sharedFolderIds.has(asset.libraryFolderId);
    return folderShared
      ? asset
      : { ...asset, libraryFolderId: SHARED_WITH_ME_FOLDER_ID };
  });

  return { folders: [sharedRoot, ...remappedFolders], assets: remappedAssets };
}
