import { describe, expect, it } from "vitest";
import { planLibraryShare } from "./library-share-plan";

const folders = [
  { id: "root", parentId: null },
  { id: "child", parentId: "root" },
];

const assets = [
  { id: "a1", libraryFolderId: "root" },
  { id: "a2", libraryFolderId: "child" },
  { id: "a3", libraryFolderId: null },
];

describe("planLibraryShare", () => {
  it("expands a folder selection to every file in the subtree", () => {
    expect(planLibraryShare(folders, assets, ["root"], []).sort()).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("keeps standalone files outside selected folders", () => {
    expect(
      planLibraryShare(folders, assets, ["child"], ["a3"]).sort()
    ).toEqual(["a2", "a3"]);
  });

  it("dedupes a file that is both checked and inside a selected folder", () => {
    expect(planLibraryShare(folders, assets, ["child"], ["a2"])).toEqual(["a2"]);
  });

  it("omits files unchecked inside a selected folder", () => {
    expect(planLibraryShare(folders, assets, ["root"], [], ["a2"]).sort()).toEqual(
      ["a1"]
    );
  });
});
