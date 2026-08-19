// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttachmentViewer } from "@/components/report/attachment-viewer";

const useReportAttachmentsMock = vi.fn();

vi.mock("@/providers/report-attachments-provider", () => ({
  useReportAttachments: () => useReportAttachmentsMock(),
}));

vi.mock("@/components/report/pdf-page-preview", () => ({
  PdfPagePreview: ({ title, page }: { title: string; page: number }) => (
    <img alt={`${title}, page ${page}`} src="data:image/png;base64,abc" />
  ),
}));

function baseAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    filename: "Attachment_IV_Preparation_Record.pdf",
    mimeType: "application/pdf",
    pageCount: 2,
    processingStatus: "ready",
    description: null,
    ...overrides,
  };
}

function mockContext(overrides: Record<string, unknown> = {}) {
  useReportAttachmentsMock.mockReturnValue({
    activeAttachment: baseAttachment(),
    activePage: 1,
    closeDocument: vi.fn(),
    reportId: "report-1",
    ...overrides,
  });
}

describe("AttachmentViewer", () => {
  it("renders PDFs as an image preview, not an iframe", () => {
    mockContext();

    render(<AttachmentViewer />);

    expect(screen.queryByTitle("Attachment_IV_Preparation_Record.pdf")).not.toBeInTheDocument();
    expect(
      screen.getByAltText("Attachment_IV_Preparation_Record.pdf, page 1")
    ).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("does not grant script or download access to the sandboxed DOCX preview", () => {
    mockContext({
      activeAttachment: baseAttachment({
        filename: "Report.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    });

    render(<AttachmentViewer />);

    const iframe = screen.getByTitle("Report.docx");
    const sandbox = iframe.getAttribute("sandbox") ?? "";
    expect(sandbox).not.toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-downloads");
  });

  it("does not render a preview until the attachment has a page count", () => {
    mockContext({
      activeAttachment: baseAttachment({ pageCount: null, processingStatus: "processing" }),
    });

    render(<AttachmentViewer />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/Upload is still finishing/)).toBeInTheDocument();
  });
});
