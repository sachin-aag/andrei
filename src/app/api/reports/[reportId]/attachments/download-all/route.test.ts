import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/require-report-access", () => ({
  requireReportAccess: vi.fn(),
}));

vi.mock("@/lib/attachments/download-all-zip", () => ({
  loadAttachmentsDownloadZip: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { loadAttachmentsDownloadZip } from "@/lib/attachments/download-all-zip";
import { GET } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

function params() {
  return { params: Promise.resolve({ reportId: "report-1" }) };
}

describe("GET /api/reports/[reportId]/attachments/download-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
  });

  it("returns 401 when the viewer has no session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    vi.mocked(requireReportAccess).mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    const response = await GET(
      new Request("http://localhost/api/reports/report-1/attachments/download-all"),
      params()
    );

    expect(response.status).toBe(401);
    expect(loadAttachmentsDownloadZip).not.toHaveBeenCalled();
  });

  it("returns 403 when the user cannot view the report", async () => {
    vi.mocked(requireReportAccess).mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Forbidden",
    });

    const response = await GET(
      new Request("http://localhost/api/reports/report-1/attachments/download-all"),
      params()
    );

    expect(response.status).toBe(403);
    expect(loadAttachmentsDownloadZip).not.toHaveBeenCalled();
  });

  it("returns 404 when nothing is ready to download", async () => {
    vi.mocked(requireReportAccess).mockResolvedValueOnce({
      ok: true,
      user: engineer,
      canView: true,
      canEdit: true,
      canMutateAttachments: true,
      report: { id: "report-1", documentNo: "DEV-001" },
    } as never);
    vi.mocked(loadAttachmentsDownloadZip).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/reports/report-1/attachments/download-all"),
      params()
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "No documents are ready to download",
    });
  });

  it("streams a zip for viewers who can open the report", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("PK"));
        controller.close();
      },
    });
    vi.mocked(requireReportAccess).mockResolvedValueOnce({
      ok: true,
      user: engineer,
      canView: true,
      canEdit: false,
      canMutateAttachments: false,
      report: { id: "report-1", documentNo: "DEV-001" },
    } as never);
    vi.mocked(loadAttachmentsDownloadZip).mockResolvedValueOnce({
      stream,
      filename: "Attachments_DEV-001.zip",
    });

    const response = await GET(
      new Request("http://localhost/api/reports/report-1/attachments/download-all"),
      params()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Attachments_DEV-001.zip"'
    );
    expect(loadAttachmentsDownloadZip).toHaveBeenCalledWith(
      "report-1",
      "DEV-001"
    );
    expect(await response.text()).toBe("PK");
  });
});
