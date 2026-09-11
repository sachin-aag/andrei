export type LibraryLinkExistingRow = {
  id: string;
  assetId: string | null;
  deletedAt: Date | string | null;
};

export type LibraryLinkClassification<T extends { id: string }> = {
  skip: T[];
  restore: { asset: T; attachmentId: string }[];
  insert: T[];
};

/**
 * `report_attachments_report_asset_unique` covers live and soft-deleted
 * rows. Skip a live link; restore a tombstone; insert only when the pair is new.
 */
export function classifyAssetsForLibraryLink<T extends { id: string }>(
  assets: T[],
  existingRows: LibraryLinkExistingRow[]
): LibraryLinkClassification<T> {
  const byAssetId = new Map<string, LibraryLinkExistingRow>();
  for (const row of existingRows) {
    if (row.assetId == null) continue;
    if (!byAssetId.has(row.assetId)) {
      byAssetId.set(row.assetId, row);
    }
  }

  const skip: T[] = [];
  const restore: { asset: T; attachmentId: string }[] = [];
  const insert: T[] = [];

  for (const asset of assets) {
    const existing = byAssetId.get(asset.id);
    if (!existing) {
      insert.push(asset);
      continue;
    }
    if (existing.deletedAt == null) {
      skip.push(asset);
      continue;
    }
    restore.push({ asset, attachmentId: existing.id });
  }

  return { skip, restore, insert };
}
