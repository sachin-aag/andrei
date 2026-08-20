import { describe, expect, it } from "vitest";
import {
  chunkCellCount,
  describeUploadTape,
  formatFileSize,
  formatTimeRemaining,
  formatTransferRate,
  isLargeUpload,
  readingCellCount,
  LARGE_UPLOAD_THRESHOLD_BYTES,
  UPLOAD_STALL_AFTER_MS,
  type UploadTapeInput,
} from "./large-upload";

const MB = 1024 * 1024;
const NOW = 1_700_000_000_000;

function input(overrides: Partial<UploadTapeInput> = {}): UploadTapeInput {
  return {
    status: "uploading",
    sizeBytes: 96 * MB,
    transfer: null,
    processingProgress: 0,
    processingPage: null,
    pageCount: null,
    nowMs: NOW,
    ...overrides,
  };
}

describe("isLargeUpload", () => {
  it("only treats files past the threshold as large", () => {
    expect(isLargeUpload(LARGE_UPLOAD_THRESHOLD_BYTES)).toBe(false);
    expect(isLargeUpload(LARGE_UPLOAD_THRESHOLD_BYTES + 1)).toBe(true);
    expect(isLargeUpload(10 * MB)).toBe(false);
    expect(isLargeUpload(Number.NaN)).toBe(false);
  });
});

describe("chunkCellCount", () => {
  it("draws one cell per 8 MB of acknowledged bytes", () => {
    expect(chunkCellCount(96 * MB)).toBe(12);
    expect(chunkCellCount(51 * MB)).toBe(7);
    expect(chunkCellCount(150 * MB)).toBe(19);
  });

  it("stays at one cell for degenerate sizes", () => {
    expect(chunkCellCount(0)).toBe(1);
    expect(chunkCellCount(-5)).toBe(1);
  });

  it("stays 1:1 with chunks across the whole allowed file range", () => {
    // 250 MB is the current per-file cap; 256 MB is where the layout cap bites.
    expect(chunkCellCount(224.7 * MB)).toBe(29);
    expect(chunkCellCount(250 * MB)).toBe(32);
  });

  it("caps the count so the band still fits the panel", () => {
    expect(chunkCellCount(4000 * MB)).toBe(32);
  });
});

describe("readingCellCount", () => {
  it("subdivides finer than the chunk grain for long documents", () => {
    expect(readingCellCount(340)).toBe(36);
    expect(readingCellCount(340)).toBeGreaterThan(chunkCellCount(96 * MB));
  });

  it("matches the page count for short documents", () => {
    expect(readingCellCount(12)).toBe(12);
  });

  it("keeps a floor so a 2-page document still reads as a band", () => {
    expect(readingCellCount(2)).toBe(6);
  });

  it("falls back when the page total is not known yet", () => {
    expect(readingCellCount(null)).toBe(24);
  });
});

