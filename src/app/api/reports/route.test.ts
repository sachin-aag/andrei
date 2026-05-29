import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { DUPLICATE_DEVIATION_NO_ERROR } from "@/lib/reports/deviation-no";
import { GET, POST } from "@/app/api/reports/route";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/deviation-no", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/deviation-no")>();
  return {
    ...actual,
    isDeviationNoTaken: vi.fn(),
  };
});

vi.mock("@/lib/import/docx-upload", () => ({
  readDocxUpload: vi.fn(),
}));

vi.mock("@/lib/import/docx-to-sections", () => ({
  docxBufferToImportedReportContent: vi.fn(),
}));

vi.mock("@/lib/reports/persist-source-docx", () => ({
  persistReportSourceDocx: vi.fn(),
}));

import { db } from "@/db";
import { isDeviationNoTaken } from "@/lib/reports/deviation-no";
import { readDocxUpload } from "@/lib/import/docx-upload";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { persistReportSourceDocx } from "@/lib/reports/persist-source-docx";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

function mockSuccessfulCreate(reportId = "report-1") {
  const returning = vi.fn().mockResolvedValue([
    {
      id: reportId,
      deviationNo: "DEV-001",
      authorId: engineer.id,
      status: "draft",
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as never);
  return { returning, values };
}

describe("/api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for listing reports", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("requires authentication for report creation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("prevents managers from creating reports", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "manager-1",
      name: "Manager",
      email: "manager@example.com",
      role: "manager",
      title: "QA Manager",
    });

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only engineers can create reports",
    });
  });

  it("rejects duplicate deviation numbers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Quality Engineer",
    });
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(true);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: DUPLICATE_DEVIATION_NO_ERROR,
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("checks duplicates using the user-entered deviation number, not only the docx header", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Quality Engineer",
    });
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(true);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "dev pr 24 016" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(isDeviationNoTaken).toHaveBeenCalledWith("dev pr 24 016", "engineer-1");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a report without persisting source docx when no file is uploaded", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(false);
    mockSuccessfulCreate();

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(persistReportSourceDocx).not.toHaveBeenCalled();
  });

  it("persists the uploaded source docx after creating the report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(false);
    mockSuccessfulCreate("report-with-file");

    const buffer = Buffer.from("docx-bytes");
    vi.mocked(readDocxUpload).mockResolvedValueOnce(buffer);
    vi.mocked(docxBufferToImportedReportContent).mockResolvedValueOnce({
      header: {},
      toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
      sections: Object.fromEntries(
        REPORT_SECTION_ROW_ORDER.map((section) => [section, EMPTY_CONTENT[section]]),
      ),
      comments: [],
    } as never);
    vi.mocked(persistReportSourceDocx).mockResolvedValueOnce(undefined);

    const form = new FormData();
    form.set("deviationNo", "DEV-001");
    form.set("assignedManagerId", "");
    form.set("file", new File([buffer], "Investigation.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(200);
    expect(persistReportSourceDocx).toHaveBeenCalledWith({
      reportId: "report-with-file",
      buffer,
      filename: "Investigation.docx",
      uploadedById: engineer.id,
    });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("rolls back the report when source docx persistence fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(false);
    mockSuccessfulCreate("report-rollback");

    const buffer = Buffer.from("docx-bytes");
    vi.mocked(readDocxUpload).mockResolvedValueOnce(buffer);
    vi.mocked(docxBufferToImportedReportContent).mockResolvedValueOnce({
      header: {},
      toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
      sections: Object.fromEntries(
        REPORT_SECTION_ROW_ORDER.map((section) => [section, EMPTY_CONTENT[section]]),
      ),
      comments: [],
    } as never);
    vi.mocked(persistReportSourceDocx).mockRejectedValueOnce(new Error("storage failed"));

    const where = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({ where } as never);

    const form = new FormData();
    form.set("deviationNo", "DEV-001");
    form.set("file", new File([buffer], "Investigation.docx"));

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(500);
    expect(db.delete).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "Could not save the uploaded file. Please try again.",
    });
  });
});
