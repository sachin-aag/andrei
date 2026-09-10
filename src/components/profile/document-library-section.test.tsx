// @vitest-environment jsdom

import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { toast } from "sonner";
import { uploadFileToLibrary } from "@/lib/attachments/upload-library";
import {
  hasActiveSessionHold,
  resetSessionHoldsForTests,
} from "@/lib/auth/session-activity";
import { DocumentLibrarySection } from "./document-library-section";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/attachments/upload-library", () => ({
  uploadFileToLibrary: vi.fn(),
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
  ManagerSelector: ({
    managers,
    onSelectedIdsChange,
    emptyMessage,
  }: {
    managers: { id: string; name: string }[];
    onSelectedIdsChange: (ids: string[]) => void;
    emptyMessage?: string;
  }) =>
    managers[0] ? (
      <button
        type="button"
        data-testid="library-share-pick-user"
        onClick={() => onSelectedIdsChange([managers[0]!.id])}
      >
        Add {managers[0].name}
      </button>
    ) : (
      <div>{emptyMessage ?? "Sharing picker"}</div>
    ),
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
  archivedAt: null as string | null,
  accessKind: "mine" as const,
};

const folder = {
  id: "folder-1",
  ownerId: "user-1",
  parentId: null,
  name: "Quality",
  createdAt: "2026-08-20T02:00:00.000Z",
  archivedAt: null as string | null,
};

const nestedFolder = {
  id: "folder-2",
  ownerId: "user-1",
  parentId: "folder-1",
  name: "Batch records",
  createdAt: "2026-08-20T02:10:00.000Z",
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  document.title = "Andrei";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(uploadFileToLibrary).mockReset();
  vi.mocked(uploadFileToLibrary).mockResolvedValue(asset);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/attachment-vault?scope=accessible")) {
        return jsonResponse({ folders: [folder, nestedFolder], assets: [asset] });
      }
      if (url.includes("/access")) {
        return jsonResponse({ grants: [] });
      }
      return jsonResponse({ error: "unexpected" }, false);
    })
  );
});

afterEach(() => {
  document.title = "Andrei";
  resetSessionHoldsForTests();
  Reflect.deleteProperty(window, "showDirectoryPicker");
});

