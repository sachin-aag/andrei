import { describe, expect, it } from "vitest";
import { libraryUploadFilesFromList } from "./library-drop-files";

describe("libraryUploadFilesFromList", () => {
  it("keeps PDF and Word files and skips other types", () => {
    const pdf = new File(["%PDF"], "coa.pdf", { type: "application/pdf" });
    const txt = new File(["hi"], "notes.txt", { type: "text/plain" });
    const { accepted, skipped } = libraryUploadFilesFromList([pdf, txt]);
    expect(skipped).toBe(1);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.file.name).toBe("coa.pdf");
  });
});
