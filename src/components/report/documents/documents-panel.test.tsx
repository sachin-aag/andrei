// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentsPanel } from "./documents-panel";

const useReportAttachmentsMock = vi.fn();

vi.mock("@/providers/report-attachments-provider", () => ({
  useReportAttachments: () => useReportAttachmentsMock(),
}));

vi.mock("@/lib/attachments/load-pdfjs", () => ({
  warmupPdfjsPreview: vi.fn(),
}));

function mockContext(overrides: Record<string, unknown> = {}) {
  useReportAttachmentsMock.mockReturnValue({
    attachments: [],
    folders: [],
    uploadProgress: {},
    canMutateAttachments: true,
    uploadFiles: vi.fn(),
    moveAttachment: vi.fn(),
    moveFolder: vi.fn(),
    ...overrides,
  });
}

function renderPanel() {
  return render(
    <DocumentsPanel
      collapsed={false}
      onToggleCollapse={vi.fn()}
      documentType="investigation_report"
      onJumpToSection={vi.fn()}
    />
  );
}

function actionOrder(): string[] {
  const folder = screen.getByRole("button", { name: "New folder" });
  const upload = screen.getByRole("button", {
    name: "Upload PDF or Word document",
  });
  const spinner = screen.queryByRole("status", { name: "Uploading document" });
  const nodes = [spinner, folder, upload].filter(
    (node): node is HTMLElement => node != null
  );
  return nodes
    .toSorted((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
    .map((node) => {
      if (node === spinner) return "spinner";
      if (node === folder) return "folder";
      return "upload";
    });
}

describe("DocumentsPanel attachment actions", () => {
  it("keeps new-folder then upload when nothing is transferring", () => {
    mockContext();
    renderPanel();

    expect(
      screen.queryByRole("status", { name: "Uploading document" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload PDF or Word document" })
    ).toBeEnabled();
    expect(actionOrder()).toEqual(["folder", "upload"]);
  });

  it("places the spinner left of the folder icon and keeps upload enabled", () => {
    mockContext({
      uploadProgress: {
        "att-1": {
          filename: "Mechanical Test Report.pdf",
          uploadedBytes: 10,
          totalBytes: 100,
          percent: 10,
          lastAdvanceAt: Date.now(),
          bytesPerSecond: null,
        },
      },
    });
    renderPanel();

    const upload = screen.getByRole("button", {
      name: "Upload PDF or Word document",
    });
    expect(upload).toBeEnabled();
    expect(actionOrder()).toEqual(["spinner", "folder", "upload"]);
  });

  it("still opens the file picker while another document is uploading", async () => {
    const user = userEvent.setup();
    mockContext({
      uploadProgress: {
        "att-1": {
          filename: "Mechanical Test Report.pdf",
          uploadedBytes: 10,
          totalBytes: 100,
          percent: 10,
          lastAdvanceAt: Date.now(),
          bytesPerSecond: null,
        },
      },
    });
    renderPanel();

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    await user.click(
      screen.getByRole("button", { name: "Upload PDF or Word document" })
    );
    expect(clickSpy).toHaveBeenCalled();
  });
});
