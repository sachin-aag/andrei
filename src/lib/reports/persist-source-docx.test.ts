import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistReportSourceDocx } from "@/lib/reports/persist-source-docx";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
  },
}));

import { db } from "@/db";

describe("persistReportSourceDocx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts metadata and bytea payload with sha256", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const buffer = Buffer.from("fake-docx-bytes");
    await persistReportSourceDocx({
      reportId: "report-1",
      buffer,
      filename: "Investigation.docx",
      uploadedById: "engineer-1",
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith({
      reportId: "report-1",
      filename: "Investigation.docx",
      sizeBytes: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      data: buffer,
      uploadedById: "engineer-1",
    });
  });
});
