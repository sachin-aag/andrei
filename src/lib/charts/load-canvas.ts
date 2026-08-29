import fs from "node:fs";
import path from "node:path";

export type ChartCanvasModule = {
  createCanvas: (width: number, height: number) => {
    getContext: (type: "2d") => unknown;
    toBuffer: (mime: string) => Buffer;
  };
  GlobalFonts?: {
    registerFromPath: (filePath: string, nameAlias?: string) => unknown;
  };
};

let fontsRegistered = false;

function registerChartFont(
  GlobalFonts: ChartCanvasModule["GlobalFonts"]
): void {
  if (fontsRegistered || !GlobalFonts) return;
  fontsRegistered = true;
  const filePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "import",
    "fonts",
    "Arimo-Regular.ttf"
  );
  if (!fs.existsSync(filePath)) return;
  try {
    GlobalFonts.registerFromPath(filePath, "Arimo");
  } catch {
    // Fall through to the platform sans-serif.
  }
}

/**
 * Load @napi-rs/canvas and register Arimo. Without a registered font,
 * fillText is a no-op on Linux and exported plots have no labels.
 */
export function loadChartCanvas(): ChartCanvasModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@napi-rs/canvas") as ChartCanvasModule;
    registerChartFont(mod.GlobalFonts);
    return mod;
  } catch {
    return null;
  }
}

export function chartFontFamily(): string {
  return "Arimo, Helvetica, Arial, sans-serif";
}
