import {
  PDFJS_ASSETS_VERSION,
  pdfjsWorkerSrc,
} from "@/lib/attachments/pdfjs-browser";

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

/**
 * Start the 1.7 MB pdf.js import and modulepreload the worker as soon as the
 * Documents list is on screen (or a row is hovered) so open is not sequential.
 */
export function warmupPdfjsPreview(): void {
  preloadPdfjsWorkerModule();
  void loadPdfjs()
    .then(({ GlobalWorkerOptions, version }) => {
      GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc(version);
    })
    .catch(() => {
      // Preview still loads pdf.js on demand if this warmup fails.
    });
}

function preloadPdfjsWorkerModule(): void {
  if (typeof document === "undefined") return;
  const href = pdfjsWorkerSrc(PDFJS_ASSETS_VERSION);
  if (document.querySelector(`link[rel="modulepreload"][href="${href}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = href;
  document.head.appendChild(link);
}
