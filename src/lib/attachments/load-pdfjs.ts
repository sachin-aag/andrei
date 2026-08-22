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
 * Fetch the 1.7 MB pdf.js bundle + worker ahead of the first open so that
 * click -> paint is not a sequential import.
 *
 * `whenIdle` defers the download past the report's own first paint — the
 * Documents list mounts on every report, but most visits never open a PDF.
 * Hovering a row calls this without the delay, which is early enough.
 */
export function warmupPdfjsPreview({ whenIdle = false } = {}): void {
  if (whenIdle) {
    scheduleIdle(() => warmupPdfjsPreview());
    return;
  }
  preloadPdfjsWorkerModule();
  void loadPdfjs()
    .then(({ GlobalWorkerOptions, version }) => {
      GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc(version);
    })
    .catch(() => {
      // Preview still loads pdf.js on demand if this warmup fails.
    });
}

function scheduleIdle(run: () => void): void {
  if (typeof window === "undefined") return;
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (idle) idle(run, { timeout: 3000 });
  else window.setTimeout(run, 1500);
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
