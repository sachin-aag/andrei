import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { DEMO_PACK, getCustomerPack, MJ_PACK } from "@/lib/customers/packs";
import { POST } from "@/app/api/reports/import-preview/route";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

vi.mock("@/lib/import/docx-upload", () => ({
  readDocxUpload: vi.fn().mockResolvedValue(Buffer.from("docx")),
}));

vi.mock("@/lib/import/docx-to-sections", () => ({
  docxBufferToImportedReportContent: vi.fn().mockResolvedValue({
    header: { deviationNo: "DEV/PK/26/001" },
    sections: {},
    toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
    comments: [],
  }),
}));

vi.mock("@/lib/import/docx-to-generic-document", () => ({
  GenericDocxImportError: class GenericDocxImportError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "GenericDocxImportError";
    }
  },
  docxBufferToGenericDocument: vi.fn().mockResolvedValue({
    narrative: { type: "doc", content: [{ type: "paragraph" }] },
    warnings: [],
  }),
}));

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

function previewRequest() {
  const form = new FormData();
  form.append(
    "file",
    new File(["x"], "report.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );
  return new Request("http://localhost/api/reports/import-preview", {
    method: "POST",
    body: form,
  });
}

describe("/api/reports/import-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
  });

  it("returns 404 when Word import is disabled", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await POST(previewRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Word import is not enabled for this workspace.",
    });
  });

  it("returns the deviation number when the MJ pack is active", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(getCustomerPack).mockReturnValue(MJ_PACK);

    const response = await POST(previewRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deviationNo: "DEV/PK/26/001",
      documentNo: "DEV/PK/26/001",
    });
  });

  it("accepts a generic document Word preview on demo", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const form = new FormData();
    form.append("documentType", "generic_document");
    form.append(
      "file",
      new File(["x"], "memo.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    const response = await POST(
      new Request("http://localhost/api/reports/import-preview", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deviationNo: null,
      documentNo: null,
    });
  });
});
