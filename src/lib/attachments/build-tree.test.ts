import { describe, expect, it } from "vitest";
import { buildDocumentTree, collectSubtreeIds } from "./build-tree";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

function folder(
  id: string,
  name: string,
  parentId: string | null = null
): ReportAttachmentFolderRecord {
  return {
    id,
    reportId: "rep_1",
    parentId,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function file(
  id: string,
  filename: string,
  folderId: string | null = null
): ReportAttachmentRecord {
  return {
    id,
    reportId: "rep_1",
    folderId,
    filename,
    description: null,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    pageCount: 1,
    processingStatus: "ready",
    processingProgress: 100,
    processingPage: null,
    processingError: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("buildDocumentTree", () => {
  it("nests folders and files by parent", () => {
    const tree = buildDocumentTree(
      [folder("f1", "SOPs"), folder("f2", "2026", "f1")],
      [file("a1", "root.pdf"), file("a2", "sop.pdf", "f1"), file("a3", "jan.pdf", "f2")]
    );

    expect(tree.attachments.map((a) => a.id)).toEqual(["a1"]);
    expect(tree.folders).toHaveLength(1);
    expect(tree.folders[0].attachments.map((a) => a.id)).toEqual(["a2"]);
    expect(tree.folders[0].folders[0].attachments.map((a) => a.id)).toEqual(["a3"]);
  });

  it("sorts folders before files, each alphabetically", () => {
    const tree = buildDocumentTree(
      [folder("f2", "Zebra"), folder("f1", "Alpha")],
      [file("a2", "b.pdf"), file("a1", "a.pdf")]
    );

    expect(tree.folders.map((f) => f.name)).toEqual(["Alpha", "Zebra"]);
    expect(tree.attachments.map((a) => a.filename)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("hoists files whose folder no longer exists to the root", () => {
    const tree = buildDocumentTree([], [file("a1", "orphan.pdf", "missing")]);

    expect(tree.attachments.map((a) => a.id)).toEqual(["a1"]);
  });

  it("hoists folders in a cycle instead of dropping their files", () => {
    const tree = buildDocumentTree(
      [folder("f1", "One", "f2"), folder("f2", "Two", "f1")],
      [file("a1", "trapped.pdf", "f1")]
    );

    expect(tree.folders.map((f) => f.name)).toEqual(["One", "Two"]);
    const one = tree.folders.find((f) => f.id === "f1");
    expect(one?.attachments.map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("collectSubtreeIds", () => {
  it("includes the folder and all descendants", () => {
    const folders = [
      folder("f1", "One"),
      folder("f2", "Two", "f1"),
      folder("f3", "Three", "f2"),
      folder("f4", "Sibling"),
    ];

    expect(collectSubtreeIds(folders, "f1")).toEqual(new Set(["f1", "f2", "f3"]));
    expect(collectSubtreeIds(folders, "f4")).toEqual(new Set(["f4"]));
  });
});
