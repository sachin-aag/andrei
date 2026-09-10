export type FolderNode = { id: string; parentId: string | null };

/** Direct children keyed by parent id (`null` = report/vault root). */
export function buildFoldersByParent<T extends FolderNode>(
  folders: T[]
): Map<string | null, T[]> {
  const byParent = new Map<string | null, T[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(folder);
    byParent.set(key, list);
  }
  return byParent;
}

/** Folder id plus every descendant folder id. */
export function collectFolderSubtreeIds(
  rootFolderId: string,
  folders: FolderNode[]
): Set<string> {
  const byParent = buildFoldersByParent(folders);
  const result = new Set<string>([rootFolderId]);
  const queue = [rootFolderId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of byParent.get(id) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}

/** Every ancestor folder id for `folderId`, including itself. */
export function folderAncestorIds(
  folderId: string | null,
  parentById: Map<string, string | null>
): string[] {
  const ancestors: string[] = [];
  let cursor: string | null = folderId;
  while (cursor) {
    ancestors.push(cursor);
    cursor = parentById.get(cursor) ?? null;
  }
  return ancestors;
}

export function isUnderFolder(
  folderId: string | null,
  selectedFolderIds: ReadonlySet<string>,
  parentById: Map<string, string | null>
): boolean {
  if (!folderId) return false;
  return folderAncestorIds(folderId, parentById).some((id) =>
    selectedFolderIds.has(id)
  );
}
