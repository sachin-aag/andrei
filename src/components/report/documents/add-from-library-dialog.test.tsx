// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentLibraryAssetRecord } from "@/lib/attachments/library-dto";
import { AddFromLibraryDialog } from "./add-from-library-dialog";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

const rootFolder = {
  id: "folder-root",
  ownerId: "user-1",
  parentId: null,
  name: "Filling Machine",
  createdAt: "2026-08-09T10:00:00.000Z",
  archivedAt: null,
};

const ursFolder = {
  id: "folder-urs",
  ownerId: "user-1",
  parentId: "folder-root",
  name: "1. URS",
  createdAt: "2026-08-09T10:01:00.000Z",
  archivedAt: null,
};

function asset(
  overrides: Pick<AttachmentLibraryAssetRecord, "id" | "filename"> &
    Partial<AttachmentLibraryAssetRecord>
): AttachmentLibraryAssetRecord {
  return {
    ownerId: "user-1",
    libraryFolderId: "folder-urs",
    description: null,
    mimeType: "application/pdf",
    sizeBytes: 1,
    pageCount: 1,
    processingStatus: "ready",
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    uploadedAt: "2026-08-09T10:27:00.000Z",
    archivedAt: null,
    accessKind: "mine",
    ...overrides,
  };
}

describe("AddFromLibraryDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides files already attached to the report and folders left empty", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        scope: "mine",
        folders: [rootFolder, ursFolder],
        assets: [
          asset({ id: "linked", filename: "already-on-report.pdf" }),
          asset({
            id: "fresh",
            filename: "available.pdf",
            libraryFolderId: "folder-root",
          }),
        ],
      })
    );

    render(
      <AddFromLibraryDialog
        open
        onOpenChange={vi.fn()}
        onLink={vi.fn(async () => undefined)}
        linkedAssetIds={new Set(["linked"])}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("available.pdf")).toBeInTheDocument();
    });
    expect(screen.queryByText("already-on-report.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("1. URS")).not.toBeInTheDocument();
    expect(screen.getByText("Filling Machine")).toBeInTheDocument();
  });

  it("collapses a folder next to its checkbox without clearing the selection", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        scope: "mine",
        folders: [rootFolder, ursFolder],
        assets: [
          asset({ id: "urs", filename: "urs.pdf" }),
          asset({
            id: "loose",
            filename: "loose.pdf",
            libraryFolderId: null,
          }),
        ],
      })
    );

    render(
      <AddFromLibraryDialog
        open
        onOpenChange={vi.fn()}
        onLink={vi.fn(async () => undefined)}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("urs.pdf")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("checkbox", { name: "Select folder Filling Machine" })
    );
    expect(
      screen.getByRole("checkbox", { name: "Select folder Filling Machine" })
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: "Collapse Filling Machine" })
    );

    expect(screen.queryByText("urs.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("1. URS")).not.toBeInTheDocument();
    expect(screen.getByText("loose.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select folder Filling Machine" })
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Expand Filling Machine" })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("says every vault file is already on the report when none remain", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        scope: "mine",
        folders: [rootFolder],
        assets: [asset({ id: "linked", filename: "already-on-report.pdf" })],
      })
    );

    render(
      <AddFromLibraryDialog
        open
        onOpenChange={vi.fn()}
        onLink={vi.fn(async () => undefined)}
        linkedAssetIds={new Set(["linked"])}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "All documents in this vault view are already on this report."
        )
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("already-on-report.pdf")).not.toBeInTheDocument();
  });
});
