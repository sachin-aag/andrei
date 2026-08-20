import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_CHUNK_SIZE_BYTES,
  MAX_CHUNK_SIZE_BYTES,
  MIN_CHUNK_SIZE_BYTES,
  TARGET_CHUNK_DURATION_MS,
  alignChunkSize,
  nextChunkSizeAfterFailure,
  nextChunkSizeAfterSuccess,
  nextOffsetFromRange,
  uploadPdfResumable,
} from "./upload-client";

describe("alignChunkSize", () => {
  it("clamps to 8–32 MB and keeps GCS 256 KiB alignment", () => {
    expect(alignChunkSize(4 * 1024 * 1024)).toBe(MIN_CHUNK_SIZE_BYTES);
    expect(alignChunkSize(64 * 1024 * 1024)).toBe(MAX_CHUNK_SIZE_BYTES);
    expect(alignChunkSize(12 * 1024 * 1024 + 100)).toBe(12 * 1024 * 1024);
  });
});

describe("nextChunkSizeAfterSuccess", () => {
  it("grows toward 32 MB when the last chunk was fast", () => {
    expect(
      nextChunkSizeAfterSuccess({
        chunkBytes: INITIAL_CHUNK_SIZE_BYTES,
        elapsedMs: 1_000,
      })
    ).toBe(MAX_CHUNK_SIZE_BYTES);
  });

  it("shrinks toward 8 MB when the last chunk was slow", () => {
    expect(
      nextChunkSizeAfterSuccess({
        chunkBytes: INITIAL_CHUNK_SIZE_BYTES,
        elapsedMs: 90_000,
      })
    ).toBe(MIN_CHUNK_SIZE_BYTES);
  });

  it("targets about 12 seconds of the observed rate", () => {
    const oneMegabytePerSecond = 1024 * 1024;
    expect(
      nextChunkSizeAfterSuccess({
        chunkBytes: oneMegabytePerSecond * 10,
        elapsedMs: 10_000,
      })
    ).toBe(oneMegabytePerSecond * (TARGET_CHUNK_DURATION_MS / 1000));
  });
});

describe("nextChunkSizeAfterFailure", () => {
  it("halves and never goes below 8 MB", () => {
    expect(nextChunkSizeAfterFailure(MAX_CHUNK_SIZE_BYTES)).toBe(
      INITIAL_CHUNK_SIZE_BYTES
    );
    expect(nextChunkSizeAfterFailure(INITIAL_CHUNK_SIZE_BYTES)).toBe(
      MIN_CHUNK_SIZE_BYTES
    );
    expect(nextChunkSizeAfterFailure(MIN_CHUNK_SIZE_BYTES)).toBe(
      MIN_CHUNK_SIZE_BYTES
    );
  });
});

describe("nextOffsetFromRange", () => {
  it("reads the next byte from a GCS Range header", () => {
    expect(nextOffsetFromRange("bytes=0-8388607", 0)).toBe(8 * 1024 * 1024);
    expect(nextOffsetFromRange(null, 4)).toBe(4);
  });
});

describe("uploadPdfResumable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries a timed-out first chunk at 8 MB and stays there for later PUTs", async () => {
    const fileSize = 24 * 1024 * 1024;
    const file = fakeSizedFile(fileSize);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = contentRange(init);
      if (range === `bytes */${fileSize}`) {
        return resumeIncomplete(null);
      }
      if (range === `bytes 0-${INITIAL_CHUNK_SIZE_BYTES - 1}/${fileSize}`) {
        const timeout = new Error("The operation was aborted due to timeout");
        timeout.name = "TimeoutError";
        throw timeout;
      }
      if (range === `bytes 0-${MIN_CHUNK_SIZE_BYTES - 1}/${fileSize}`) {
        return resumeIncomplete(`bytes=0-${MIN_CHUNK_SIZE_BYTES - 1}`);
      }
      if (
        range ===
        `bytes ${MIN_CHUNK_SIZE_BYTES}-${2 * MIN_CHUNK_SIZE_BYTES - 1}/${fileSize}`
      ) {
        return resumeIncomplete(`bytes=0-${2 * MIN_CHUNK_SIZE_BYTES - 1}`);
      }
      if (range === `bytes ${2 * MIN_CHUNK_SIZE_BYTES}-${fileSize - 1}/${fileSize}`) {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected Content-Range: ${range}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadPdfResumable({ uploadUrl: "https://storage.example/upload", file });

    const ranges = fetchMock.mock.calls.map(([, init]) => contentRange(init));
    expect(ranges).toEqual([
      `bytes 0-${INITIAL_CHUNK_SIZE_BYTES - 1}/${fileSize}`,
      `bytes */${fileSize}`,
      `bytes 0-${MIN_CHUNK_SIZE_BYTES - 1}/${fileSize}`,
      `bytes ${MIN_CHUNK_SIZE_BYTES}-${2 * MIN_CHUNK_SIZE_BYTES - 1}/${fileSize}`,
      `bytes ${2 * MIN_CHUNK_SIZE_BYTES}-${fileSize - 1}/${fileSize}`,
    ]);
  });

  it("grows to 32 MB after a fast first chunk when nothing has failed", async () => {
    const fileSize = 48 * 1024 * 1024;
    const file = fakeSizedFile(fileSize);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = contentRange(init);
      if (range === `bytes 0-${INITIAL_CHUNK_SIZE_BYTES - 1}/${fileSize}`) {
        return resumeIncomplete(`bytes=0-${INITIAL_CHUNK_SIZE_BYTES - 1}`);
      }
      if (range === `bytes ${INITIAL_CHUNK_SIZE_BYTES}-${fileSize - 1}/${fileSize}`) {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected Content-Range: ${range}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadPdfResumable({ uploadUrl: "https://storage.example/upload", file });

    expect(fetchMock.mock.calls.map(([, init]) => contentRange(init))).toEqual([
      `bytes 0-${INITIAL_CHUNK_SIZE_BYTES - 1}/${fileSize}`,
      `bytes ${INITIAL_CHUNK_SIZE_BYTES}-${fileSize - 1}/${fileSize}`,
    ]);
  });

  it("does not shrink-retry a 400", async () => {
    const file = fakeSizedFile(MIN_CHUNK_SIZE_BYTES);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 400 }))
    );

    await expect(
      uploadPdfResumable({ uploadUrl: "https://storage.example/upload", file })
    ).rejects.toThrow("Upload failed with status 400");
  });

  it("rethrows abort without querying GCS", async () => {
    const file = fakeSizedFile(MIN_CHUNK_SIZE_BYTES);
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      const error = new DOMException("Aborted", "AbortError");
      throw error;
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadPdfResumable({
        uploadUrl: "https://storage.example/upload",
        file,
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function fakeSizedFile(size: number): File {
  const file = new File(["pdf"], "big.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function contentRange(init?: RequestInit): string {
  return new Headers(init?.headers).get("Content-Range") ?? "";
}

function resumeIncomplete(range: string | null): Response {
  return new Response(null, {
    status: 308,
    headers: range ? { Range: range } : undefined,
  });
}
