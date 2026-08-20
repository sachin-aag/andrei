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

/** Floor after a timeout/5xx — same as the previous fixed chunk size. */
export const MIN_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
/** Cap so one blip does not force a 250 MB retransmission. */
export const MAX_CHUNK_SIZE_BYTES = 32 * 1024 * 1024;
/** Start mid-range: fewer GCS round-trips than 8 MB, cheaper to retry than 32 MB. */
export const INITIAL_CHUNK_SIZE_BYTES = 16 * 1024 * 1024;
/** GCS resumable PUTs (except the last) must be multiples of 256 KiB. */
export const GCS_CHUNK_ALIGNMENT_BYTES = 256 * 1024;
/** Aim the next chunk at ~12s of observed upload throughput. */
export const TARGET_CHUNK_DURATION_MS = 12_000;

const DEFAULT_CHUNK_TIMEOUT_MS = 120_000;
const MAX_RETRIES_AT_MIN_CHUNK = 1;

export function alignChunkSize(bytes: number): number {
  const aligned =
    Math.floor(bytes / GCS_CHUNK_ALIGNMENT_BYTES) * GCS_CHUNK_ALIGNMENT_BYTES;
  return Math.min(
    MAX_CHUNK_SIZE_BYTES,
    Math.max(MIN_CHUNK_SIZE_BYTES, aligned)
  );
}

/** Grow or shrink toward a chunk that would take ~12s at the last chunk's rate. */
export function nextChunkSizeAfterSuccess(input: {
  chunkBytes: number;
  elapsedMs: number;
}): number {
  if (input.chunkBytes <= 0) {
    return INITIAL_CHUNK_SIZE_BYTES;
  }
  const elapsedMs = Math.max(input.elapsedMs, 1);
  return alignChunkSize(
    (input.chunkBytes / elapsedMs) * TARGET_CHUNK_DURATION_MS
  );
}

/** Halve after a failed PUT; never go below 8 MB. */
export function nextChunkSizeAfterFailure(currentSize: number): number {
  return alignChunkSize(currentSize / 2);
}

export function nextOffsetFromRange(
  rangeHeader: string | null,
  fallback: number
): number {
  const match = /^bytes=0-(\d+)$/.exec(rangeHeader ?? "");
  if (!match) return fallback;
  return Number(match[1]) + 1;
}

export async function uploadPdfResumable({
  uploadUrl,
  file,
  contentType = "application/pdf",
  onProgress,
  signal,
  chunkTimeoutMs = DEFAULT_CHUNK_TIMEOUT_MS,
}: UploadPdfResumableInput): Promise<void> {
  let offset = 0;
  let chunkSize = INITIAL_CHUNK_SIZE_BYTES;
  let chunkCeiling = MAX_CHUNK_SIZE_BYTES;
  let retriesAtMin = 0;
  onProgress?.({ uploadedBytes: 0, totalBytes: file.size });

  while (offset < file.size) {
    signal?.throwIfAborted();

    const endExclusive = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, endExclusive, contentType);
    const chunkStartedAt = Date.now();
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
      const handled = await handleRetryableFailure({
        error,
        uploadUrl,
        fileSize: file.size,
        lastOffset: offset,
        chunkSize,
        retriesAtMin,
        signal,
        chunkTimeoutMs,
        onProgress,
      });
      chunkSize = handled.chunkSize;
      chunkCeiling = handled.chunkSize;
      retriesAtMin = handled.retriesAtMin;
      offset = handled.offset;
      continue;
    }

    if (response.status === 308) {
      const nextOffset = nextOffsetFromRange(
        response.headers.get("Range"),
        endExclusive
      );
      chunkSize = Math.min(
        chunkCeiling,
        nextChunkSizeAfterSuccess({
          chunkBytes: Math.max(0, nextOffset - offset),
          elapsedMs: Date.now() - chunkStartedAt,
        })
      );
      retriesAtMin = 0;
      offset = nextOffset;
      onProgress?.({ uploadedBytes: offset, totalBytes: file.size });
      continue;
    }

    if (isRetryableHttpStatus(response.status)) {
      const handled = await handleRetryableFailure({
        error: new Error(`Upload failed with status ${response.status}`),
        uploadUrl,
        fileSize: file.size,
        lastOffset: offset,
        chunkSize,
        retriesAtMin,
        signal,
        chunkTimeoutMs,
        onProgress,
      });
      chunkSize = handled.chunkSize;
      chunkCeiling = handled.chunkSize;
      retriesAtMin = handled.retriesAtMin;
      offset = handled.offset;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    onProgress?.({ uploadedBytes: file.size, totalBytes: file.size });
    return;
  }
}

async function handleRetryableFailure(input: {
  error: unknown;
  uploadUrl: string;
  fileSize: number;
  lastOffset: number;
  chunkSize: number;
  retriesAtMin: number;
  signal?: AbortSignal;
  chunkTimeoutMs: number;
  onProgress?: (progress: { uploadedBytes: number; totalBytes: number }) => void;
}): Promise<{ offset: number; chunkSize: number; retriesAtMin: number }> {
  if (input.signal?.aborted) {
    throw input.error instanceof Error ? input.error : new Error("Upload aborted");
  }

  const mapped = mapFetchError(input.error);
  const atMin = input.chunkSize <= MIN_CHUNK_SIZE_BYTES;
  if (atMin && input.retriesAtMin >= MAX_RETRIES_AT_MIN_CHUNK) {
    throw mapped;
  }

  const chunkSize = atMin
    ? MIN_CHUNK_SIZE_BYTES
    : nextChunkSizeAfterFailure(input.chunkSize);
  const queried = await queryUploadedOffset({
    uploadUrl: input.uploadUrl,
    fileSize: input.fileSize,
    fallback: input.lastOffset,
    signal: input.signal,
    chunkTimeoutMs: input.chunkTimeoutMs,
  });
  const offset = Math.min(input.fileSize, Math.max(input.lastOffset, queried));
  input.onProgress?.({ uploadedBytes: offset, totalBytes: input.fileSize });

  return {
    offset,
    chunkSize,
    retriesAtMin: atMin ? input.retriesAtMin + 1 : 0,
  };
}

async function queryUploadedOffset(input: {
  uploadUrl: string;
  fileSize: number;
  fallback: number;
  signal?: AbortSignal;
  chunkTimeoutMs: number;
}): Promise<number> {
  try {
    const response = await fetch(input.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Range": `bytes */${input.fileSize}`,
      },
      signal: AbortSignal.any([
        ...(input.signal ? [input.signal] : []),
        AbortSignal.timeout(input.chunkTimeoutMs),
      ]),
    });
    if (response.status === 308) {
      return nextOffsetFromRange(response.headers.get("Range"), input.fallback);
    }
    if (response.ok) {
      return input.fileSize;
    }
  } catch (error) {
    if (input.signal?.aborted) {
      throw error instanceof Error ? error : new Error("Upload aborted");
    }
  }
  return input.fallback;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

function mapFetchError(error: unknown): Error {
  if (isTimeoutError(error)) {
    return new Error("Upload timed out. Check your connection and try again.");
  }
  if (error instanceof Error && error.message.startsWith("Upload failed with status")) {
    return error;
  }
  // CORS / network failures surface as TypeError("Failed to fetch").
  return new Error(
    "Upload blocked by the browser (often missing GCS CORS or Origin). Retry, or ask an admin to allow this site's origin on the evidence bucket."
  );
}
