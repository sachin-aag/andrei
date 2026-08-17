/**
 * Official pdf.js. Do not import `pdfjs-dist` from a Client Component module
 * graph that Next evaluates during SSR — the package reads `DOMMatrix` at
 * load time and throws `ReferenceError: DOMMatrix is not defined` in Node.
 *
 * Call this only after mount (inside an effect).
 */
export async function loadPdfjs() {
  return import("pdfjs-dist");
}
