import { describe, expect, it } from "vitest";
import { MAX_FOLDER_DEPTH } from "./folder-limits";
import {
  classifyCollectedLibraryFiles,
  isIgnorableLibraryUploadName,
  libraryTargetFolderDepth,
  libraryUnsupportedFilesError,
  libraryUploadBatchError,
  libraryUploadFilesFromList,
} from "./library-drop-files";

function fileWithPath(
  name: string,
  relativePath: string,
  type = "application/pdf"
): File {
  const file = new File(["bytes"], name, { type });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

describe("library folder upload scan", () => {
  it("keeps nested PDF and Word paths", () => {
    const pdf = fileWithPath("coa.pdf", "Q1/SOP/coa.pdf");
    const scan = libraryUploadFilesFromList([pdf]);
    expect(scan.rejectedNames).toEqual([]);
    expect(scan.accepted).toHaveLength(1);
    expect(scan.accepted[0]?.relativePath).toBe("Q1/SOP/coa.pdf");
    expect(libraryUploadBatchError(scan, 0)).toBeNull();
  });

  it("rejects the whole batch when any real file is not PDF or Word", () => {
    const pdf = fileWithPath("coa.pdf", "q1_batch/coa.pdf");
    const txt = fileWithPath("notes.txt", "q1_batch/notes.txt", "text/plain");
    const scan = libraryUploadFilesFromList([pdf, txt]);
    expect(scan.accepted.map((item) => item.file.name)).toEqual(["coa.pdf"]);
    expect(scan.rejectedNames).toEqual(["notes.txt"]);
    expect(libraryUploadBatchError(scan, 0)).toBe(
      "notes.txt is not a PDF or Word document. Remove unsupported files and try again."
    );
  });

  it("ignores Finder/Explorer metadata so those files do not block the folder", () => {
    expect(isIgnorableLibraryUploadName(".DS_Store")).toBe(true);
    expect(isIgnorableLibraryUploadName("._coa.pdf")).toBe(true);
    const pdf = fileWithPath("coa.pdf", "q1_batch/coa.pdf");
    const junk = fileWithPath(".DS_Store", "q1_batch/.DS_Store", "");
    const scan = libraryUploadFilesFromList([pdf, junk]);
    expect(scan.rejectedNames).toEqual([]);
    expect(scan.accepted).toHaveLength(1);
    expect(libraryUploadBatchError(scan, 0)).toBeNull();
  });

  it("lists a few unsupported names when several files are wrong", () => {
    expect(
      libraryUnsupportedFilesError(["notes.txt", "photo.png", "data.xlsx", "x.csv"])
    ).toBe(
      "This folder includes notes.txt, photo.png, data.xlsx, and 1 more, which are not PDF or Word documents. Remove them and try again."
    );
  });

  it("blocks a nested path that would exceed folder depth", () => {
    const segments = Array.from({ length: MAX_FOLDER_DEPTH + 1 }, (_, i) => `L${i}`);
    const relativePath = `${segments.join("/")}/coa.pdf`;
    const scan = classifyCollectedLibraryFiles([
      { file: fileWithPath("coa.pdf", relativePath), relativePath },
    ]);
    expect(libraryUploadBatchError(scan, 0)).toBe(
      `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`
    );
  });

  it("counts existing library folder depth when dropping onto a folder", () => {
    const folders = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
    ];
    expect(libraryTargetFolderDepth(folders, null)).toBe(0);
    expect(libraryTargetFolderDepth(folders, "b")).toBe(2);
  });
});
