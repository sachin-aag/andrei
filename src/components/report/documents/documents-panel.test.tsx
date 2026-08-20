// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentsPanel } from "./documents-panel";

const useReportAttachmentsMock = vi.fn();

vi.mock("@/providers/report-attachments-provider", () => ({
  useReportAttachments: () => useReportAttachmentsMock(),
}));

function storedAttachment() {
  return {
    id: "att-1",
    reportId: "report-1",
    folderId: null,
    filename: "coa.pdf",
    description: null,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    pageCount: 1,
    processingStatus: "ready",
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function mockContext(overrides: Record<string, unknown> = {}) {
  useReportAttachmentsMock.mockReturnValue({
    reportId: "report-1",
    attachments: [],
    folders: [],
    canMutateAttachments: true,
    uploadFiles: vi.fn(),
    uploadProgress: {},
    activeAttachmentId: null,
    openDocument: vi.fn(),
    removeAttachment: vi.fn(),
    retryAttachment: vi.fn(),
    renameAttachment: vi.fn(),
    updateAttachmentDescription: vi.fn(),
    moveAttachment: vi.fn(),
    moveFolder: vi.fn(),
    createFolder: vi.fn(),
    ...overrides,
  });
}

describe("DocumentsPanel download all", () => {
  it("disables Download all when no stored documents exist", () => {
    mockContext();
    render(
      <DocumentsPanel collapsed={false} onToggleCollapse={() => undefined} />
    );

    expect(
      screen.getByRole("button", { name: /download all documents/i })
    ).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: /download all documents/i })
    ).not.toBeInTheDocument();
  });

  it("links Download all to the zip route once a file is stored", () => {
    mockContext({ attachments: [storedAttachment()] });
    render(
      <DocumentsPanel collapsed={false} onToggleCollapse={() => undefined} />
    );

    expect(
      screen.getByRole("link", { name: /download all documents/i })
    ).toHaveAttribute(
      "href",
      "/api/reports/report-1/attachments/download-all"
    );
  });

  it("still offers Download all when the viewer cannot upload", () => {
    mockContext({
      canMutateAttachments: false,
      attachments: [storedAttachment()],
    });
    render(
      <DocumentsPanel collapsed={false} onToggleCollapse={() => undefined} />
    );

    expect(
      screen.getByRole("link", { name: /download all documents/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /upload pdf or word document/i })
    ).not.toBeInTheDocument();
  });
});
