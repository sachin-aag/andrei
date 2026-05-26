import { DOMParser } from "@xmldom/xmldom";
import omml2mathml from "omml2mathml";
import { mml2omml } from "mathml2omml";
import { convertLatexToMathMl } from "@/lib/math/mathlive-ssr";

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

/** MathLive `convertLatexToMathMl` returns inner elements only; mml2omml needs a `<math>` root. */
function normalizeMathmlForConversion(mathml: string): string {
  const trimmed = mathml.trim();
  if (!trimmed) return "";
  if (/^<math[\s>]/i.test(trimmed)) return trimmed;
  return `<math xmlns="${MATHML_NS}">${trimmed}</math>`;
}

/** Inline `<m:oMath>` in a `<w:r>` must carry the Word math namespace. */
function ensureOmmlMathNamespace(omml: string): string {
  const trimmed = omml.trim();
  if (!trimmed) return "";
  if (trimmed.includes("xmlns:m=")) return trimmed;
  if (trimmed.startsWith("<m:oMath")) {
    return trimmed.replace("<m:oMath", `<m:oMath xmlns:m="${MATH_NS}"`);
  }
  return trimmed;
}

/** mml2omml adds xmlns:w on `<m:oMath>`; nested inside `<w:r>` Word may ignore it. */
function cleanOmmlForWord(omml: string): string {
  return ensureOmmlMathNamespace(
    omml.replace(/ xmlns:w="[^"]*"/g, "").trim()
  );
}

export type MathExportAttrs = {
  mathml?: string | null;
  latex?: string | null;
  omml?: string | null;
  ommlDirty?: boolean | null;
};

/** Resolve OMML for DOCX export from stored math node attrs (with LaTeX fallback). */
export function resolveOmmlFromMathAttrs(attrs: MathExportAttrs): string {
  const cachedOmml = typeof attrs.omml === "string" ? attrs.omml.trim() : "";
  if (cachedOmml && attrs.ommlDirty === false) {
    return cleanOmmlForWord(cachedOmml);
  }

  const mathml = typeof attrs.mathml === "string" ? attrs.mathml.trim() : "";
  if (mathml) {
    const fromMathml = mathmlToOmmlFragment(mathml);
    if (fromMathml) return fromMathml;
  }

  const latex = typeof attrs.latex === "string" ? attrs.latex.trim() : "";
  if (latex) {
    try {
      const generated = convertLatexToMathMl(latex);
      if (generated) {
        const fromLatex = mathmlToOmmlFragment(generated);
        if (fromLatex) return fromLatex;
      }
    } catch {
      // fall through
    }
  }

  return "";
}

/** Convert an OMML fragment (m:oMath or inner content) to MathML string. */
export function ommlFragmentToMathml(ommlFragment: string): string {
  const trimmed = ommlFragment.trim();
  if (!trimmed) return "";

  const wrapped = trimmed.startsWith("<m:oMath")
    ? `<root xmlns:m="${MATH_NS}">${trimmed}</root>`
    : `<root xmlns:m="${MATH_NS}"><m:oMath>${trimmed}</m:oMath></root>`;

  try {
    const doc = new DOMParser().parseFromString(wrapped, "text/xml");
    const oMath =
      doc.getElementsByTagNameNS(MATH_NS, "oMath")[0] ??
      doc.getElementsByTagName("oMath")[0];
    if (!oMath) return "";
    const mathEl = omml2mathml(oMath as unknown as Element);
    return mathEl?.outerHTML ?? "";
  } catch {
    return "";
  }
}

/** Convert MathML to OMML (m:oMath) XML string without outer w:r wrapper. */
export function mathmlToOmmlFragment(mathml: string): string {
  const normalized = normalizeMathmlForConversion(mathml);
  if (!normalized) return "";
  try {
    const omml = mml2omml(normalized);
    return cleanOmmlForWord(omml.trim());
  } catch {
    return "";
  }
}

/** Strip namespace prefix for embedding in Word runs. */
export function normalizeOmmlForExport(omml: string): string {
  return omml
    .replace(/ xmlns:m="[^"]*"/g, "")
    .replace(/<\/?m:/g, (m) => m.replace("m:", ""))
    .replace(/<(\/?)oMath/g, "<$1m:oMath")
    .replace(/<(\/?)oMathPara/g, "<$1m:oMathPara");
}
