import { convertLatexToMathMl } from "@/lib/math/mathlive-ssr";

const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

function wrapMathml(inner: string, display: "inline" | "block"): string | null {
  const trimmed = inner.trim();
  if (!trimmed) return null;

  let wrapped: string;
  if (/^<math[\s>]/i.test(trimmed)) {
    wrapped = trimmed;
    if (display === "block" && !/\sdisplay=/i.test(wrapped)) {
      wrapped = wrapped.replace(/<math\b/i, '<math display="block"');
    }
  } else {
    const displayAttr = display === "block" ? ' display="block"' : "";
    wrapped = `<math xmlns="${MATHML_NS}"${displayAttr}>${trimmed}</math>`;
  }

  if (!/^<math[\s>]/i.test(wrapped) || /<script/i.test(wrapped)) return null;
  return wrapped;
}

/**
 * Convert LaTeX to a full `<math>` document. Returns null when MathLive SSR
 * is not loaded yet or the latex is empty / unsafe.
 */
export function latexToDisplayMathml(
  latex: string,
  display: "inline" | "block"
): string | null {
  const trimmed = latex.trim();
  if (!trimmed) return null;
  try {
    return wrapMathml(convertLatexToMathMl(trimmed), display);
  } catch {
    return null;
  }
}
