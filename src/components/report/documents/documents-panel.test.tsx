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
    isWorkspaceAdmin: false,
    uploadFiles: vi.fn(),
    linkFromLibrary: vi.fn(),
    moveAttachment: vi.fn(),
    moveFolder: vi.fn(),
    ...overrides,
  });
}

async function openUploadMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add attachment" }));
  await user.click(screen.getByRole("menuitem", { name: "Upload new" }));
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
  const upload = screen.getByRole("button", { name: "Add attachment" });
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
    expect(screen.getByRole("button", { name: "Add attachment" })).toBeEnabled();
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

    const upload = screen.getByRole("button", { name: "Add attachment" });
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

    await openUploadMenu(user);
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe("DocumentsPanel Contents tab", () => {
  it("always shows Attachments | Contents with folder and upload on a second row", () => {
    mockContext();
    renderPanel();

    const attachments = screen.getByRole("button", { name: "Attachments" });
    const contents = screen.getByRole("button", { name: "Contents" });
    const folder = screen.getByRole("button", { name: "New folder" });
    expect(attachments).toHaveAttribute("aria-pressed", "true");
    expect(contents).toHaveAttribute("aria-pressed", "false");
    expect(contents.closest("div")).not.toContainElement(folder);
  });

  it("hides folder and upload while Contents is selected", async () => {
    const user = userEvent.setup();
    mockContext();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Contents" }));
    expect(
      screen.queryByRole("button", { name: "New folder" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add attachment" })
    ).not.toBeInTheDocument();
  });

  it("shows a Contents tab that jumps to an ELR section", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    mockContext();
    render(
      <DocumentsPanel
        collapsed={false}
        onToggleCollapse={vi.fn()}
        documentType="equipment_lifecycle_report"
        onJumpToSection={onJump}
      />
    );

    await user.click(screen.getByRole("button", { name: "Contents" }));
    await user.click(screen.getByRole("button", { name: "1. Purpose" }));
    expect(onJump).toHaveBeenCalledWith("elr_objective");
  });

  it("numbers investigation subsections 1.1 / 3.2 and jumps to Analyze", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    mockContext();
    render(
      <DocumentsPanel
        collapsed={false}
        onToggleCollapse={vi.fn()}
        documentType="investigation_report"
        onJumpToSection={onJump}
      />
    );

    await user.click(screen.getByRole("button", { name: "Contents" }));
    expect(screen.getByRole("button", { name: "1. Define" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1.1 Details Investigation" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "3.2 5 Why Approach" }));
    expect(onJump).toHaveBeenCalledWith("analyze");
  });

  it("shows Contents on generic documents and jumps to the body", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    mockContext();
    render(
      <DocumentsPanel
        collapsed={false}
        onToggleCollapse={vi.fn()}
        documentType="generic_document"
        onJumpToSection={onJump}
      />
    );

    await user.click(screen.getByRole("button", { name: "Contents" }));
    await user.click(screen.getByRole("button", { name: "1. Document" }));
    expect(onJump).toHaveBeenCalledWith("body");
  });
});
