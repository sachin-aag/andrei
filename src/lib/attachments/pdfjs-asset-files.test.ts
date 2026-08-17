import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  pdfjsPackageVersion,
  resolvePdfjsAssetPath,
} from "@/lib/attachments/pdfjs-asset-files";
import {
  pdfjsPreviewDocumentOptions,
  pdfjsWorkerSrc,
} from "@/lib/attachments/pdfjs-browser";

describe("pdfjs asset serving", () => {
  it("resolves the JBIG2 wasm and worker that preview needs", async () => {
    const version = pdfjsPackageVersion();
    const wasm = resolvePdfjsAssetPath(version, "wasm", "jbig2.wasm");
    const worker = resolvePdfjsAssetPath(version, "build", "pdf.worker.min.mjs");
    const font = resolvePdfjsAssetPath(
      version,
      "standard_fonts",
      "LiberationSans-Regular.ttf"
    );

    expect(wasm?.contentType).toBe("application/wasm");
    expect(worker?.contentType).toMatch(/javascript/);
    expect(font?.contentType).toBe("font/ttf");
    await access(wasm!.absolutePath);
    await access(worker!.absolutePath);
    await access(font!.absolutePath);
  });

  it("rejects path traversal and the wrong package version", () => {
    const version = pdfjsPackageVersion();
    expect(resolvePdfjsAssetPath(version, "wasm", "../package.json")).toBeNull();
    expect(resolvePdfjsAssetPath("0.0.0", "wasm", "jbig2.wasm")).toBeNull();
    expect(resolvePdfjsAssetPath(version, "build", "pdf.mjs")).toBeNull();
    expect(resolvePdfjsAssetPath(version, "image_decoders", "x.js")).toBeNull();
  });

  it("points the browser loader at versioned same-origin asset URLs", () => {
    const version = pdfjsPackageVersion();
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
