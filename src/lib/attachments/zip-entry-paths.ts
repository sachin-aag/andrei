import type { ReportAttachmentFolderRecord } from "@/types/report";

const UNSAFE_SEGMENT = /[/\\:*?"<>|\x00-\x1f]/g;

export type ZipAttachmentInput = {
  id: string;
  filename: string;
  folderId: string | null;
  objectKey: string;
};

export type ZipAttachmentEntry = {
  id: string;
  zipPath: string;
  objectKey: string;
};

/** ZIP entry names must be relative, slash-separated, and free of `..` segments. */
export function sanitizeZipSegment(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(UNSAFE_SEGMENT, "_")
    .replace(/^\.+/u, "")
    .replace(/\.+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

export function uniqueZipPath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${dir}${stem} (${n})${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${dir}${stem} (${n})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

function folderPrefixById(
  folders: Pick<ReportAttachmentFolderRecord, "id" | "name" | "parentId">[]
): Map<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const prefixes = new Map<string, string>();

  const prefixFor = (id: string, stack: Set<string>): string | null => {
    const cached = prefixes.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return null;
    const folder = byId.get(id);
    if (!folder) return null;
    stack.add(id);
    const parent =
      folder.parentId && byId.has(folder.parentId)
        ? prefixFor(folder.parentId, stack)
        : "";
    stack.delete(id);
    if (parent === null) return null;
    const name = sanitizeZipSegment(folder.name, "folder");
    const path = parent ? `${parent}/${name}` : name;
    prefixes.set(id, path);
    return path;
  };

  for (const folder of folders) {
    prefixFor(folder.id, new Set());
  }
  return prefixes;
}

export function buildAttachmentZipEntries(
  folders: Pick<ReportAttachmentFolderRecord, "id" | "name" | "parentId">[],
  attachments: ZipAttachmentInput[]
): ZipAttachmentEntry[] {
  const prefixes = folderPrefixById(folders);
  const used = new Set<string>();
  return attachments.map((attachment) => {
    const filename = sanitizeZipSegment(attachment.filename, "document");
    const folderPrefix =
      attachment.folderId != null
        ? prefixes.get(attachment.folderId)
        : undefined;
    const rawPath = folderPrefix ? `${folderPrefix}/${filename}` : filename;
    return {
      id: attachment.id,
      zipPath: uniqueZipPath(rawPath, used),
      objectKey: attachment.objectKey,
    };
  });
}

export function attachmentsZipFileName(documentNo: string): string {
  const safe = (documentNo || "report")
    .replace(/[^a-zA-Z0-9_\-/]/g, "_")
    .replace(/\//g, "-");
  return `Attachments_${safe}.zip`;
}
