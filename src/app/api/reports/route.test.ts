import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { DUPLICATE_DOCUMENT_NO_ERROR } from "@/lib/reports/document-no";
import { GET, POST } from "@/app/api/reports/route";

vi.mock("@/db", () => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(() => {
      throw new Error("No transactions support in neon-http driver");
    }),
  };
  return { db };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/document-no", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/document-no")>();
  return {
    ...actual,
    isDocumentNoTaken: vi.fn(),
  };
});

vi.mock("@/lib/audit", () => ({
  auditActorFromUser: vi.fn((user: { id: string; name: string; role: string }) => ({
    id: user.id,
    name: user.name,
    role: user.role,
  })),
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
  recordSectionVersion: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

vi.mock("@/lib/reports/persist-source-docx", () => ({
  persistReportSourceDocx: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/reports/persist-imported-word-comments", () => ({
  persistImportedWordComments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/import/docx-upload", () => ({
  readDocxUpload: vi.fn().mockResolvedValue(Buffer.from("docx")),
}));

vi.mock("@/lib/import/docx-to-sections", () => ({
  docxBufferToImportedReportContent: vi.fn(),
}));

vi.mock("@/lib/import/docx-to-generic-document", () => ({
  GenericDocxImportError: class GenericDocxImportError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "GenericDocxImportError";
    }
  },
  docxBufferToGenericDocument: vi.fn(),
}));

vi.mock("@/lib/reports/ensure-hidden-expert-reviewer", () => ({
  assignedManagerIdsWithHiddenExpert: vi.fn(async (ids: string[]) => ids),
  assignHiddenExpertReviewerToReport: vi.fn(),
  assignHiddenExpertReviewerToAllReports: vi.fn(),
  ensureHiddenExpertReviewer: vi.fn(),
}));

import { db } from "@/db";
import { isDocumentNoTaken } from "@/lib/reports/document-no";
import {
  CONVERGENT_PACK,
  DEMO_PACK,
  getCustomerPack,
  MJ_PACK,
} from "@/lib/customers/packs";
import { persistReportSourceDocx } from "@/lib/reports/persist-source-docx";
import { persistImportedWordComments } from "@/lib/reports/persist-imported-word-comments";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { docxBufferToGenericDocument } from "@/lib/import/docx-to-generic-document";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import { assignedManagerIdsWithHiddenExpert } from "@/lib/reports/ensure-hidden-expert-reviewer";

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
      documentType: "investigation_report",
      documentNo: "DEV-001",
      authorId: engineer.id,
      status: "draft",
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as never);
  return { returning, values };
}

