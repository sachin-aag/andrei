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

export async function libraryUploadFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<LibraryUploadScan> {
  const collected: LibraryUploadFile[] = [];
  const items = [...dataTransfer.items];
  if (items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        await walkEntry(entry, "", collected);
      } else if (item.kind === "file") {
        const file = item.getAsFile();
        if (!file) continue;
        collected.push({ file, relativePath: relativePathForFile(file) });
      }
    }
    return classifyCollectedLibraryFiles(collected);
  }

  return libraryUploadFilesFromList(dataTransfer.files);
}
