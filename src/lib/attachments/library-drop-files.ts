import { MAX_FOLDER_DEPTH } from "@/lib/attachments/folder-limits";
import { directorySegmentsFromRelativePath } from "@/lib/attachments/library-relative-path";
import { isSupportedAttachmentFile } from "@/lib/attachments/upload-pdf";

export type LibraryUploadFile = {
  file: File;
  relativePath: string;
};

export type LibraryUploadScan = {
  accepted: LibraryUploadFile[];
  rejectedNames: string[];
};

function basename(path: string): string {
  const parts = path.replaceAll("\\", "/").split("/");
  return parts[parts.length - 1] ?? path;
}

/**
 * Finder/Explorer metadata that shows up in almost every folder pick.
 * These are not user documents — they must not block a PDF/Word folder.
 */
export function isIgnorableLibraryUploadName(filename: string): boolean {
  const name = basename(filename);
  const lower = name.toLowerCase();
  if (lower === ".ds_store" || lower === "thumbs.db" || lower === "desktop.ini") {
    return true;
  }
  if (name.startsWith("._")) return true;
  return false;
}

function relativePathForFile(file: File): string {
  const path =
    "webkitRelativePath" in file
      ? String((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "")
      : "";
  return path || file.name;
}

export function classifyCollectedLibraryFiles(
  collected: LibraryUploadFile[]
): LibraryUploadScan {
  const accepted: LibraryUploadFile[] = [];
  const rejectedNames: string[] = [];
  for (const item of collected) {
    if (isIgnorableLibraryUploadName(item.file.name)) continue;
    if (isSupportedAttachmentFile(item.file)) {
      accepted.push(item);
      continue;
    }
    rejectedNames.push(item.relativePath || item.file.name);
  }
  return { accepted, rejectedNames };
}

export function uniqueRejectedLibraryNames(rejectedNames: string[]): string[] {
  return [...new Set(rejectedNames)];
}

export function libraryTargetFolderDepth(
  folders: { id: string; parentId: string | null }[],
  folderId: string | null
): number {
  if (!folderId) return 0;
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  let depth = 0;
  let cursor: string | null = folderId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    depth += 1;
    if (depth > MAX_FOLDER_DEPTH) return depth;
    cursor = parentById.get(cursor) ?? null;
  }
  return depth;
}

export function libraryUploadBatchError(
  scan: LibraryUploadScan,
  targetFolderDepth: number
): string | null {
  if (scan.accepted.length === 0) {
    if (scan.rejectedNames.length > 0) return null;
    return "No PDF or Word documents found in that folder";
  }
  for (const item of scan.accepted) {
    const nested = directorySegmentsFromRelativePath(
      item.relativePath,
      item.file.name
    ).length;
    if (targetFolderDepth + nested > MAX_FOLDER_DEPTH) {
      return `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`;
    }
  }
  return null;
}

export function libraryUploadFilesFromList(
  fileList: FileList | File[]
): LibraryUploadScan {
  return classifyCollectedLibraryFiles(
    Array.from(fileList).map((file) => ({
      file,
      relativePath: relativePathForFile(file),
    }))
  );
}

const LIBRARY_UPLOAD_SCAN_CHUNK = 40;

/** Let React paint a spinner before a long folder scan continues. */
export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
      return;
    }
    setTimeout(resolve, 0);
  });
}

/**
 * Same scan as `libraryUploadFilesFromList`, but yields between chunks so a
 * large folder cannot freeze the page before our upload dialog can paint.
 */
export async function libraryUploadFilesFromListAsync(
  fileList: FileList | File[],
  options?: {
    chunkSize?: number;
    onProgress?: (scanned: number, total: number) => void;
  }
): Promise<LibraryUploadScan> {
  const total = fileList.length;
  const chunkSize = Math.max(1, options?.chunkSize ?? LIBRARY_UPLOAD_SCAN_CHUNK);
  const collected: LibraryUploadFile[] = [];

  for (let index = 0; index < total; index += 1) {
    const file = fileList[index]!;
    collected.push({
      file,
      relativePath: relativePathForFile(file),
    });
    const scanned = index + 1;
    const atChunkEnd = scanned % chunkSize === 0 || scanned === total;
    if (!atChunkEnd) continue;
    options?.onProgress?.(scanned, total);
    if (scanned < total) await yieldToPaint();
  }

  return classifyCollectedLibraryFiles(collected);
}