function mockSectionRowsSelect(reportId: string) {
  const where = vi.fn().mockResolvedValueOnce(
    REPORT_SECTION_ROW_ORDER.map((section, index) => ({
      id: `section-${index}`,
      reportId,
      section,
      content: EMPTY_CONTENT[section],
    }))
  );
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockManagerValidation(managerIds: string[]) {
  for (let i = 0; i < 2; i++) {
    const where = vi.fn().mockResolvedValueOnce(
      managerIds.map((id) => ({ id }))
    );
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValueOnce({ from } as never);
  }
}

describe("/api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
    vi.mocked(assignedManagerIdsWithHiddenExpert).mockImplementation(
      async (ids: readonly string[]) => [...ids]
    );
  });

  it("requires authentication for listing reports", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("does not list report queues for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      title: "Admin",
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
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
    vi.mocked(isDocumentNoTaken).mockResolvedValueOnce(true);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: DUPLICATE_DOCUMENT_NO_ERROR,
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("checks duplicates using the user-entered deviation number", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Quality Engineer",
    });
    vi.mocked(isDocumentNoTaken).mockResolvedValueOnce(true);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "dev pr 24 016" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(isDocumentNoTaken).toHaveBeenCalledWith(
      "dev pr 24 016",
      "engineer-1",
      "investigation_report"
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a report from JSON payload", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDocumentNoTaken).mockResolvedValueOnce(false);
    mockSuccessfulCreate();
    mockSectionRowsSelect("report-1");

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("creates a mechanical DV report from JSON payload", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    vi.mocked(isDocumentNoTaken).mockResolvedValueOnce(false);
    const { values } = mockSuccessfulCreate("report-mechanical");
    mockSectionRowsSelect("report-mechanical");

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "mechanical_design_verification",
          documentNo: "dvr abcde",
          assignedManagerIds: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        documentType: "mechanical_design_verification",
        documentNo: "dvr abcde",
      })
    );
    expect(isDocumentNoTaken).toHaveBeenCalledWith(
      "dvr abcde",
      engineer.id,
      "mechanical_design_verification"
    );
  });

  it("rejects an unknown document type as an invalid payload", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "not_a_real_type",
          documentNo: "dvr abcde",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a report with multiple assigned managers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDocumentNoTaken).mockResolvedValueOnce(false);
    mockManagerValidation(["manager-1", "manager-2"]);
    const { values } = mockSuccessfulCreate("report-multi-manager");
    mockSectionRowsSelect("report-multi-manager");

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({
          documentType: "investigation_report",
          documentNo: "DEV-001",
          assignedManagerIds: ["manager-1", "manager-2"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ assignedManagerId: "manager-1" })
    );
    expect(values).toHaveBeenNthCalledWith(2, [
      { reportId: "report-multi-manager", managerId: "manager-1", sortOrder: 0 },
      { reportId: "report-multi-manager", managerId: "manager-2", sortOrder: 1 },
    ]);
    await expect(response.json()).resolves.toMatchObject({
      report: { assignedManagerIds: ["manager-1", "manager-2"] },
    });
    expect(assignedManagerIdsWithHiddenExpert).toHaveBeenCalledWith([
      "manager-1",
      "manager-2",
    ]);
  });

  it("rejects a Word upload when the demo pack disables import", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const form = new FormData();
    form.append("documentNo", "DEV-001");
    form.append(
      "file",
      new File(["x"], "report.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Word import is not enabled for this workspace.",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a generic document from a Word upload on demo", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDocumentNoTaken).mockResolvedValueOnce(false);
    vi.mocked(docxBufferToGenericDocument).mockResolvedValueOnce({
      narrative: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Protocol" }],
          },
        ],
      },
      warnings: [
        "Headers and footers were omitted. Export uses the Andrei document template header.",
      ],
    });
    const { values } = mockSuccessfulCreate("report-generic");
    mockSectionRowsSelect("report-generic");

    const form = new FormData();
    form.append("documentType", "generic_document");
    form.append("documentNo", "DOC-001");
    form.append(
      "file",
      new File(["x"], "memo.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(200);
    expect(values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        documentType: "generic_document",
        documentNo: "DOC-001",
        metadata: expect.objectContaining({
          importedFromFilename: "memo.docx",
        }),
      })
    );
    expect(persistImportedWordComments).not.toHaveBeenCalled();
    expect(persistReportSourceDocx).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: "report-generic",
        filename: "memo.docx",
        uploadedById: engineer.id,
      })
    );
  });

  it("creates an investigation from a Word upload when the MJ pack is active", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(getCustomerPack).mockReturnValue(MJ_PACK);
    vi.mocked(isDocumentNoTaken).mockResolvedValueOnce(false);
    vi.mocked(docxBufferToImportedReportContent).mockResolvedValueOnce({
      sections: EMPTY_CONTENT,
      toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
      header: { otherTools: "fishbone", deviationNo: "DEV-001" },
      comments: [],
    });
    const { values } = mockSuccessfulCreate("report-imported");
    mockSectionRowsSelect("report-imported");

    const form = new FormData();
    form.append("documentType", "investigation_report");
    form.append("documentNo", "DEV-001");
    form.append(
      "file",
      new File(["x"], "report.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(200);
    expect(values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        documentNo: "DEV-001",
        metadata: {
          toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
          otherTools: "fishbone",
        },
      })
    );
    expect(persistImportedWordComments).toHaveBeenCalledWith(
      "report-imported",
      expect.objectContaining({ toolsUsed: expect.objectContaining({ sixM: true }) })
    );
    expect(persistReportSourceDocx).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: "report-imported",
        filename: "report.docx",
        uploadedById: engineer.id,
      })
    );
  });

  it("rejects a Word upload for design verification", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(getCustomerPack).mockReturnValue({
      ...MJ_PACK,
      enabledDocumentTypes: ["investigation_report", "design_verification"],
    });

    const form = new FormData();
    form.append("documentType", "design_verification");
    form.append("documentNo", "DVR-001");
    form.append(
      "file",
      new File(["x"], "report.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Word import is not supported for this document type.",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
