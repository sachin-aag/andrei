import { describe, expect, it } from "vitest";
import {
  planLibraryArchive,
  planLibraryUnarchive,
  type LibraryAssetArchiveRef,
  type LibraryFolderArchiveRef,
} from "./library-archive";

const folders: LibraryFolderArchiveRef[] = [
  { id: "root", parentId: null, archivedAt: null },
  { id: "child", parentId: "root", archivedAt: null },
  { id: "grandchild", parentId: "child", archivedAt: null },
  { id: "sibling", parentId: "root", archivedAt: null },
];

describe("planLibraryArchive", () => {
  it("includes nested folders when archiving a parent", () => {
    expect(planLibraryArchive(folders, ["root"], []).folderIds.sort()).toEqual(
      ["child", "grandchild", "root", "sibling"].sort()
    );
  });

  it("does not re-add folders that are already archived", () => {
    const mixed: LibraryFolderArchiveRef[] = [
      { id: "root", parentId: null, archivedAt: "2026-09-05T00:00:00.000Z" },
      { id: "child", parentId: "root", archivedAt: "2026-09-05T00:00:00.000Z" },
    ];
    expect(planLibraryArchive(mixed, ["root"], ["a1"])).toEqual({
      folderIds: [],
      assetIds: ["a1"],
    });
  });
});

describe("planLibraryUnarchive", () => {
  const archivedFolders: LibraryFolderArchiveRef[] = [
    { id: "root", parentId: null, archivedAt: "2026-09-05T00:00:00.000Z" },
    { id: "child", parentId: "root", archivedAt: "2026-09-05T00:00:00.000Z" },
    { id: "live", parentId: null, archivedAt: null },
  ];
  const assets: LibraryAssetArchiveRef[] = [
    { id: "in-child", libraryFolderId: "child", archived: true },
    { id: "loose", libraryFolderId: "live", archived: true },
    { id: "open", libraryFolderId: null, archived: false },
  ];

  it("restores nested folders and the files inside them", () => {
    const plan = planLibraryUnarchive(archivedFolders, assets, ["root"], []);
    expect(plan.folderIds.sort()).toEqual(["child", "root"].sort());
    expect(plan.assetIds).toEqual(["in-child"]);
    expect(plan.folderReparents).toEqual([]);
    expect(plan.assetRootIds).toEqual([]);
  });

  it("moves a nested folder to vault root when its parent stays archived", () => {
    const plan = planLibraryUnarchive(archivedFolders, assets, ["child"], []);
    expect(plan.folderIds).toEqual(["child"]);
    expect(plan.folderReparents).toEqual([{ id: "child", parentId: null }]);
    expect(plan.assetIds).toEqual(["in-child"]);
  });

  it("returns a file to vault root when its folder stays archived", () => {
    const nestedFile: LibraryAssetArchiveRef[] = [
      { id: "in-child", libraryFolderId: "child", archived: true },
    ];
    const plan = planLibraryUnarchive(
      archivedFolders,
      nestedFile,
      [],
      ["in-child"]
    );
    expect(plan.assetIds).toEqual(["in-child"]);
    expect(plan.assetRootIds).toEqual(["in-child"]);
  });
});
