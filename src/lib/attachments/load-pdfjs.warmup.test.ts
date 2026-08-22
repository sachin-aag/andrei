// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { warmupPdfjsPreview } from "@/lib/attachments/load-pdfjs";
import { pdfjsWorkerSrc } from "@/lib/attachments/pdfjs-browser";

vi.mock("pdfjs-dist", () => ({
  version: "6.1.200",
  GlobalWorkerOptions: { workerSrc: "" },
}));

describe("warmupPdfjsPreview", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("modulepreloads the versioned worker once", () => {
    warmupPdfjsPreview();
    warmupPdfjsPreview();

    const href = pdfjsWorkerSrc("6.1.200");
    const links = document.querySelectorAll(
      `link[rel="modulepreload"][href="${href}"]`
    );
    expect(links).toHaveLength(1);
  });
});
