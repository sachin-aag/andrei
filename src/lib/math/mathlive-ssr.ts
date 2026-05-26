type ConvertLatexToMathMlOptions = { generateID?: boolean };

type ConvertLatexToMathMlFn = (
  latex: string,
  options?: ConvertLatexToMathMlOptions
) => string;

let convertLatexToMathMlImpl: ConvertLatexToMathMlFn | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * MathLive's `./ssr` export is ESM-only. Static `import "mathlive/ssr"` breaks
 * under tsx/CJS (bulk sample-eval script), so load it dynamically once.
 */
export function ensureMathliveSsr(): Promise<void> {
  if (convertLatexToMathMlImpl) return Promise.resolve();
  loadPromise ??= import("mathlive/ssr").then((mod) => {
    convertLatexToMathMlImpl = mod.convertLatexToMathMl;
  });
  return loadPromise;
}

export function convertLatexToMathMl(
  latex: string,
  options?: ConvertLatexToMathMlOptions
): string {
  if (!convertLatexToMathMlImpl) {
    throw new Error(
      "MathLive SSR is not loaded. Call await ensureMathliveSsr() before convertLatexToMathMl()."
    );
  }
  return convertLatexToMathMlImpl(latex, options);
}

void ensureMathliveSsr().catch((error) => {
  console.warn("[mathlive-ssr] preload failed:", error);
});