describe("describeUploadTape — uploading", () => {
  it("inks a cell only once that chunk has fully landed", () => {
    const view = describeUploadTape(
      input({
        transfer: {
          uploadedBytes: 40 * MB,
          bytesPerSecond: 8 * MB,
          lastAdvanceAt: NOW,
        },
      })
    );
    expect(view?.phase).toBe("uploading");
    expect(view?.cellCount).toBe(12);
    expect(view?.filledCells).toBe(5);
    expect(view?.headCell).toBe(5);
  });

  it("tracks a 224.7 MB file one chunk at a time", () => {
    const size = 224.7 * MB;
    const view = describeUploadTape(
      input({
        sizeBytes: size,
        transfer: { uploadedBytes: 96 * MB, bytesPerSecond: 8 * MB, lastAdvanceAt: NOW },
      })
    );
    expect(view?.line).toBe("Uploading 224.7 MB");
    expect(view?.cellCount).toBe(29);
    expect(view?.filledCells).toBe(12);
  });

  it("never reads full while bytes are still going, even past the cell cap", () => {
    const size = 400 * MB;
    const view = describeUploadTape(
      input({
        sizeBytes: size,
        // Exactly the layout cap's worth of chunks has landed, but the file is
        // only two thirds sent — the tape must not look finished.
        transfer: { uploadedBytes: 256 * MB, bytesPerSecond: 8 * MB, lastAdvanceAt: NOW },
      })
    );
    expect(view?.cellCount).toBe(32);
    expect(view?.filledCells).toBeLessThan(32);
    expect(view?.headCell).not.toBeNull();
    expect(view?.filledCells).toBe(20);
  });

  it("names the file size and counts down from the measured rate", () => {
    const view = describeUploadTape(
      input({
        transfer: {
          uploadedBytes: 48 * MB,
          bytesPerSecond: 8 * MB,
          lastAdvanceAt: NOW,
        },
      })
    );
    expect(view?.line).toBe("Uploading 96.0 MB");
    expect(view?.figure).toBe("6s left");
  });

  it("decays the estimate between chunk arrivals", () => {
    const transfer = {
      uploadedBytes: 48 * MB,
      bytesPerSecond: 8 * MB,
      lastAdvanceAt: NOW - 4000,
    };
    expect(describeUploadTape(input({ transfer }))?.figure).toBe("2s left");
  });

  it("shows a percentage until a rate has been measured", () => {
    const view = describeUploadTape(
      input({
        transfer: { uploadedBytes: 24 * MB, bytesPerSecond: null, lastAdvanceAt: NOW },
      })
    );
    expect(view?.figure).toBe("25%");
  });

  it("never claims it is almost done while a quarter of the bytes remain", () => {
    const view = describeUploadTape(
      input({
        transfer: {
          uploadedBytes: 72 * MB,
          // 24 MB left at 8 MB/s is a 3s estimate, already 5s stale — but not
          // yet stale enough to count as a stall.
          bytesPerSecond: 8 * MB,
          lastAdvanceAt: NOW - 5_000,
        },
      })
    );
    expect(view?.phase).toBe("uploading");
    expect(view?.figure).toBe("75%");
  });

  it("says almost done only once the bytes agree", () => {
    const view = describeUploadTape(
      input({
        transfer: {
          uploadedBytes: 95 * MB,
          bytesPerSecond: 8 * MB,
          lastAdvanceAt: NOW - 5_000,
        },
      })
    );
    expect(view?.figure).toBe("Almost done");
  });

  it("says the connection is slow once the bytes stop advancing", () => {
    const view = describeUploadTape(
      input({
        transfer: {
          uploadedBytes: 40 * MB,
          bytesPerSecond: 8 * MB,
          lastAdvanceAt: NOW - UPLOAD_STALL_AFTER_MS,
        },
      })
    );
    expect(view?.phase).toBe("stalled");
    expect(view?.line).toBe("Slow connection");
    expect(view?.figure).toBe("40.0 MB uploaded");
    // The detail the short line drops still reaches the tooltip and SR users.
    expect(view?.ariaLabel).toContain("40.0 MB of 96.0 MB uploaded");
  });

  it("keeps both halves of the line short enough for the panel", () => {
    const views = [
      describeUploadTape(
        input({
          transfer: { uploadedBytes: 40 * MB, bytesPerSecond: 8 * MB, lastAdvanceAt: NOW },
        })
      ),
      describeUploadTape(
        input({
          transfer: {
            uploadedBytes: 40 * MB,
            bytesPerSecond: 8 * MB,
            lastAdvanceAt: NOW - UPLOAD_STALL_AFTER_MS,
          },
        })
      ),
      describeUploadTape(input({ status: "validating" })),
      describeUploadTape(input({ status: "queued" })),
      describeUploadTape(
        input({ status: "processing", processingPage: 170, pageCount: 340 })
      ),
    ];
    for (const view of views) {
      expect(`${view?.line}${view?.figure}`.length).toBeLessThanOrEqual(36);
    }
  });

  it("does not call a finished transfer stalled", () => {
    const view = describeUploadTape(
      input({
        transfer: {
          uploadedBytes: 96 * MB,
          bytesPerSecond: 8 * MB,
          lastAdvanceAt: NOW - 60_000,
        },
      })
    );
    expect(view?.phase).toBe("uploading");
    expect(view?.filledCells).toBe(12);
    expect(view?.headCell).toBeNull();
  });

  it("falls back to the server percentage in a tab that is not uploading", () => {
    const view = describeUploadTape(input({ transfer: null, processingProgress: 50 }));
    expect(view?.phase).toBe("uploading");
    expect(view?.filledCells).toBe(6);
    expect(view?.figure).toBe("50%");
  });

  it("stays static before the client clock starts, so SSR matches hydration", () => {
    const transfer = {
      uploadedBytes: 40 * MB,
      bytesPerSecond: 8 * MB,
      lastAdvanceAt: NOW - 60_000,
    };
    const view = describeUploadTape(input({ transfer, nowMs: 0 }));
    expect(view?.phase).toBe("uploading");
  });
});

