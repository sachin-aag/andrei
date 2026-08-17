import { describe, expect, it } from "vitest";

describe("loadPdfjs", () => {
  it("can be imported in Node without evaluating pdfjs-dist", async () => {
    await expect(import("./load-pdfjs")).resolves.toMatchObject({
      loadPdfjs: expect.any(Function),
    });
  });
});
