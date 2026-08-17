import { describe, expect, it } from "vitest";

describe("PdfPagePreview SSR", () => {
  it("can be imported in Node without DOMMatrix", async () => {
    await expect(import("./pdf-page-preview")).resolves.toHaveProperty(
      "PdfPagePreview"
    );
  });
});
