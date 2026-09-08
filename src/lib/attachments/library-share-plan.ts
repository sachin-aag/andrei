import {
  collectFolderSubtreeIds,
  type FolderNode,
} from "@/lib/attachments/folder-subtree";

export type ShareableAssetRef = {
  id: string;
  libraryFolderId: string | null;
};

/** Live file ids covered by a vault selection (folder trees plus loose files). */
export function planLibraryShare(
  folders: FolderNode[],
  assets: ShareableAssetRef[],
  selectedFolderIds: string[],
  selectedAssetIds: string[],
  excludedAssetIds: string[] = []
): string[] {
  const subtreeFolderIds = new Set<string>();
  for (const folderId of selectedFolderIds) {
    for (const id of collectFolderSubtreeIds(folderId, folders)) {
      subtreeFolderIds.add(id);
    }
  }

  const assetIds = new Set<string>();
  const selectedAssets = new Set(selectedAssetIds);
  const excludedAssets = new Set(excludedAssetIds);
  for (const asset of assets) {
    if (excludedAssets.has(asset.id)) continue;
    if (selectedAssets.has(asset.id)) {
      assetIds.add(asset.id);
      continue;
    }
    if (
      asset.libraryFolderId != null &&
      subtreeFolderIds.has(asset.libraryFolderId)
    ) {
      assetIds.add(asset.id);
    }
  }
  return [...assetIds];
}
