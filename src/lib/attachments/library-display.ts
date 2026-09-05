import { formatDateTime } from "@/lib/utils";

/** Short upload stamp for duplicate filenames in library lists. */
export function formatLibraryUploadedAt(
  uploadedAt: string | Date | null | undefined
): string {
  return formatDateTime(uploadedAt);
}
