import { getDocumentProxy } from "unpdf";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Enough pixels for a short table-cell stroke to survive rasterization. */
export const NUMERIC_SIGN_OVERLAY_RENDER_SCALE = 2;

type NapiCanvas = {
  width: number;
  height: number;
  getContext: (type: "2d") => unknown;
  encode: (format: "png") => Promise<Buffer>;
};

type NapiCanvasModule = {
  createCanvas: (width: number, height: number) => NapiCanvas;
  DOMMatrix: unknown;
  ImageData: unknown;
  Path2D: unknown;
};

type CanvasFactoryContext = {
  canvas?: NapiCanvas;
  context?: unknown;
};

/**
 * Load the native canvas the same way charts and Word export do. An ESM
 * `import "@napi-rs/canvas"` can load the JS wrapper on Vercel without NFT
 * copying the `.node` binary; `require` is what those paths already trace.
 */
export function loadNapiCanvas(): NapiCanvasModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as NapiCanvasModule;
  } catch (error) {
    throw new Error(
      `Signed-quantity overlay cannot load @napi-rs/canvas: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function injectCanvasConstructors(mod: NapiCanvasModule): void {
  globalThis.DOMMatrix = mod.DOMMatrix as typeof DOMMatrix;
  if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = mod.ImageData as typeof ImageData;
  }
  if (typeof globalThis.Path2D === "undefined") {
    globalThis.Path2D = mod.Path2D as typeof Path2D;
  }
}

function createNapiCanvasFactory(mod: NapiCanvasModule) {
  return class NapiNodeCanvasFactory {
    create(width: number, height: number): {
      canvas: NapiCanvas;
      context: unknown;
    } {
      const canvas = mod.createCanvas(width, height);
      return {
        canvas,
        context: canvas.getContext("2d"),
      };
    }

    reset(context: CanvasFactoryContext, width: number, height: number): void {
      if (!context.canvas) throw new Error("Canvas is not specified");
      context.canvas.width = width;
      context.canvas.height = height;
    }

    destroy(context: CanvasFactoryContext): void {
      if (!context.canvas) throw new Error("Canvas is not specified");
      context.canvas.width = 0;
      context.canvas.height = 0;
      context.canvas = undefined;
      context.context = undefined;
    }
  };
}

function withNodeRenderScheduling<T>(run: () => Promise<T>): Promise<T> {
  const nodeRaf = (callback: FrameRequestCallback): number =>
    setTimeout(() => callback(Date.now()), 0) as unknown as number;
  const nodeCancel = (id: number): void => {
    clearTimeout(id);
  };
  const globalScope = globalThis as typeof globalThis & {
    requestAnimationFrame?: typeof requestAnimationFrame;
    cancelAnimationFrame?: typeof cancelAnimationFrame;
    window?: {
      requestAnimationFrame?: typeof requestAnimationFrame;
      cancelAnimationFrame?: typeof cancelAnimationFrame;
    };
  };
  const previous = {
    raf: globalScope.requestAnimationFrame,
    cancel: globalScope.cancelAnimationFrame,
    windowRaf: globalScope.window?.requestAnimationFrame,
    windowCancel: globalScope.window?.cancelAnimationFrame,
  };
  globalScope.requestAnimationFrame = nodeRaf;
  globalScope.cancelAnimationFrame = nodeCancel;
  if (globalScope.window) {
    globalScope.window.requestAnimationFrame = nodeRaf;
    globalScope.window.cancelAnimationFrame = nodeCancel;
  }
  return run().finally(() => {
    if (previous.raf) globalScope.requestAnimationFrame = previous.raf;
    if (previous.cancel) globalScope.cancelAnimationFrame = previous.cancel;
    if (globalScope.window) {
      if (previous.windowRaf) {
        globalScope.window.requestAnimationFrame = previous.windowRaf;
      }
      if (previous.windowCancel) {
        globalScope.window.cancelAnimationFrame = previous.windowCancel;
      }
    }
  });
}

function asPngBuffer(image: Buffer): Buffer {
  if (
    image.length < PNG_SIGNATURE.length ||
    !image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("PDF page raster did not produce a PNG");
  }
  return image;
}

/**
 * Rasterize one PDF page so a vision overlay can see drawn strokes the text
 * layer omitted. Gemini reading the PDF file itself uses the unsigned text
 * layer and misses those strokes.
 *
 * Do not call unpdf `renderPageAsImage`: it treats `typeof window !==
 * "undefined"` as a browser and uses `document.createElement("canvas")`,
 * which throws in Next.js Node ingest and is swallowed by the overlay.
 */
export async function renderPdfPagePng(
  pdfBuffer: Buffer,
  pageNumber = 1,
  scale = NUMERIC_SIGN_OVERLAY_RENDER_SCALE
): Promise<Buffer> {
  const canvasMod = loadNapiCanvas();
  if (typeof canvasMod.createCanvas !== "function") {
    throw new Error(
      "Signed-quantity overlay loaded @napi-rs/canvas without createCanvas"
    );
  }
  injectCanvasConstructors(canvasMod);
  const CanvasFactory = createNapiCanvasFactory(canvasMod);
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer), {
    CanvasFactory,
  });
  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(
        `Invalid page number ${pageNumber} (document has ${pdf.numPages})`
      );
    }
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: Math.max(0, scale) });
    const factory = new CanvasFactory();
    const drawingContext = factory.create(viewport.width, viewport.height);
    try {
      await withNodeRenderScheduling(() =>
        page.render({
          canvas: drawingContext.canvas as unknown as HTMLCanvasElement,
          canvasContext: drawingContext.context as CanvasRenderingContext2D,
          viewport,
        }).promise
      );
      const png = await drawingContext.canvas.encode("png");
      return asPngBuffer(Buffer.from(png));
    } finally {
      factory.destroy(drawingContext);
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
}