function folderUploadFiles() {
  const pdf = new File(["%PDF"], "coa.pdf", { type: "application/pdf" });
  Object.defineProperty(pdf, "webkitRelativePath", {
    value: "q1_batch/coa.pdf",
  });
  const txt = new File(["hi"], "notes.txt", { type: "text/plain" });
  Object.defineProperty(txt, "webkitRelativePath", {
    value: "q1_batch/notes.txt",
  });
  return [pdf, txt];
}

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

  it("opens preview on double-click without showing it on a single click", async () => {
    const user = userEvent.setup();
    renderLibrary();

    const file = await screen.findByTestId("library-file-asset-1");
    await user.dblClick(file);

    expect(await screen.findByTestId("library-asset-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("library-details-pane")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "New Folder" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("selects nested folders and files when a parent folder is checked", async () => {
    const user = userEvent.setup();
    const nestedAsset = {
      ...asset,
      id: "asset-2",
      filename: "batch-record.pdf",
      libraryFolderId: "folder-2",
    };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/attachment-vault?scope=accessible")) {
        return jsonResponse({
          folders: [folder, nestedFolder],
          assets: [asset, nestedAsset],
        });
      }
      if (url.includes("/access")) {
        return jsonResponse({ grants: [] });
      }
      return jsonResponse({ error: "unexpected" }, false);
    });

    renderLibrary();
    await screen.findByText("batch-record.pdf");

    await user.click(
      screen.getByRole("checkbox", { name: "Select folder Quality" })
    );

    expect(
      screen.getByRole("checkbox", { name: "Select folder Batch records" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select batch-record.pdf" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select coa.pdf" })
    ).not.toBeChecked();
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("shows nested destinations as a folder tree, not flattened paths", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(await screen.findByText("coa.pdf"));
    await user.click(screen.getByTestId("library-move-to-folder"));

    expect(await screen.findByTestId("library-move-destination-tree")).toBeInTheDocument();
    expect(screen.getByTestId("library-move-vault-root")).toHaveTextContent(
      "Vault root"
    );
    expect(screen.getByTestId("library-move-folder-folder-1")).toHaveTextContent(
      "Quality"
    );
    expect(screen.getByTestId("library-move-folder-folder-2")).toHaveTextContent(
      "Batch records"
    );
    expect(screen.queryByText("Quality / Batch records")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("library-move-folder-folder-2"));
    expect(screen.getByRole("button", { name: "Move 1 item" })).toBeEnabled();
  });

  it("can create a nested folder from the move explorer", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/attachment-vault?scope=accessible")) {
        return jsonResponse({ folders: [folder, nestedFolder], assets: [asset] });
      }
      if (url.includes("/access")) {
        return jsonResponse({ grants: [] });
      }
      if (url.endsWith("/api/attachment-vault/folders") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as {
          name?: string;
          parentId?: string | null;
        };
        return jsonResponse({
          folder: {
            id: "folder-new",
            ownerId: "user-1",
            parentId: body.parentId ?? null,
            name: body.name ?? "New",
            createdAt: "2026-08-20T03:00:00.000Z",
          },
        });
      }
      return jsonResponse({ error: "unexpected" }, false);
    });

    renderLibrary();
    await user.click(await screen.findByText("coa.pdf"));
    await user.click(screen.getByTestId("library-move-to-folder"));
    await user.click(await screen.findByTestId("library-move-folder-folder-1"));
    await user.click(screen.getByRole("button", { name: "New Folder" }));

    expect(screen.getByText(/Creates inside Quality/)).toBeInTheDocument();
    await user.type(
      await screen.findByTestId("library-move-new-folder-input"),
      "COAs"
    );
    await user.click(screen.getByTestId("library-move-create-folder"));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Folder created");
    });
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/attachment-vault/folders") &&
        init?.method === "POST"
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body ?? "{}"))).toMatchObject({
      name: "COAs",
      parentId: "folder-1",
    });
  });

  it("lets Move to folder act on the clicked file without a checkbox", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(await screen.findByText("coa.pdf"));
    expect(screen.getByText(/coa\.pdf is selected/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("library-move-to-folder"));
    expect(await screen.findByTestId("library-move-dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/Choose where to put coa.pdf/i)
    ).toBeInTheDocument();
  });

  it("does not show a preview window before a file is opened", async () => {
    renderLibrary();
    await screen.findByTestId("library-explorer");
    await waitFor(() => {
      expect(screen.queryByTestId("library-preview-pane")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("library-split-handle")).not.toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Date modified")).toBeInTheDocument();
  });

  it("opens a resizable viewer when a file is selected", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(await screen.findByText("coa.pdf"));
    expect(await screen.findByTestId("library-details-pane")).toBeInTheDocument();
    expect(screen.getByTestId("library-split-handle")).toBeInTheDocument();
  });

  it("filters the file list by name", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText("Quality");
    await user.type(screen.getByTestId("library-search"), "coa");
    expect(screen.getByText("coa.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Quality")).not.toBeInTheDocument();
  });

  it("shares checked folders with selected colleagues", async () => {
    const user = userEvent.setup();
    const colleague = {
      id: "user-2",
      name: "Alex Chen",
      email: "alex@example.com",
      role: "manager" as const,
      title: "QA",
    };
    const nestedAsset = {
      ...asset,
      id: "asset-2",
      filename: "batch-record.pdf",
      libraryFolderId: "folder-2",
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/attachment-vault?scope=accessible")) {
        return jsonResponse({
          folders: [folder, nestedFolder],
          assets: [asset, nestedAsset],
        });
      }
      if (url.includes("/access")) {
        return jsonResponse({ grants: [] });
      }
      if (url.endsWith("/api/attachment-vault/share") && init?.method === "POST") {
        return jsonResponse({ sharedAssets: 1, granteeCount: 1 });
      }
      return jsonResponse({ error: "unexpected" }, false);
    });

    render(
      <DocumentLibrarySection
        currentUser={{ id: "user-1", role: "engineer" }}
        workspaceUsers={[colleague]}
      />
    );
    await screen.findByText("batch-record.pdf");
    await user.click(
      screen.getByRole("checkbox", { name: "Select folder Quality" })
    );
    await user.click(screen.getByTestId("library-share-selected"));
    expect(await screen.findByTestId("library-share-dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("library-share-pick-user"));
    await user.click(screen.getByTestId("library-share-confirm"));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Shared 1 file with 1 person"
      );
    });
    const shareCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/attachment-vault/share") &&
        init?.method === "POST"
    );
    expect(shareCall).toBeTruthy();
    expect(JSON.parse(String(shareCall?.[1]?.body ?? "{}"))).toMatchObject({
      folderIds: ["folder-1"],
      granteeUserIds: ["user-2"],
    });
  });

  it("shows files shared with the current user under Shared with me", async () => {
    const user = userEvent.setup();
    const owner = {
      id: "user-2",
      name: "Alex Chen",
      email: "alex@example.com",
      role: "manager" as const,
      title: "QA",
    };
    const sharedFolder = {
      id: "folder-shared",
      ownerId: owner.id,
      parentId: null,
      name: "Protocols",
      createdAt: "2026-09-01T00:00:00.000Z",
      archivedAt: null as string | null,
    };
    const sharedAsset = {
      ...asset,
      id: "asset-shared",
      ownerId: owner.id,
      libraryFolderId: sharedFolder.id,
      filename: "protocol.pdf",
      accessKind: "shared" as const,
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/attachment-vault?scope=accessible")) {
        return jsonResponse({
          folders: [folder, nestedFolder, sharedFolder],
          assets: [asset, sharedAsset],
        });
      }
      if (url.includes("/access")) {
        return jsonResponse({ error: "Forbidden" }, false);
      }
      return jsonResponse({ error: "unexpected" }, false);
    });

    render(
      <DocumentLibrarySection
        currentUser={{ id: "user-1", role: "engineer" }}
        workspaceUsers={[owner]}
      />
    );

    expect(await screen.findByTestId("library-shared-with-me")).toBeInTheDocument();
    expect(screen.getByText("Shared with me")).toBeInTheDocument();
    expect(screen.getByText("Protocols")).toBeInTheDocument();
    expect(screen.getByText("protocol.pdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Select folder Protocols" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive protocol.pdf" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("protocol.pdf"));
    expect(await screen.findByTestId("library-details-pane")).toBeInTheDocument();
    expect(screen.getByText(/Shared with you by Alex Chen/)).toBeInTheDocument();
    expect(screen.queryByText("Save sharing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("library-details-archive")).not.toBeInTheDocument();
  });

  it("lets people upload files or a folder from the document vault", async () => {
    renderLibrary();
    await screen.findByTestId("library-explorer");
    expect(screen.getByTestId("library-upload-files")).toBeInTheDocument();
    expect(screen.getByTestId("library-upload-folder")).toBeInTheDocument();
    expect(screen.getByTestId("library-upload-files-input")).toHaveAttribute(
      "accept",
      expect.stringContaining(".pdf")
    );
    expect(screen.getByTestId("library-upload-folder-input")).toBeInTheDocument();
    expect(screen.getByTestId("library-upload-folder-input")).toHaveAttribute(
      "webkitdirectory"
    );
  });

  it("shows our loading dialog as soon as Upload folder is clicked", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("library-explorer");
    await user.click(screen.getByTestId("library-upload-folder"));
    expect(await screen.findByTestId("library-upload-dialog")).toBeInTheDocument();
    expect(screen.getByText("Preparing upload")).toBeInTheDocument();
    expect(
      screen.getByText(/Large folders can take a moment to load/i)
    ).toBeInTheDocument();
    expect(hasActiveSessionHold()).toBe(true);
  });

  it("uses the directory picker instead of webkitdirectory when Chrome provides it", async () => {
    const user = userEvent.setup();
    const pdf = new File(["%PDF"], "coa.pdf", { type: "application/pdf" });
    const picker = vi.fn().mockResolvedValue(
      mockDirectoryHandle("q1_batch", [mockFileHandle(pdf)])
    );
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: picker,
    });
    renderLibrary();
    await screen.findByTestId("library-explorer");
    const folderInput = screen.getByTestId(
      "library-upload-folder-input"
    ) as HTMLInputElement;
    const inputClick = vi.spyOn(folderInput, "click");

    await user.click(screen.getByTestId("library-upload-folder"));

    expect(picker).toHaveBeenCalledTimes(1);
    expect(inputClick).not.toHaveBeenCalled();
    expect(folderInput).not.toHaveAttribute("webkitdirectory");
    expect(screen.queryByText("Preparing upload")).not.toBeInTheDocument();
    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(uploadFileToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: "q1_batch/coa.pdf",
      })
    );
  });

  it("does not start an upload when the directory picker is cancelled", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: vi
        .fn()
        .mockRejectedValue(new DOMException("The user aborted a request.", "AbortError")),
    });
    renderLibrary();
    await screen.findByTestId("library-explorer");
    await user.click(screen.getByTestId("library-upload-folder"));
    await waitFor(() => {
      expect(window.showDirectoryPicker).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("library-upload-dialog")).not.toBeInTheDocument();
    expect(uploadFileToLibrary).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("asks before uploading when a folder includes an unsupported file", async () => {
    renderLibrary();
    await screen.findByTestId("library-explorer");
    const input = screen.getByTestId("library-upload-folder-input");
    fireEvent.change(input, { target: { files: folderUploadFiles() } });

    expect(await screen.findByTestId("library-upload-dialog")).toBeInTheDocument();
    expect(
      await screen.findByTestId("library-unsupported-files-dialog")
    ).toBeInTheDocument();
    expect(screen.getByText("This file isn't supported")).toBeInTheDocument();
    expect(screen.getByText("q1_batch/notes.txt")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Skip and upload the rest" })
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(uploadFileToLibrary).not.toHaveBeenCalled();
  });

  it("cancels a mixed folder upload from the unsupported-files dialog", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("library-explorer");
    fireEvent.change(screen.getByTestId("library-upload-folder-input"), {
      target: { files: folderUploadFiles() },
    });
    expect(
      await screen.findByTestId("library-unsupported-files-dialog")
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("library-unsupported-cancel"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("library-unsupported-files-dialog")
      ).not.toBeInTheDocument();
    });
    expect(uploadFileToLibrary).not.toHaveBeenCalled();
  });

  it("uploads accepted files after confirming skip on unsupported types", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByTestId("library-explorer");
    fireEvent.change(screen.getByTestId("library-upload-folder-input"), {
      target: { files: folderUploadFiles() },
    });
    expect(
      await screen.findByTestId("library-unsupported-files-dialog")
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("library-unsupported-proceed"));

    await waitFor(() => {
      expect(uploadFileToLibrary).toHaveBeenCalledTimes(1);
    });
    expect(uploadFileToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: "coa.pdf" }),
        relativePath: "q1_batch/coa.pdf",
      })
    );
    expect(
      screen.queryByTestId("library-unsupported-files-dialog")
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not offer proceed when a folder has no PDF or Word files", async () => {
    renderLibrary();
    await screen.findByTestId("library-explorer");
    const txt = new File(["hi"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(txt, "webkitRelativePath", {
      value: "q1_batch/notes.txt",
    });
    fireEvent.change(screen.getByTestId("library-upload-folder-input"), {
      target: { files: [txt] },
    });

    expect(
      await screen.findByTestId("library-unsupported-files-dialog")
    ).toBeInTheDocument();
    expect(screen.getByText("This file isn't supported")).toBeInTheDocument();
    expect(
      screen.queryByTestId("library-unsupported-proceed")
    ).not.toBeInTheDocument();
    expect(uploadFileToLibrary).not.toHaveBeenCalled();
  });

  it("shows our upload dialog instead of a page toast when a folder finishes", async () => {
    renderLibrary();
    await screen.findByTestId("library-explorer");
    const pdf = new File(["%PDF"], "coa.pdf", { type: "application/pdf" });
    Object.defineProperty(pdf, "webkitRelativePath", {
      value: "q1_batch/coa.pdf",
    });
    fireEvent.change(screen.getByTestId("library-upload-folder-input"), {
      target: { files: [pdf] },
    });

    expect(await screen.findByTestId("library-upload-dialog")).toBeInTheDocument();
    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(screen.getByText("Uploaded 1 file to your vault.")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("holds the session and warns before closing while a folder is uploading", async () => {
    let finishUpload: (value: typeof asset) => void = () => undefined;
    vi.mocked(uploadFileToLibrary).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        })
    );
    renderLibrary();
    await screen.findByTestId("library-explorer");
    const pdf = new File(["%PDF"], "coa.pdf", { type: "application/pdf" });
    Object.defineProperty(pdf, "webkitRelativePath", {
      value: "q1_batch/coa.pdf",
    });
    fireEvent.change(screen.getByTestId("library-upload-folder-input"), {
      target: { files: [pdf] },
    });

    expect(await screen.findByText("Uploading to vault")).toBeInTheDocument();
    expect(
      screen.getByText(/Switching tabs is OK; closing this tab stops the upload/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("library-upload-tab-spinner")).toBeInTheDocument();
    expect(document.title).toBe("Uploading 1 of 1 — Andrei");
    expect(hasActiveSessionHold()).toBe(true);

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await act(async () => {
      finishUpload(asset);
    });
    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(screen.queryByTestId("library-upload-tab-spinner")).not.toBeInTheDocument();
    expect(document.title).toBe("Andrei");
    expect(hasActiveSessionHold()).toBe(false);
  });

  it("archives a file into the collapsed Archive section and can restore it", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const folders = [folder];
    let assets = [asset];
    const archivedFolders: typeof folder[] = [];
    let archivedAssets: Array<typeof asset> = [];
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/attachment-vault?scope=accessible")) {
        return jsonResponse({ folders, assets, archivedFolders, archivedAssets });
      }
      if (url.includes("/access")) {
        return jsonResponse({ grants: [] });
      }
      if (url.endsWith("/api/attachment-vault/archive") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as {
          assetIds?: string[];
        };
        if (body.assetIds?.includes(asset.id)) {
          assets = [];
          archivedAssets = [{ ...asset, archivedAt: "2026-09-05T00:00:00.000Z" }];
        }
        return jsonResponse({ archivedAssets: 1, archivedFolders: 0 });
      }
      if (url.endsWith("/api/attachment-vault/unarchive") && init?.method === "POST") {
        assets = [asset];
        archivedAssets = [];
        return jsonResponse({ restoredAssets: 1, restoredFolders: 0 });
      }
      return jsonResponse({ error: "unexpected" }, false);
    });

    renderLibrary();
    await screen.findByText("coa.pdf");
    expect(screen.queryByTestId("library-archive")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive coa.pdf" }));
    await waitFor(() => {
      expect(screen.getByTestId("library-archive")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("library-file-asset-1")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("library-archive-toggle"));
    expect(await screen.findByTestId("library-archived-file-asset-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unarchive coa.pdf" }));
    await waitFor(() => {
      expect(screen.queryByTestId("library-archive")).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId("library-file-asset-1")).toBeInTheDocument();
  });

  it("archives a folder and every file inside it", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const nestedAsset = {
      ...asset,
      id: "asset-nested",
      libraryFolderId: folder.id,
      filename: "batch.pdf",
    };
    let folders = [folder];
    let assets = [nestedAsset];
    let archivedFolders: typeof folder[] = [];
    let archivedAssets: Array<typeof nestedAsset> = [];
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/attachment-vault?scope=accessible")) {
        return jsonResponse({ folders, assets, archivedFolders, archivedAssets });
      }
      if (url.includes("/access")) {
        return jsonResponse({ grants: [] });
      }
      if (url.endsWith("/api/attachment-vault/archive") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as {
          folderIds?: string[];
        };
        expect(body.folderIds).toEqual([folder.id]);
        folders = [];
        assets = [];
        archivedFolders = [{ ...folder, archivedAt: "2026-09-05T00:00:00.000Z" }];
        archivedAssets = [{ ...nestedAsset, archivedAt: "2026-09-05T00:00:00.000Z" }];
        return jsonResponse({ archivedAssets: 1, archivedFolders: 1 });
      }
      return jsonResponse({ error: "unexpected" }, false);
    });

    renderLibrary();
    await screen.findByText("batch.pdf");
    await user.click(screen.getByRole("button", { name: "Archive folder Quality" }));
    await waitFor(() => {
      expect(screen.getByTestId("library-archive")).toBeInTheDocument();
    });
    expect(screen.queryByText("Quality")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("library-archive-toggle"));
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("batch.pdf")).toBeInTheDocument();
  });
});

function mockFileHandle(file: File): FileSystemFileHandle {
  return {
    kind: "file",
    name: file.name,
    getFile: async () => file,
  } as FileSystemFileHandle;
}

function mockDirectoryHandle(
  name: string,
  children: FileSystemHandle[]
): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *entries() {
      for (const child of children) {
        yield [child.name, child] as [string, FileSystemHandle];
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}
