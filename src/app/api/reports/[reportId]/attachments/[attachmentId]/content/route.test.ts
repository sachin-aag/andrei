import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/require-report-access", () => ({
  requireReportAccess: vi.fn(),
}));

vi.mock("@/lib/storage/attachments", () => ({
  getAttachmentStorage: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";
import { GET } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const attachment = {
  id: "att-1",
  reportId: "report-1",
  filename: "requirements.pdf",
  mimeType: "application/pdf",
  pageCount: 11,
  gcsGeneration: "1",
  permanentObjectKey: "reports/report-1/attachments/att-1/source.pdf",
};

const getSignedReadUrl = vi.fn();
const openObjectReadStream = vi.fn();

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function params() {
  return { params: Promise.resolve({ reportId: "report-1", attachmentId: "att-1" }) };
}

function pdfStream(body = "%PDF-test") {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

describe("GET /api/reports/[reportId]/attachments/[attachmentId]/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(requireReportAccess).mockResolvedValue({
      ok: true,
      user: engineer,
      canView: true,
      canEdit: true,
      canMutateAttachments: true,
      report: { id: "report-1", authorId: engineer.id },
    } as never);
    vi.mocked(getAttachmentStorage).mockReturnValue({
      getSignedReadUrl,
      openObjectReadStream,
    } as never);
    getSignedReadUrl.mockResolvedValue(
      "https://storage.googleapis.com/bucket/file.pdf?X-Goog-Signature=abc"
    );
    openObjectReadStream.mockResolvedValue(pdfStream());
  });

  it("streams inline preview instead of redirecting to GCS", async () => {
    mockSelectOnce([attachment]);

    const response = await GET(
      new Request(
        "http://localhost/api/reports/report-1/attachments/att-1/content?proxy=1&page=1"
      ),
      params()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="requirements.pdf"'
    );
    expect(await response.text()).toBe("%PDF-test");
    expect(openObjectReadStream).toHaveBeenCalledWith(attachment.permanentObjectKey);
    expect(getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("does not redirect even when the iframe omits proxy=1", async () => {
    mockSelectOnce([attachment]);

    const response = await GET(
      new Request(
        "http://localhost/api/reports/report-1/attachments/att-1/content?page=1"
      ),
      params()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline;/);
    expect(getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("redirects downloads to a signed URL", async () => {
    mockSelectOnce([attachment]);

    const response = await GET(
      new Request(
        "http://localhost/api/reports/report-1/attachments/att-1/content?download=1"
      ),
      params()
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "https://storage.googleapis.com/bucket/file.pdf?X-Goog-Signature=abc"
    );
    expect(getSignedReadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: attachment.permanentObjectKey,
        downloadFilename: attachment.filename,
      })
    );
    expect(openObjectReadStream).not.toHaveBeenCalled();
  });
});