export function canShowDirectoryPicker(
  target: { showDirectoryPicker?: unknown } = typeof window === "undefined"
    ? {}
    : window
): boolean {
  return typeof target.showDirectoryPicker === "function";
}

export function isDirectoryPickerAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "AbortError"
  );
}

type DirectoryWalkOptions = {
  onProgress?: (scanned: number) => void;
};

function directoryHandleEntries(
  dir: FileSystemDirectoryHandle
): AsyncIterableIterator<[string, FileSystemHandle]> {
  if (typeof dir.entries !== "function") {
    throw new Error("This browser cannot list folder contents");
  }
  return dir.entries();
}

async function collectFromHandle(
  handle: FileSystemHandle,
  prefix: string,
  out: LibraryUploadFile[],
  options?: DirectoryWalkOptions
): Promise<void> {
  switch (handle.kind) {
    case "file": {
      const file = await (handle as FileSystemFileHandle).getFile();
      const relativePath = prefix ? `${prefix}/${handle.name}` : handle.name;
      out.push({ file, relativePath });
      options?.onProgress?.(out.length);
      if (out.length % LIBRARY_UPLOAD_SCAN_CHUNK === 0) {
        await yieldToPaint();
      }
      return;
    }
    case "directory": {
      const dir = handle as FileSystemDirectoryHandle;
      const nextPrefix = prefix ? `${prefix}/${dir.name}` : dir.name;
      for await (const [, child] of directoryHandleEntries(dir)) {
        await collectFromHandle(child, nextPrefix, out, options);
      }
      return;
    }
    default: {
      const _exhaustive: never = handle.kind;
      return _exhaustive;
    }
  }
}

/**
 * Walk a directory handle from `showDirectoryPicker` / dropped
 * `getAsFileSystemHandle`. Paths include the selected folder name, matching
 * `webkitRelativePath` from `<input webkitdirectory>`.
 */
export async function libraryUploadFilesFromDirectoryHandle(
  dir: FileSystemDirectoryHandle,
  options?: DirectoryWalkOptions
): Promise<LibraryUploadScan> {
  const collected: LibraryUploadFile[] = [];
  await collectFromHandle(dir, "", collected, options);
  return classifyCollectedLibraryFiles(collected);
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: LibraryUploadFile[]
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
    });
    if (!file) return;
    const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
    out.push({ file, relativePath });
    return;
  }
  if (!entry.isDirectory) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    children.push(...batch);
  }

  const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
  for (const child of children) {
    await walkEntry(child, nextPrefix, out);
  }
}

/**
 * Snapshot directory handles/entries in the drop event turn. Do not await
 * paint before calling this — Chrome drops the handles after the gesture.
 */
export async function libraryUploadFilesFromDataTransfer(
  dataTransfer: DataTransfer,
  options?: DirectoryWalkOptions
): Promise<LibraryUploadScan> {
  const collected: LibraryUploadFile[] = [];
  const items = [...dataTransfer.items];
  const canUseHandles = items.every(
    (item) => typeof item.getAsFileSystemHandle === "function"
  );

  if (canUseHandles && items.length > 0) {
    const handlePromises = items.map((item) => item.getAsFileSystemHandle());
    const handles = await Promise.all(handlePromises);
    for (const handle of handles) {
      if (!handle) continue;
      await collectFromHandle(handle, "", collected, options);
    }
    return classifyCollectedLibraryFiles(collected);
  }

  if (items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null);
    for (let index = 0; index < items.length; index += 1) {
      const entry = entries[index];
      if (entry) {
        await walkEntry(entry, "", collected);
        continue;
      }
      const item = items[index]!;
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (!file) continue;
      collected.push({ file, relativePath: relativePathForFile(file) });
    }
    return classifyCollectedLibraryFiles(collected);
  }

  return libraryUploadFilesFromList(dataTransfer.files);
}
