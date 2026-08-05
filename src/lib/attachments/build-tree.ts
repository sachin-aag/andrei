import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

export type DocumentTreeFolder = {
  id: string;
  name: string;
  folders: DocumentTreeFolder[];
  attachments: ReportAttachmentRecord[];
};

export type DocumentTree = {
  folders: DocumentTreeFolder[];
  attachments: ReportAttachmentRecord[];
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

const byFilename = (a: ReportAttachmentRecord, b: ReportAttachmentRecord) =>
  a.filename.localeCompare(b.filename, undefined, {
    numeric: true,
    sensitivity: "base",
  });

/**
 * Assembles the flat folder + attachment lists into a tree.
 *
 * Nodes whose parent is missing, and folders that would form a cycle, are
 * surfaced at the root rather than dropped, so a bad row can never hide a
 * document from the user.
 */
export function buildDocumentTree(
  folders: ReportAttachmentFolderRecord[],
  attachments: ReportAttachmentRecord[]
): DocumentTree {
  const folderIds = new Set(folders.map((folder) => folder.id));

  const childFolders = new Map<string | null, ReportAttachmentFolderRecord[]>();
  for (const folder of folders) {
    const parentId =
      folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
    const siblings = childFolders.get(parentId);
    if (siblings) siblings.push(folder);
    else childFolders.set(parentId, [folder]);
  }

  const folderAttachments = new Map<string | null, ReportAttachmentRecord[]>();
  for (const attachment of attachments) {
    const folderId =
      attachment.folderId && folderIds.has(attachment.folderId)
        ? attachment.folderId
        : null;
    const siblings = folderAttachments.get(folderId);
    if (siblings) siblings.push(attachment);
    else folderAttachments.set(folderId, [attachment]);
  }

  const visited = new Set<string>();

  function build(parentId: string | null): DocumentTreeFolder[] {
    const children = childFolders.get(parentId) ?? [];
    const nodes: DocumentTreeFolder[] = [];
    for (const folder of children.toSorted(byName)) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      nodes.push({
        id: folder.id,
        name: folder.name,
        folders: build(folder.id),
        attachments: (folderAttachments.get(folder.id) ?? []).toSorted(byFilename),
      });
    }
    return nodes;
  }

  const tree: DocumentTree = {
    folders: build(null),
    attachments: (folderAttachments.get(null) ?? []).toSorted(byFilename),
  };

  // A cycle leaves its members unvisited — hoist them so nothing disappears.
  for (const folder of folders) {
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);
    tree.folders.push({
      id: folder.id,
      name: folder.name,
      folders: [],
      attachments: (folderAttachments.get(folder.id) ?? []).toSorted(byFilename),
    });
  }
  tree.folders.sort(byName);

  return tree;
}

/** Ids of `folderId` and everything beneath it — used to block invalid drops. */
export function collectSubtreeIds(
  folders: ReportAttachmentFolderRecord[],
  folderId: string
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const siblings = childrenByParent.get(folder.parentId);
    if (siblings) siblings.push(folder.id);
    else childrenByParent.set(folder.parentId, [folder.id]);
  }

  const ids = new Set<string>([folderId]);
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      queue.push(child);
    }
  }
  return ids;
}
