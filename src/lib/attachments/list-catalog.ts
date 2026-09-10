import { MAX_FOLDER_DEPTH } from "@/lib/attachments/folder-limits";
import { resolveAttachmentKind } from "@/lib/attachments/file-types";
import type { AttachmentProcessingStatus } from "@/db/schema";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

export const LIST_ATTACHMENTS_DEFAULT_LIMIT = 50;
export const LIST_ATTACHMENTS_MAX_LIMIT = 80;
export const LIST_ATTACHMENTS_NOTE_MAX = 80;
/** Filter value for files that sit at the Attachments tree root. */
export const LIST_ATTACHMENTS_ROOT_FOLDER = "(root)";

export const ATTACHMENT_CATALOG_FILE_KINDS = ["pdf", "docx", "other"] as const;

export type AttachmentCatalogFileKind =
  (typeof ATTACHMENT_CATALOG_FILE_KINDS)[number];

export type AttachmentCatalogStatusFilter = "all" | "ready" | "not_ready";

export type AttachmentCatalogRow = {
  id: string;
  filename: string;
  folderPath: string;
  fileKind: AttachmentCatalogFileKind;
  pageCount: number | null;
  processingStatus: AttachmentProcessingStatus;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
};

export type AttachmentCatalogFolderBucket = {
  path: string;
  fileCount: number;
  ready: number;
  notReady: number;
};

export type AttachmentCatalogTypeBucket = {
  kind: AttachmentCatalogFileKind;
  count: number;
};

export type AttachmentCatalogResult = {
  scope: "all" | "tagged";
  statusFilter: AttachmentCatalogStatusFilter;
  query: string | null;
  folder: string | null;
  fileType: AttachmentCatalogFileKind | null;
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
  folders: AttachmentCatalogFolderBucket[];
  fileTypes: AttachmentCatalogTypeBucket[];
  files: AttachmentCatalogRow[];
};

export type BuildAttachmentCatalogInput = {
  attachments: readonly ReportAttachmentRecord[];
  folders: readonly ReportAttachmentFolderRecord[];
  pinnedAttachmentIds?: readonly string[];
  /** Ingest summaries keyed by attachment id — used for topic matching only. */
  topicsById?: ReadonlyMap<string, string>;
  query?: string;
  folder?: string;
  fileType?: AttachmentCatalogFileKind;
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

function normalizeFolderFilter(folder: string | undefined): string | null {
  const trimmed = folder?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function attachmentCatalogKind(
  filename: string,
  mimeType: string
): AttachmentCatalogFileKind {
  return resolveAttachmentKind({ filename, mimeType }) ?? "other";
}

function compactNote(
  description: string | null,
  topics: string | undefined
): string | null {
  const fromDescription = description?.trim() ?? "";
  if (fromDescription.length > 0) {
    return fromDescription.slice(0, LIST_ATTACHMENTS_NOTE_MAX);
  }
  const fromTopics = topics?.trim() ?? "";
  if (fromTopics.length > 0) {
    return fromTopics.slice(0, LIST_ATTACHMENTS_NOTE_MAX);
  }
  return null;
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

function compareFolderPaths(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function matchesQuery(
  row: AttachmentCatalogRow,
  topics: string | undefined,
  description: string | null,
  query: string
): boolean {
  const needle = query.toLowerCase();
  if (row.filename.toLowerCase().includes(needle)) return true;
  if (row.folderPath.toLowerCase().includes(needle)) return true;
  if (description?.toLowerCase().includes(needle)) return true;
  if (topics?.toLowerCase().includes(needle)) return true;
  return false;
}

function matchesFolder(
  folderPath: string,
  folder: string
): boolean {
  if (folder === LIST_ATTACHMENTS_ROOT_FOLDER) {
    return folderPath === "";
  }
  return folderPath.toLowerCase().includes(folder.toLowerCase());
}

function matchesStatus(
  status: AttachmentProcessingStatus,
  filter: AttachmentCatalogStatusFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "ready") return isReady(status);
  return !isReady(status);
}

function emptyTypeCounts(): Record<AttachmentCatalogFileKind, number> {
  return { pdf: 0, docx: 0, other: 0 };
}

function typeBuckets(
  counts: Record<AttachmentCatalogFileKind, number>
): AttachmentCatalogTypeBucket[] {
  return ATTACHMENT_CATALOG_FILE_KINDS.map((kind) => ({
    kind,
    count: counts[kind],
  }));
}

function folderBucketsFromMatched(
  matched: readonly AttachmentCatalogRow[],
  allFolderPaths: readonly string[],
  includeEmptyFolders: boolean
): AttachmentCatalogFolderBucket[] {
  const byPath = new Map<string, AttachmentCatalogFolderBucket>();

  function ensure(path: string): AttachmentCatalogFolderBucket {
    const existing = byPath.get(path);
    if (existing) return existing;
    const created: AttachmentCatalogFolderBucket = {
      path,
      fileCount: 0,
      ready: 0,
      notReady: 0,
    };
    byPath.set(path, created);
    return created;
  }

  if (includeEmptyFolders) {
    ensure("");
    for (const path of allFolderPaths) {
      if (path) ensure(path);
    }
  }

  for (const row of matched) {
    const bucket = ensure(row.folderPath);
    bucket.fileCount += 1;
    if (isReady(row.processingStatus)) bucket.ready += 1;
    else bucket.notReady += 1;
  }

  return [...byPath.values()].toSorted((a, b) =>
    compareFolderPaths(a.path, b.path)
  );
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
  const topicsById = input.topicsById ?? new Map<string, string>();
  const statusFilter = input.status ?? "all";
  const query = normalizeQuery(input.query);
  const folder = normalizeFolderFilter(input.folder);
  const fileType = input.fileType ?? null;
  const offset = clampOffset(input.offset);
  const limit = clampLimit(input.limit);

  const rows = scoped
    .map((file) => {
      const folderPath =
        file.folderId && paths.has(file.folderId)
          ? (paths.get(file.folderId) ?? "")
          : "";
      const topics = topicsById.get(file.id);
      return {
        id: file.id,
        filename: file.filename,
        folderPath,
        fileKind: attachmentCatalogKind(file.filename, file.mimeType),
        pageCount: file.pageCount,
        processingStatus: file.processingStatus,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        note: compactNote(file.description, topics),
        description: file.description,
        topics,
      };
    })
    .toSorted((a, b) => compareCatalogRows(a, b));

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
    if (folder && !matchesFolder(row.folderPath, folder)) return false;
    if (fileType && row.fileKind !== fileType) return false;
    if (query && !matchesQuery(row, row.topics, row.description, query)) {
      return false;
    }
    return true;
  });

  const typeCounts = emptyTypeCounts();
  for (const row of matched) {
    typeCounts[row.fileKind] += 1;
  }

  const includeEmptyFolders = query == null && folder == null && fileType == null;
  const folders = folderBucketsFromMatched(
    matched,
    [...paths.values()],
    includeEmptyFolders && pinned.length === 0
  );

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
    folder,
    fileType,
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
    folders,
    fileTypes: typeBuckets(typeCounts),
    files: page.map((row) => ({
      id: row.id,
      filename: row.filename,
      folderPath: row.folderPath,
      fileKind: row.fileKind,
      pageCount: row.pageCount,
      processingStatus: row.processingStatus,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      note: row.note,
    })),
  };
}
