import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PDFJS_PACKAGE = require("pdfjs-dist/package.json") as { version: string };
const PDFJS_ROOT = path.dirname(require.resolve("pdfjs-dist/package.json"));

export const PDFJS_ASSET_ROOTS = [
  "wasm",
  "standard_fonts",
  "cmaps",
  "build",
] as const;

export type PdfjsAssetRoot = (typeof PDFJS_ASSET_ROOTS)[number];

const ASSET_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function pdfjsPackageVersion(): string {
  return PDFJS_PACKAGE.version;
}

export function isPdfjsAssetRoot(value: string): value is PdfjsAssetRoot {
  return (PDFJS_ASSET_ROOTS as readonly string[]).includes(value);
}

export function resolvePdfjsAssetPath(
  version: string,
  root: string,
  file: string
): { absolutePath: string; contentType: string } | null {
  if (version !== pdfjsPackageVersion()) return null;
  if (!isPdfjsAssetRoot(root)) return null;
  if (!ASSET_FILE_NAME.test(file)) return null;
  if (root === "build" && file !== "pdf.worker.min.mjs") return null;

  const directory = pdfjsAssetDirectory(root);
  const absolutePath = path.join(directory, file);
  if (path.dirname(absolutePath) !== directory) return null;
  return { absolutePath, contentType: contentTypeFor(file) };
}

function pdfjsAssetDirectory(root: PdfjsAssetRoot): string {
  switch (root) {
    case "wasm":
      return path.join(PDFJS_ROOT, "wasm");
    case "standard_fonts":
      return path.join(PDFJS_ROOT, "standard_fonts");
    case "cmaps":
      return path.join(PDFJS_ROOT, "cmaps");
    case "build":
      return path.join(PDFJS_ROOT, "build");
    default: {
      const _exhaustive: never = root;
      return _exhaustive;
    }
  }
}

function contentTypeFor(file: string): string {
  if (file.endsWith(".wasm")) return "application/wasm";
  if (file.endsWith(".mjs") || file.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (file.endsWith(".ttf")) return "font/ttf";
  if (file.endsWith(".pfb")) return "application/x-font-type1";
  if (file.endsWith(".bcmap")) return "application/octet-stream";
  return "application/octet-stream";
}