describe("describeUploadTape — holding and reading", () => {
  it("holds the tape full while the server checks the file", () => {
    const view = describeUploadTape(input({ status: "validating" }));
    expect(view?.phase).toBe("checking");
    expect(view?.line).toBe("Checking the file");
    expect(view?.filledCells).toBe(view?.cellCount);
    expect(view?.headCell).toBeNull();
    expect(view?.figure).toBe("");
  });

  it("explains the queue rather than showing a bare status word", () => {
    expect(describeUploadTape(input({ status: "queued" }))?.line).toBe(
      "Waiting to start reading"
    );
  });

  it("counts pages once reading begins", () => {
    const view = describeUploadTape(
      input({
        status: "processing",
        // The pipeline percentage for page 170 of 340: 10 + 0.5 * 60.
        processingProgress: 40,
        processingPage: 170,
        pageCount: 340,
      })
    );
    expect(view?.phase).toBe("reading");
    expect(view?.line).toBe("Reading page 170 of 340");
    expect(view?.figure).toBe("50%");
    expect(view?.cellCount).toBe(36);
    expect(view?.filledCells).toBe(18);
  });

  it("agrees with the page number instead of the pipeline percentage", () => {
    // Page 270 of 300 is 90% of the pages, but only ~64% of the whole run.
    // Showing 60% next to "page 270 of 300" is the contradiction being fixed.
    const view = describeUploadTape(
      input({
        status: "processing",
        processingProgress: 64,
        processingPage: 270,
        pageCount: 300,
      })
    );
    expect(view?.line).toBe("Reading page 270 of 300");
    expect(view?.figure).toBe("90%");
    expect(view?.percent).toBeCloseTo(90);
  });

  it("derives progress from the page number before a percentage arrives", () => {
    const view = describeUploadTape(
      input({
        status: "processing",
        processingProgress: 0,
        processingPage: 34,
        pageCount: 340,
      })
    );
    expect(view?.percent).toBeCloseTo(10);
  });

  it("rescales the extraction band before the first page number lands", () => {
    // Halfway through the 10-70 extraction band is halfway through the pages.
    const view = describeUploadTape(
      input({ status: "processing", processingProgress: 40, processingPage: null })
    );
    expect(view?.percent).toBeCloseTo(50);
    expect(view?.line).toBe("Reading the document");
  });

  it("switches to indexing once every page has been read", () => {
    const view = describeUploadTape(
      input({
        status: "processing",
        processingProgress: 80,
        // Still set to the last page seen — the row must not keep counting it.
        processingPage: 300,
        pageCount: 300,
      })
    );
    expect(view?.phase).toBe("indexing");
    expect(view?.line).toBe("Making it searchable");
    expect(view?.figure).toBe("");
    expect(view?.filledCells).toBe(view?.cellCount);
    expect(view?.headCell).toBeNull();
    expect(view?.ariaLabel).toContain("All 300 pages read");
  });

  it("stays in indexing through chunking and embedding", () => {
    expect(
      describeUploadTape(
        input({ status: "processing", processingProgress: 90, processingPage: 300, pageCount: 300 })
      )?.phase
    ).toBe("indexing");
  });

  it("drops the page total when it is not known yet", () => {
    const view = describeUploadTape(
      input({ status: "processing", processingPage: 3, pageCount: null })
    );
    expect(view?.line).toBe("Reading page 3");
  });

  it("falls back when no page is reported", () => {
    const view = describeUploadTape(input({ status: "processing" }));
    expect(view?.line).toBe("Reading the document");
  });

  it("returns nothing for terminal states", () => {
    expect(describeUploadTape(input({ status: "ready" }))).toBeNull();
    expect(describeUploadTape(input({ status: "failed" }))).toBeNull();
  });
});

describe("formatters", () => {
  it("formats sizes at the precision each unit deserves", () => {
    expect(formatFileSize(96.4 * MB)).toBe("96.4 MB");
    expect(formatFileSize(2.5 * 1024 * MB)).toBe("2.50 GB");
    expect(formatFileSize(400 * 1024)).toBe("400 KB");
    expect(formatFileSize(0)).toBe("0 MB");
  });

  it("formats rates", () => {
    expect(formatTransferRate(11.2 * MB)).toBe("11.2 MB/s");
    expect(formatTransferRate(400 * 1024)).toBe("400 KB/s");
    expect(formatTransferRate(0)).toBe("0 MB/s");
  });

  it("never counts down to zero seconds", () => {
    expect(formatTimeRemaining(0)).toBe("");
    expect(formatTimeRemaining(-3)).toBe("");
    // Floors at one second rather than showing a dead "0s left".
    expect(formatTimeRemaining(0.4)).toBe("1s left");
    expect(formatTimeRemaining(1.2)).toBe("1s left");
    expect(formatTimeRemaining(38)).toBe("38s left");
    expect(formatTimeRemaining(134)).toBe("2:14 left");
    expect(formatTimeRemaining(4000)).toBe("over an hour left");
  });
});
