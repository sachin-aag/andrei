import { kindFromMime } from "@/lib/attachments/file-types";
import { formatDateTime } from "@/lib/utils";

/** Short upload stamp for duplicate filenames in library lists. */
export function formatLibraryUploadedAt(
  uploadedAt: string | Date | null | undefined
): string {
  return formatDateTime(uploadedAt);
}

export function formatVaultByteSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) {
    return `${trimVaultSize(kb)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${trimVaultSize(mb)} MB`;
  }
  return `${trimVaultSize(mb / 1024)} GB`;
}

function trimVaultSize(value: number): string {
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return rounded.replace(/\.0$/, "");
}

export function vaultItemKindLabel(input: {
  isFolder: boolean;
  mimeType?: string | null;
}): string {
  if (input.isFolder) return "Folder";
  const kind = kindFromMime(input.mimeType);
  switch (kind) {
    case "pdf":
      return "PDF document";
    case "docx":
      return "Word document";
    case null:
      return "Document";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
