// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DocumentLibrarySection } from "./document-library-section";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/report/attachment-preview-panel", () => ({
  AttachmentPreviewPanel: ({
    attachment,
    onClose,
  }: {
    attachment: { filename: string };
    onClose?: () => void;
  }) => (
    <div data-testid="library-asset-preview">
      <span>{attachment.filename} preview</span>
      {onClose ? (
        <button type="button" onClick={onClose}>
          Close document
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/report/manager-selector", () => ({
  ManagerSelector: () => <div>Sharing picker</div>,
}));

const asset = {
  id: "asset-1",
  ownerId: "user-1",
  libraryFolderId: null,
  filename: "coa.pdf",
  description: null,
  mimeType: "application/pdf",
  sizeBytes: 1200,
  pageCount: 2,
  processingStatus: "ready" as const,
  processingProgress: 100,
  processingPage: null,
  processingError: null,
  uploadedAt: "2026-08-20T02:47:00.000Z",
  accessKind: "mine" as const,
};

const folder = {
  id: "folder-1",
  ownerId: "user-1",
  parentId: null,
  name: "Quality",
  createdAt: "2026-08-20T02:00:00.000Z",
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/attachment-library?scope=mine")) {
        return jsonResponse({ folders: [folder], assets: [asset] });
      }
      if (url.includes("/access")) {
        return jsonResponse({ grants: [] });
      }
      return jsonResponse({ error: "unexpected" }, false);
    })
  );
});

function renderLibrary() {
  return render(
    <DocumentLibrarySection
      currentUser={{ id: "user-1", role: "engineer" }}
      workspaceUsers={[]}
    />
  );
}

describe("DocumentLibrarySection explorer", () => {
  it("shows details on click and keeps preview closed until Open", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await screen.findByText("coa.pdf");
    expect(screen.queryByTestId("library-asset-preview")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Click a file to see its details/i)
    ).toBeInTheDocument();

    await user.click(screen.getByText("coa.pdf"));

    expect(await screen.findByTestId("library-details-pane")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open preview" })).toBeVisible();
    expect(screen.queryByTestId("library-asset-preview")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open preview" }));

    expect(await screen.findByTestId("library-asset-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("library-details-pane")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close document" }));
    expect(await screen.findByTestId("library-details-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("library-asset-preview")).not.toBeInTheDocument();
  });

  it("opens a destination dialog instead of moving immediately", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await screen.findByText("coa.pdf");
    await user.click(screen.getByRole("checkbox", { name: "Select coa.pdf" }));
    await user.click(screen.getByTestId("library-move-to-folder"));

    expect(await screen.findByTestId("library-move-dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/Choose where to put coa.pdf/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move 1 item" })
    ).toBeDisabled();
  });

  it("does not show a preview window before a file is opened", async () => {
    renderLibrary();
    await screen.findByTestId("library-explorer");
    await waitFor(() => {
      expect(screen.queryByTestId("library-preview-pane")).not.toBeInTheDocument();
    });
  });
});
