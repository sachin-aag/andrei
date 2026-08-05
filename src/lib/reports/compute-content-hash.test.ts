import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "@/db";
import {
  assertAttachmentsReadyForSubmission,
  buildAttachmentEvidenceManifestFromRows,
  computeReportContentHash,
} from "./compute-content-hash";

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("attachment evidence manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sorts manifest entries deterministically", () => {
    const rows = [
      {
        id: "att-b",
        filename: "z.pdf",
        sizeBytes: 20,
        sha256: "sha-b",
        gcsGeneration: "2",
        uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "att-a",
        filename: "a.pdf",
        sizeBytes: 10,
        sha256: "sha-a",
        gcsGeneration: "1",
        uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];

    expect(buildAttachmentEvidenceManifestFromRows(rows)).toEqual([
      {
        attachmentId: "att-a",
        filename: "a.pdf",
        sizeBytes: 10,
        sha256: "sha-a",
        gcsGeneration: "1",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        attachmentId: "att-b",
        filename: "z.pdf",
        sizeBytes: 20,
        sha256: "sha-b",
        gcsGeneration: "2",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("changes report content hash when attachment sha changes", async () => {
    mockSelectOnce([{ section: "define", content: { text: "same" } }]);
    mockSelectOnce([
      {
        id: "att-1",
        filename: "source.pdf",
        sizeBytes: 10,
        sha256: "sha-a",
        gcsGeneration: "1",
        uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    const first = await computeReportContentHash("report-1");

    mockSelectOnce([{ section: "define", content: { text: "same" } }]);
    mockSelectOnce([
      {
        id: "att-1",
        filename: "source.pdf",
        sizeBytes: 10,
        sha256: "sha-b",
        gcsGeneration: "1",
        uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    const second = await computeReportContentHash("report-1");

    expect(first).not.toBe(second);
  });

  it("rejects active non-ready attachments before submission", async () => {
    mockSelectOnce([
      {
        id: "att-1",
        filename: "source.pdf",
        processingStatus: "processing",
      },
    ]);

    await expect(assertAttachmentsReadyForSubmission("report-1")).resolves.toEqual({
      ok: false,
      message:
        "All active attachments must finish processing before this report can be submitted.",
      attachments: [
        {
          attachmentId: "att-1",
          filename: "source.pdf",
          processingStatus: "processing",
        },
      ],
    });
  });
});
