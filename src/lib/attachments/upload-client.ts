export type UploadPdfResumableInput = {
  uploadUrl: string;
  file: File;
  onProgress?: (progress: { uploadedBytes: number; totalBytes: number }) => void;
  signal?: AbortSignal;
};

const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

export async function uploadPdfResumable({
  uploadUrl,
  file,
  onProgress,
  signal,
}: UploadPdfResumableInput): Promise<void> {
  let offset = 0;
  onProgress?.({ uploadedBytes: 0, totalBytes: file.size });

  while (offset < file.size) {
    signal?.throwIfAborted();

    const endExclusive = Math.min(offset + CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(offset, endExclusive, "application/pdf");
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(chunk.size),
        "Content-Range": `bytes ${offset}-${endExclusive - 1}/${file.size}`,
      },
      body: chunk,
      signal,
    });

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
