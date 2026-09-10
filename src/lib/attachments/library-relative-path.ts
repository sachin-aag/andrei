/**
 * Directory segments from a folder-upload relative path.
 * `Quality/SOP/file.pdf` with filename `file.pdf` → `["Quality", "SOP"]`.
 */
export function directorySegmentsFromRelativePath(
  relativePath: string | undefined,
  filename: string
): string[] {
  const raw = (relativePath ?? "").replaceAll("\\", "/").trim();
  if (!raw) return [];
  const parts = raw.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) return [];
  const last = parts[parts.length - 1] ?? "";
  if (last === filename || last.toLowerCase() === filename.toLowerCase()) {
    return parts.slice(0, -1);
  }
  return parts;
}
