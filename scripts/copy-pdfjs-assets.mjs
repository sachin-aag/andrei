import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const pdfjsRoot = path.join(appRoot, "node_modules/pdfjs-dist");

/**
 * Copies official pdf.js worker / wasm / fonts into `public/` so Next can
 * serve them as static files. A dynamic route that `require.resolve`s
 * pdfjs-dist breaks Turbopack on Vercel (`path` received a number).
 */
export function copyPdfjsAssets() {
  const { version } = JSON.parse(
    readFileSync(path.join(pdfjsRoot, "package.json"), "utf8")
  );
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("pdfjs-dist package.json is missing version");
  }

  const publicRoot = path.join(appRoot, "public/pdfjs-assets");
  const destRoot = path.join(publicRoot, version);
  rmSync(publicRoot, { recursive: true, force: true });
  mkdirSync(path.join(destRoot, "build"), { recursive: true });
  cpSync(path.join(pdfjsRoot, "wasm"), path.join(destRoot, "wasm"), {
    recursive: true,
  });
  cpSync(
    path.join(pdfjsRoot, "standard_fonts"),
    path.join(destRoot, "standard_fonts"),
    { recursive: true }
  );
  cpSync(path.join(pdfjsRoot, "cmaps"), path.join(destRoot, "cmaps"), {
    recursive: true,
  });
  cpSync(
    path.join(pdfjsRoot, "build/pdf.worker.min.mjs"),
    path.join(destRoot, "build/pdf.worker.min.mjs")
  );
  return { version, destRoot };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version, destRoot } = copyPdfjsAssets();
  console.log(`Copied pdf.js ${version} assets to ${destRoot}`);
}
