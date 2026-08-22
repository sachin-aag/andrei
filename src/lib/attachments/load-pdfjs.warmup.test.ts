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

  it("defers the 1.7 MB download when asked to wait for idle", async () => {
    const idle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);

    warmupPdfjsPreview({ whenIdle: true });

    // Nothing fetched yet — the report's own first paint comes first.
    expect(document.head.querySelector("link[rel=modulepreload]")).toBeNull();
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });

    idle.mock.calls[0]?.[0]();
    expect(
      document.head.querySelector(
        `link[rel="modulepreload"][href="${pdfjsWorkerSrc("6.1.200")}"]`
      )
    ).not.toBeNull();

    vi.unstubAllGlobals();
  });
});
