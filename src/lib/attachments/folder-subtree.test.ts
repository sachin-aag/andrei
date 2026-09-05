import { describe, expect, it } from "vitest";
import {
  buildFoldersByParent,
  collectFolderSubtreeIds,
  folderAncestorIds,
  isUnderFolder,
} from "./folder-subtree";

const folders = [
  { id: "root", parentId: null },
  { id: "child", parentId: "root" },
  { id: "grandchild", parentId: "child" },
  { id: "sibling", parentId: "root" },
];

describe("collectFolderSubtreeIds", () => {
  it("includes the root folder and every descendant", () => {
    expect([...collectFolderSubtreeIds("root", folders)].sort()).toEqual(
      ["root", "child", "grandchild", "sibling"].sort()
    );
  });

  it("stops at the requested subtree", () => {
    expect([...collectFolderSubtreeIds("child", folders)].sort()).toEqual(
      ["child", "grandchild"].sort()
    );
  });
});

describe("isUnderFolder", () => {
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));

  it("detects nested folders under a selected ancestor", () => {
    expect(isUnderFolder("grandchild", new Set(["root"]), parentById)).toBe(true);
    expect(isUnderFolder("sibling", new Set(["child"]), parentById)).toBe(false);
  });
});

describe("folderAncestorIds", () => {
  const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));

  it("walks up to the root", () => {
    expect(folderAncestorIds("grandchild", parentById)).toEqual([
      "grandchild",
      "child",
      "root",
    ]);
  });
});

describe("buildFoldersByParent", () => {
  it("groups folders by parent id", () => {
    const byParent = buildFoldersByParent(folders);
    expect(byParent.get(null)?.map((folder) => folder.id)).toEqual(["root"]);
    expect(byParent.get("root")?.map((folder) => folder.id)).toEqual([
      "child",
      "sibling",
    ]);
  });
});
