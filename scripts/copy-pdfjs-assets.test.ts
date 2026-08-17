import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyPdfjsAssets } from "./copy-pdfjs-assets.mjs";
import {
  pdfjsPreviewDocumentOptions,
  pdfjsWorkerSrc,
} from "@/lib/attachments/pdfjs-browser";

describe("copyPdfjsAssets", () => {
  it("publishes JBIG2 wasm, standard fonts, and the worker under the versioned URL", async () => {
    const { version, destRoot } = copyPdfjsAssets();
    await access(path.join(destRoot, "wasm/jbig2.wasm"));
    await access(path.join(destRoot, "standard_fonts/LiberationSans-Regular.ttf"));
    await access(path.join(destRoot, "build/pdf.worker.min.mjs"));

    const options = pdfjsPreviewDocumentOptions(version);
    expect(options.wasmUrl).toBe(`/pdfjs-assets/${version}/wasm/`);
    expect(options.standardFontDataUrl).toBe(
      `/pdfjs-assets/${version}/standard_fonts/`
    );
    expect(pdfjsWorkerSrc(version)).toBe(
      `/pdfjs-assets/${version}/build/pdf.worker.min.mjs`
    );
  });
});
