import { isSupportedAttachmentFile } from "@/lib/attachments/upload-pdf";

export type LibraryUploadFile = {
  file: File;
  relativePath: string;
};

function relativePathForFile(file: File): string {
  const path =
    "webkitRelativePath" in file
      ? String((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "")
      : "";
  return path || file.name;
}

export function libraryUploadFilesFromList(
  fileList: FileList | File[]
): { accepted: LibraryUploadFile[]; skipped: number } {
  const accepted: LibraryUploadFile[] = [];
  let skipped = 0;
  for (const file of Array.from(fileList)) {
    if (!isSupportedAttachmentFile(file)) {
      skipped += 1;
      continue;
    }
    accepted.push({ file, relativePath: relativePathForFile(file) });
  }
  return { accepted, skipped };
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: LibraryUploadFile[]
): Promise<number> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
    });
    if (!file) return 0;
    if (!isSupportedAttachmentFile(file)) return 1;
    const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
    out.push({ file, relativePath });
    return 0;
  }
  if (!entry.isDirectory) return 0;

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
  let skipped = 0;
  for (const child of children) {
    skipped += await walkEntry(child, nextPrefix, out);
  }
  return skipped;
}

export async function libraryUploadFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<{ accepted: LibraryUploadFile[]; skipped: number }> {
  const accepted: LibraryUploadFile[] = [];
  let skipped = 0;
  const items = [...dataTransfer.items];
  if (items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        skipped += await walkEntry(entry, "", accepted);
      } else if (item.kind === "file") {
        const file = item.getAsFile();
        if (!file) continue;
        if (!isSupportedAttachmentFile(file)) {
          skipped += 1;
          continue;
        }
        accepted.push({ file, relativePath: relativePathForFile(file) });
      }
    }
    return { accepted, skipped };
  }

  return libraryUploadFilesFromList(dataTransfer.files);
}
