import { describe, expect, it } from "vitest";
import type {
  AttachmentLibraryAssetRecord,
  AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";
import {
  SHARED_WITH_ME_FOLDER_ID,
  attachSharedWithMeRoot,
  liveAncestorFolders,
} from "./library-shared-tree";

function folder(
  id: string,
  parentId: string | null,
  name = id
): AttachmentLibraryFolderRecord {
  return {
    id,
    ownerId: "owner",
    parentId,
    name,
    createdAt: "2026-09-10T00:00:00.000Z",
    archivedAt: null,
  };
}

function asset(
  id: string,
  libraryFolderId: string | null
): AttachmentLibraryAssetRecord {
  return {
    id,
    ownerId: "owner",
    libraryFolderId,
    filename: `${id}.pdf`,
    description: null,
    mimeType: "application/pdf",
    sizeBytes: 1,
    pageCount: 1,
    processingStatus: "ready",
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    uploadedAt: "2026-09-10T00:00:00.000Z",
    archivedAt: null,
    accessKind: "shared",
  };
}

describe("liveAncestorFolders", () => {
  const folders = [
    folder("protocols", null, "Protocols"),
    folder("sst", "protocols", "SST"),
    folder("other", "protocols", "Other"),
  ];

  it("keeps only the path to shared files, not sibling folders", () => {
    const visible = liveAncestorFolders([asset("sst-file", "sst")], folders);
    expect(visible.map((row) => row.id).sort()).toEqual(["protocols", "sst"]);
  });

  it("returns nothing for files at the vault root", () => {
    expect(liveAncestorFolders([asset("loose", null)], folders)).toEqual([]);
  });
});

describe("attachSharedWithMeRoot", () => {
  it("leaves an owned-only vault unchanged", () => {
    const ownedFolder = { ...folder("mine", null, "Mine"), ownerId: "me" };
    const ownedAsset = { ...asset("coa", "mine"), ownerId: "me", accessKind: "mine" as const };
    expect(attachSharedWithMeRoot("me", [ownedFolder], [ownedAsset])).toEqual({
      folders: [ownedFolder],
      assets: [ownedAsset],
    });
  });

  it("nests shared folder trees under Shared with me", () => {
    const owned = { ...folder("mine", null, "Mine"), ownerId: "me" };
    const protocols = folder("protocols", null, "Protocols");
    const sst = folder("sst", "protocols", "SST");
    const sharedFile = asset("protocol", "sst");
    const ownedFile = {
      ...asset("coa", "mine"),
      ownerId: "me",
      accessKind: "mine" as const,
    };

    const next = attachSharedWithMeRoot(
      "me",
      [owned, protocols, sst],
      [ownedFile, sharedFile]
    );
    expect(next.folders[0]?.id).toBe(SHARED_WITH_ME_FOLDER_ID);
    expect(next.folders.find((row) => row.id === "protocols")?.parentId).toBe(
      SHARED_WITH_ME_FOLDER_ID
    );
    expect(next.folders.find((row) => row.id === "sst")?.parentId).toBe("protocols");
    expect(next.assets.find((row) => row.id === "protocol")?.libraryFolderId).toBe(
      "sst"
    );
    expect(next.assets.find((row) => row.id === "coa")?.libraryFolderId).toBe("mine");
  });

  it("places loose shared files directly in Shared with me", () => {
    const sharedFile = asset("loose", null);
    const next = attachSharedWithMeRoot("me", [], [sharedFile]);
    expect(next.assets[0]?.libraryFolderId).toBe(SHARED_WITH_ME_FOLDER_ID);
  });
});
