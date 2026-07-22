import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/attachments/route-helpers", () => ({
  requireReportAttachmentAccess: vi.fn(),
}));

vi.mock("@/lib/storage/gcs", () => ({
  readObjectStream: vi.fn(),
}));

import { db } from "@/db";
import { requireReportAttachmentAccess } from "@/lib/attachments/route-helpers";
import { readObjectStream } from "@/lib/storage/gcs";
import { GET } from "./route";

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("GET /api/reports/[reportId]/attachments/[attachmentId]/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireReportAttachmentAccess).mockResolvedValue({
      user: { id: "user-1" },
      report: { id: "report-1" },
    } as never);
  });

  it("serves attachments as PDFs even when stored metadata has a hostile MIME type", async () => {
    mockSelectOnce([
      {
        id: "attachment-1",
        reportId: "report-1",
        filename: 'evil"\r\n.pdf',
        mimeType: "text/html",
        gcsObjectKey: "reports/report-1/attachments/attachment-1/evil.pdf",
      },
    ]);
    vi.mocked(readObjectStream).mockReturnValue(
      Readable.from(["<script>alert(1)</script>"])
    );

    const response = (await GET(
      new Request(
        "http://localhost/api/reports/report-1/attachments/attachment-1/content"
      ),
      {
        params: Promise.resolve({
          reportId: "report-1",
          attachmentId: "attachment-1",
        }),
      }
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="evil.pdf"'
    );
  });
});
