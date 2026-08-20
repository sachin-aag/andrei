export type UploadPdfResumableInput = {
  uploadUrl: string;
  file: File;
  /**
   * Content type for the PUT — must match the type the resumable session was
   * created with (see upload-url route). Defaults to PDF for legacy callers.
   */
  contentType?: string;
  onProgress?: (progress: { uploadedBytes: number; totalBytes: number }) => void;
  signal?: AbortSignal;
  /** Per-chunk timeout. Defaults to 2 minutes. */
  chunkTimeoutMs?: number;
};

/**
 * Resumable upload chunk size. Exported because the large-upload tape draws one
 * cell per chunk, so its grain has to match what actually goes over the wire.
 */
export const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const DEFAULT_CHUNK_TIMEOUT_MS = 120_000;

export async function uploadPdfResumable({
  uploadUrl,
  file,
  contentType = "application/pdf",
  onProgress,
  signal,
  chunkTimeoutMs = DEFAULT_CHUNK_TIMEOUT_MS,
}: UploadPdfResumableInput): Promise<void> {
  let offset = 0;
  onProgress?.({ uploadedBytes: 0, totalBytes: file.size });

  while (offset < file.size) {
    signal?.throwIfAborted();

    const endExclusive = Math.min(offset + CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(offset, endExclusive, contentType);
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${offset}-${endExclusive - 1}/${file.size}`,
        },
        body: chunk,
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(chunkTimeoutMs),
        ]),
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error instanceof Error ? error : new Error("Upload aborted");
      }
      if (
        (error instanceof DOMException && error.name === "TimeoutError") ||
        (error instanceof Error && error.name === "TimeoutError")
      ) {
        throw new Error(
          "Upload timed out. Check your connection and try again."
        );
      }
      // CORS / network failures surface as TypeError("Failed to fetch").
      throw new Error(
        "Upload blocked by the browser (often missing GCS CORS or Origin). Retry, or ask an admin to allow this site's origin on the evidence bucket."
      );
    }

    if (response.status === 308) {
      offset = nextOffsetFromRange(response.headers.get("Range"), endExclusive);
      onProgress?.({ uploadedBytes: offset, totalBytes: file.size });
      continue;
    }

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    onProgress?.({ uploadedBytes: file.size, totalBytes: file.size });
    return;
  }
}

function nextOffsetFromRange(rangeHeader: string | null, fallback: number): number {
  const match = /^bytes=0-(\d+)$/.exec(rangeHeader ?? "");
  if (!match) return fallback;
  return Number(match[1]) + 1;
}
