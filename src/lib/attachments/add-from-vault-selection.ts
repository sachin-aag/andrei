import type { AttachmentLibraryAssetRecord } from "@/lib/attachments/library-dto";
import {
  buildFoldersByParent,
  collectFolderSubtreeIds,
  folderAncestorIds,
  isUnderFolder,
  type FolderNode,
} from "@/lib/attachments/folder-subtree";

export type VaultTree = {
  foldersByParent: Map<string | null, FolderNode[]>;
  parentById: Map<string, string | null>;
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>;
};

export function buildVaultTree(
  folders: FolderNode[],
  assets: AttachmentLibraryAssetRecord[]
): VaultTree {
  const foldersByParent = buildFoldersByParent(folders);
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const assetsByFolder = new Map<string | null, AttachmentLibraryAssetRecord[]>();
  for (const asset of assets) {
    const key = asset.libraryFolderId ?? null;
    const list = assetsByFolder.get(key) ?? [];
    list.push(asset);
    assetsByFolder.set(key, list);
  }
  return { foldersByParent, parentById, assetsByFolder };
}

export function toggleVaultFolderSelection(
  folderId: string,
  checked: boolean,
  folders: FolderNode[],
  assets: AttachmentLibraryAssetRecord[],
  selectedFolderIds: Set<string>,
  selectedAssetIds: Set<string>,
  excludedAssetIds: Set<string>
): void {
  const tree = buildVaultTree(folders, assets);
  const subtreeIds = collectFolderSubtreeIds(folderId, folders);

  if (checked) {
    for (const id of subtreeIds) {
      selectedFolderIds.add(id);
    }
    for (const id of subtreeIds) {
      for (const asset of tree.assetsByFolder.get(id) ?? []) {
        excludedAssetIds.delete(asset.id);
        selectedAssetIds.delete(asset.id);
      }
    }
    return;
  }

  for (const id of subtreeIds) {
    selectedFolderIds.delete(id);
  }
  for (const id of subtreeIds) {
    for (const asset of tree.assetsByFolder.get(id) ?? []) {
      excludedAssetIds.delete(asset.id);
      selectedAssetIds.delete(asset.id);
    }
  }
}

export function isVaultAssetChecked(
  asset: AttachmentLibraryAssetRecord,
  selectedFolderIds: ReadonlySet<string>,
  selectedAssetIds: ReadonlySet<string>,
  excludedAssetIds: ReadonlySet<string>,
  parentById: Map<string, string | null>
): boolean {
  if (excludedAssetIds.has(asset.id)) return false;
  if (selectedAssetIds.has(asset.id)) return true;
  return isUnderFolder(asset.libraryFolderId, selectedFolderIds, parentById);
}

function assetsInFolderSubtree(
  folderId: string,
  folders: FolderNode[],
  assetsByFolder: Map<string | null, AttachmentLibraryAssetRecord[]>
): AttachmentLibraryAssetRecord[] {
  const subtreeIds = collectFolderSubtreeIds(folderId, folders);
  const assets: AttachmentLibraryAssetRecord[] = [];
  for (const id of subtreeIds) {
    assets.push(...(assetsByFolder.get(id) ?? []));
  }
  return assets;
}

export function toggleVaultAssetSelection(
  asset: AttachmentLibraryAssetRecord,
  checked: boolean,
  selectedFolderIds: ReadonlySet<string>,
  selectedAssetIds: Set<string>,
  excludedAssetIds: Set<string>,
  parentById: Map<string, string | null>
): void {
  const underFolder = isUnderFolder(
    asset.libraryFolderId,
    selectedFolderIds,
    parentById
  );

  if (checked) {
    if (underFolder) {
      excludedAssetIds.delete(asset.id);
      return;
    }
    selectedAssetIds.add(asset.id);
    return;
  }

  if (underFolder) {
    excludedAssetIds.add(asset.id);
    return;
  }
  selectedAssetIds.delete(asset.id);
}

export function buildVaultLinkPayload(
  folders: FolderNode[],
  assets: AttachmentLibraryAssetRecord[],
  selectedFolderIds: ReadonlySet<string>,
  selectedAssetIds: ReadonlySet<string>,
  excludedAssetIds: ReadonlySet<string>
): {
  libraryFolderIds: string[];
  assetIds: string[];
  excludedAssetIds: string[];
} {
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const standaloneAssetIds = [...selectedAssetIds].filter((assetId) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return false;
    return !isUnderFolder(asset.libraryFolderId, selectedFolderIds, parentById);
  });

  return {
    libraryFolderIds: minimalSelectedVaultFolderRoots(selectedFolderIds, parentById),
    assetIds: standaloneAssetIds,
    excludedAssetIds: [...excludedAssetIds],
  };
}

export function countVaultLinkSelection(
  folders: FolderNode[],
  assets: AttachmentLibraryAssetRecord[],
  selectedFolderIds: ReadonlySet<string>,
  selectedAssetIds: ReadonlySet<string>,
  excludedAssetIds: ReadonlySet<string>
): number {
  const tree = buildVaultTree(folders, assets);
  const includedAssetIds = new Set<string>();
  const rootFolderIds = minimalSelectedVaultFolderRoots(
    selectedFolderIds,
    tree.parentById
  );

  for (const folderId of rootFolderIds) {
    for (const asset of assetsInFolderSubtree(
      folderId,
      folders,
      tree.assetsByFolder
    )) {
      if (!excludedAssetIds.has(asset.id)) {
        includedAssetIds.add(asset.id);
      }
    }
  }

  for (const assetId of selectedAssetIds) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) continue;
    if (
      isUnderFolder(asset.libraryFolderId, selectedFolderIds, tree.parentById)
    ) {
      continue;
    }
    includedAssetIds.add(assetId);
  }

  return rootFolderIds.length + includedAssetIds.size;
}

/** Roots only: selected folders whose parent is not also selected. */
export function minimalSelectedVaultFolderRoots(
  selectedFolderIds: ReadonlySet<string>,
  parentById: Map<string, string | null>
): string[] {
  return [...selectedFolderIds].filter((folderId) => {
    const ancestors = folderAncestorIds(folderId, parentById);
    return !ancestors
      .slice(1)
      .some((ancestorId) => selectedFolderIds.has(ancestorId));
  });
}
