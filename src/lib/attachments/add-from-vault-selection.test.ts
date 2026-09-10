import { describe, expect, it } from "vitest";
import type { AttachmentLibraryAssetRecord } from "@/lib/attachments/library-dto";
import {
  buildVaultLinkPayload,
  countVaultLinkSelection,
  isVaultAssetChecked,
  toggleVaultAssetSelection,
  toggleVaultFolderSelection,
} from "./add-from-vault-selection";

const folders = [
  { id: "root", parentId: null },
  { id: "child", parentId: "root" },
];

const assets: AttachmentLibraryAssetRecord[] = [
  {
    id: "a1",
    filename: "root.pdf",
    libraryFolderId: "root",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    processingStatus: "ready",
    mimeType: "application/pdf",
    sizeBytes: 1,
    pageCount: 1,
    ownerId: "u1",
    description: null,
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    accessKind: "mine",
    archivedAt: null,
  },
  {
    id: "a2",
    filename: "child.pdf",
    libraryFolderId: "child",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    processingStatus: "ready",
    mimeType: "application/pdf",
    sizeBytes: 1,
    pageCount: 1,
    ownerId: "u1",
    description: null,
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    accessKind: "mine",
    archivedAt: null,
  },
  {
    id: "a3",
    filename: "loose.pdf",
    libraryFolderId: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    processingStatus: "ready",
    mimeType: "application/pdf",
    sizeBytes: 1,
    pageCount: 1,
    ownerId: "u1",
    description: null,
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    accessKind: "mine",
    archivedAt: null,
  },
];

describe("toggleVaultFolderSelection", () => {
  it("selects descendant folders and clears asset picks inside the subtree", () => {
    const selectedFolderIds = new Set<string>();
    const selectedAssetIds = new Set(["a1"]);
    const excludedAssetIds = new Set<string>();

    toggleVaultFolderSelection(
      "root",
      true,
      folders,
      assets,
      selectedFolderIds,
      selectedAssetIds,
      excludedAssetIds
    );

    expect([...selectedFolderIds].sort()).toEqual(["child", "root"]);
    expect(selectedAssetIds.has("a1")).toBe(false);
  });
});

describe("toggleVaultAssetSelection", () => {
  it("tracks exclusions for files inside a selected folder", () => {
    const selectedFolderIds = new Set(["root"]);
    const selectedAssetIds = new Set<string>();
    const excludedAssetIds = new Set<string>();
    const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));

    toggleVaultAssetSelection(
      assets[0]!,
      false,
      selectedFolderIds,
      selectedAssetIds,
      excludedAssetIds,
      parentById
    );

    expect(excludedAssetIds.has("a1")).toBe(true);
    expect(
      isVaultAssetChecked(
        assets[0]!,
        selectedFolderIds,
        selectedAssetIds,
        excludedAssetIds,
        parentById
      )
    ).toBe(false);
  });
});

describe("buildVaultLinkPayload", () => {
  it("sends root folders and exclusions instead of per-file ids", () => {
    const payload = buildVaultLinkPayload(
      folders,
      assets,
      new Set(["root", "child"]),
      new Set<string>(),
      new Set(["a2"])
    );

    expect(payload.libraryFolderIds).toEqual(["root"]);
    expect(payload.assetIds).toEqual([]);
    expect(payload.excludedAssetIds).toEqual(["a2"]);
  });

  it("keeps standalone files outside selected folders", () => {
    const payload = buildVaultLinkPayload(
      folders,
      assets,
      new Set(["root", "child"]),
      new Set(["a3"]),
      new Set<string>()
    );

    expect(payload.libraryFolderIds).toEqual(["root"]);
    expect(payload.assetIds).toEqual(["a3"]);
  });
});

describe("countVaultLinkSelection", () => {
  it("counts root folders plus unique files without double-counting nested folders", () => {
    const count = countVaultLinkSelection(
      folders,
      assets,
      new Set(["root", "child"]),
      new Set<string>(),
      new Set(["a2"])
    );

    expect(count).toBe(2);
  });
});
