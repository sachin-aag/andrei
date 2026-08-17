// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttachmentViewer } from "@/components/report/attachment-viewer";

const useReportAttachmentsMock = vi.fn();

vi.mock("@/providers/report-attachments-provider", () => ({
  useReportAttachments: () => useReportAttachmentsMock(),
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
  it("allows downloads in the sandboxed PDF iframe so Chromium fallback-download does not get blocked", () => {
    mockContext();

    render(<AttachmentViewer />);

    const iframe = screen.getByTitle("Attachment_IV_Preparation_Record.pdf");
    expect(iframe.getAttribute("sandbox")).toContain("allow-downloads");
    expect(iframe.getAttribute("src")).toContain("proxy=1");
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

  it("does not render a preview iframe until the attachment has a page count", () => {
    mockContext({
      activeAttachment: baseAttachment({ pageCount: null, processingStatus: "processing" }),
    });

    render(<AttachmentViewer />);

    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Upload is still finishing/)
    ).toBeInTheDocument();
  });
});
