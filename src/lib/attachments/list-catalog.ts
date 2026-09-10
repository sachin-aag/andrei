import { MAX_FOLDER_DEPTH } from "@/lib/attachments/folder-limits";
import type { AttachmentProcessingStatus } from "@/db/schema";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

export const LIST_ATTACHMENTS_DEFAULT_LIMIT = 50;
export const LIST_ATTACHMENTS_MAX_LIMIT = 80;

export type AttachmentCatalogStatusFilter = "all" | "ready" | "not_ready";

export type AttachmentCatalogRow = {
  id: string;
  filename: string;
  folderPath: string;
  pageCount: number | null;
  processingStatus: AttachmentProcessingStatus;
  mimeType: string;
  sizeBytes: number;
};

export type AttachmentCatalogResult = {
  scope: "all" | "tagged";
  statusFilter: AttachmentCatalogStatusFilter;
  query: string | null;
  total: number;
  ready: number;
  notReady: number;
  folderCount: number;
  matched: number;
  returned: number;
  offset: number;
  nextOffset: number | null;
  pageCountSum: number;
  pageCountUnknown: number;
  files: AttachmentCatalogRow[];
};

export type BuildAttachmentCatalogInput = {
  attachments: readonly ReportAttachmentRecord[];
  folders: readonly ReportAttachmentFolderRecord[];
  pinnedAttachmentIds?: readonly string[];
  query?: string;
  status?: AttachmentCatalogStatusFilter;
  offset?: number;
  limit?: number;
};

function isReady(status: AttachmentProcessingStatus): boolean {
  return status === "ready";
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) {
    return LIST_ATTACHMENTS_DEFAULT_LIMIT;
  }
  const n = Math.floor(limit);
  if (n < 1) return LIST_ATTACHMENTS_DEFAULT_LIMIT;
  return Math.min(n, LIST_ATTACHMENTS_MAX_LIMIT);
}

function clampOffset(offset: number | undefined): number {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.floor(offset);
}

function normalizeQuery(query: string | undefined): string | null {
  const trimmed = query?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Folder path as shown in the Attachments tree (`SOPs / 2026`).
 * Missing parents and cycles hoist to the last known name, matching
 * `buildDocumentTree` so a bad row cannot hide a file.
 */
export function folderPathById(
  folders: readonly ReportAttachmentFolderRecord[]
): Map<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();

  function pathFor(id: string, stack: string[]): string {
    const cached = paths.get(id);
    if (cached !== undefined) return cached;
    const folder = byId.get(id);
    if (!folder) {
      paths.set(id, "");
      return "";
    }
    if (stack.includes(id) || stack.length >= MAX_FOLDER_DEPTH) {
      paths.set(id, folder.name);
      return folder.name;
    }
    if (!folder.parentId || !byId.has(folder.parentId)) {
      paths.set(id, folder.name);
      return folder.name;
    }
    const parentPath = pathFor(folder.parentId, [...stack, id]);
    const next = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    paths.set(id, next);
    return next;
  }

  for (const folder of folders) {
    pathFor(folder.id, []);
  }
  return paths;
}

function compareCatalogRows(
  a: AttachmentCatalogRow,
  b: AttachmentCatalogRow
): number {
  const folder = a.folderPath.localeCompare(b.folderPath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (folder !== 0) return folder;
  return a.filename.localeCompare(b.filename, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function matchesQuery(row: AttachmentCatalogRow, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    row.filename.toLowerCase().includes(needle) ||
    row.folderPath.toLowerCase().includes(needle)
  );
}

function matchesStatus(
  status: AttachmentProcessingStatus,
  filter: AttachmentCatalogStatusFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "ready") return isReady(status);
  return !isReady(status);
}

export function buildAttachmentCatalog(
  input: BuildAttachmentCatalogInput
): AttachmentCatalogResult {
  const pinned = [
    ...new Set(
      (input.pinnedAttachmentIds ?? []).filter((id) => id.trim().length > 0)
    ),
  ];
  const pinnedSet = new Set(pinned);
  const scoped =
    pinned.length > 0
      ? input.attachments.filter((file) => pinnedSet.has(file.id))
      : [...input.attachments];
  const paths = folderPathById(input.folders);
  const statusFilter = input.status ?? "all";
  const query = normalizeQuery(input.query);
  const offset = clampOffset(input.offset);
  const limit = clampLimit(input.limit);

  const rows = scoped
    .map((file) => {
      const folderPath =
        file.folderId && paths.has(file.folderId)
          ? (paths.get(file.folderId) ?? "")
          : "";
      return {
        id: file.id,
        filename: file.filename,
        folderPath,
        pageCount: file.pageCount,
        processingStatus: file.processingStatus,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      };
    })
    .toSorted(compareCatalogRows);

  const ready = rows.filter((row) => isReady(row.processingStatus)).length;
  const folderIds = new Set(
    scoped
      .map((file) => file.folderId)
      .filter((id): id is string => id != null && paths.has(id))
  );
  const folderCount =
    pinned.length > 0 ? folderIds.size : input.folders.length;

  const matched = rows.filter((row) => {
    if (!matchesStatus(row.processingStatus, statusFilter)) return false;
    if (query && !matchesQuery(row, query)) return false;
    return true;
  });

  const page = matched.slice(offset, offset + limit);
  const pageCountSum = matched.reduce(
    (sum, row) => sum + (typeof row.pageCount === "number" ? row.pageCount : 0),
    0
  );
  const pageCountUnknown = matched.filter(
    (row) => typeof row.pageCount !== "number" || row.pageCount < 0
  ).length;
  const nextOffset =
    offset + page.length < matched.length ? offset + page.length : null;

  return {
    scope: pinned.length > 0 ? "tagged" : "all",
    statusFilter,
    query,
    total: rows.length,
    ready,
    notReady: rows.length - ready,
    folderCount,
    matched: matched.length,
    returned: page.length,
    offset,
    nextOffset,
    pageCountSum,
    pageCountUnknown,
    files: page,
  };
}
