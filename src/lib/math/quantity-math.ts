import type { JSONContent } from "@tiptap/core";
import {
  simpleLatexToTextNodes,
  simpleLatexToPlainText,
} from "@/lib/math/simple-latex";

/** Deterministic AI Check key: limits/counts must not sit in math atoms. */
export const QUANTITY_MATH_CRITERION_KEY = "math.quantity_as_prose" as const;

const SUBSCRIPT_CHARS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

const SUPERSCRIPT_CHARS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
};

/** Real equations — do not flatten these into prose. */
const KEEP_AS_EQUATION_RE =
  /\\(?:frac|dfrac|tfrac|sum|int|oint|prod|lim|sqrt|overline|underline|vec|hat|bar|partial|nabla|begin|end|matrix|align|over)\b/;

/**
 * After expanding TeX quantity commands, leftover must be ordinary units /
 * numbers / comparison signs — not another backslash command.
 */
const QUANTITY_PLAIN_RE =
  /^[0-9A-Za-z.,+\-±∓≤≥≠×·°µμ∞≈<>%/()[\]\s²³⁴₀-₉⁺⁻–—'’]+$/;

function mapChars(text: string, table: Record<string, string>): string {
  let out = "";
  for (const ch of text) out += table[ch] ?? ch;
  return out;
}

function applyScripts(text: string): string {
  return text
    .replace(/\^\{([^}]+)\}/g, (_m, inner: string) =>
      mapChars(inner, SUPERSCRIPT_CHARS)
    )
    .replace(/\^([0-9+\-])/g, (_m, ch: string) => mapChars(ch, SUPERSCRIPT_CHARS))
    .replace(/_\{([^}]+)\}/g, (_m, inner: string) =>
      mapChars(inner, SUBSCRIPT_CHARS)
    )
    .replace(/_([0-9])/g, (_m, ch: string) => mapChars(ch, SUBSCRIPT_CHARS));
}

function unwrapSimpleGroups(text: string): string {
  return text
    .replace(/\{,\}/g, ",")
    .replace(/\{([^{}\\]+)\}/g, "$1");
}

/**
 * Expand TeX used for limits / tolerances / counts into Unicode prose.
 * Returns null when the latex is a real equation (`\frac`, …).
 */
export function quantityLatexToPlainText(latex: string): string | null {
  const trimmed = latex.trim();
  if (!trimmed) return null;
  if (KEEP_AS_EQUATION_RE.test(trimmed)) return null;

  let s = trimmed;
  for (let pass = 0; pass < 8; pass++) {
    const before = s;
    s = s
      .replace(/\\leqslant\b/g, "≤")
      .replace(/\\geqslant\b/g, "≥")
      .replace(/\\leq\b/g, "≤")
      .replace(/\\geq\b/g, "≥")
      .replace(/\\le\b/g, "≤")
      .replace(/\\ge\b/g, "≥")
      .replace(/\\neq\b/g, "≠")
      .replace(/\\ne\b/g, "≠")
      .replace(/\\pm\b/g, "±")
      .replace(/\\mp\b/g, "∓")
      .replace(/\\times\b/g, "×")
      .replace(/\\cdot\b/g, "·")
      .replace(/\\circ\b/g, "°")
      .replace(/\\degree\b/g, "°")
      .replace(/\\infty\b/g, "∞")
      .replace(/\\approx\b/g, "≈")
      .replace(/\\rightarrow\b/g, "→")
      .replace(/\\to\b/g, "→")
      .replace(/\\mu\b/g, "µ")
      .replace(/\\lt\b/g, "<")
      .replace(/\\gt\b/g, ">")
      .replace(/\\%/g, "%")
      .replace(/\\,/g, " ")
      .replace(/\\;/g, " ")
      .replace(/\\:/g, " ")
      .replace(/\\ /g, " ")
      .replace(/~/g, " ")
      .replace(/\\left\b/g, "")
      .replace(/\\right\b/g, "")
      .replace(/\\text(?:rm|it|bf|sf)?\{([^{}]*)\}/g, "$1")
      .replace(/\\operatorname\{([^{}]*)\}/g, "$1")
      .replace(/\\mathrm\{([^{}]*)\}/g, "$1")
      .replace(/\\mathbf\{([^{}]*)\}/g, "$1")
      .replace(/\\textit\{([^{}]*)\}/g, "$1");
    s = unwrapSimpleGroups(s);
    s = applyScripts(s);
    if (s === before) break;
  }

  s = s.replace(/\s+/g, " ").trim();
  if (!s || /\\/.test(s)) return null;
  if (!QUANTITY_PLAIN_RE.test(s)) return null;
  return s;
}

function textNode(
  text: string,
  marks: JSONContent["marks"] | undefined
): JSONContent {
  return marks?.length ? { type: "text", text, marks } : { type: "text", text };
}

/** TipTap text nodes for quantity TeX. Null when the latex needs a math atom. */
export function quantityLatexToTextNodes(
  latex: string,
  extraMarks?: JSONContent["marks"]
): JSONContent[] | null {
  const simple = simpleLatexToTextNodes(latex, extraMarks);
  if (simple) return simple;
  const plain = quantityLatexToPlainText(latex);
  if (plain == null) return null;
  return [textNode(plain, extraMarks)];
}

/**
 * `$...$` spans that should become prose: TeX quantity commands, or a leading
 * `<` / `>` / `≤` / `±` comparison. Bare `$100-$200$` currency stays literal.
 */
export function shouldFlattenDollarLatex(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  if (quantityLatexToTextNodes(trimmed)) {
    if (/[\\_^{}]/.test(trimmed)) return true;
    if (/^[<>≤≥±]/.test(trimmed)) return true;
  }
  return false;
}

function latexFromMathNode(node: JSONContent): string {
  const latex = node.attrs?.latex;
  if (typeof latex === "string" && latex.trim()) return latex.trim();
  return "";
}

function flattenMathChild(
  child: JSONContent,
  samples: string[]
): JSONContent[] | null {
  if (child.type !== "mathInline" && child.type !== "mathBlock") return null;
  const latex = latexFromMathNode(child);
  const replacement =
    quantityLatexToTextNodes(latex) ??
    (simpleLatexToPlainText(latex)
      ? [textNode(simpleLatexToPlainText(latex)!, undefined)]
      : null);
  if (!replacement) return null;
  samples.push(latex || "[equation]");
  if (child.type === "mathBlock") {
    return [{ type: "paragraph", content: replacement }];
  }
  return replacement;
}

/**
 * Replace flattenable mathInline / mathBlock atoms with Unicode text.
 * Real equations (`\frac`, …) are left in place.
 */
export function flattenQuantityMathInDoc(doc: JSONContent): {
  doc: JSONContent;
  samples: string[];
} {
  const samples: string[] = [];

  function walk(node: JSONContent): JSONContent {
    if (!node.content?.length) return node;
    const content: JSONContent[] = [];
    for (const child of node.content) {
      const flat = flattenMathChild(child, samples);
      if (flat) {
        content.push(...flat);
        continue;
      }
      content.push(walk(child));
    }
    return { ...node, content };
  }

  return { doc: walk(doc), samples };
}

/** Latex values of flattenable math atoms in any JSON blob (section content). */
export function collectQuantityMathSamples(value: unknown): string[] {
  const samples: string[] = [];

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as JSONContent & { content?: unknown };
    if (n.type === "mathInline" || n.type === "mathBlock") {
      const latex = latexFromMathNode(n);
      if (quantityLatexToTextNodes(latex) || simpleLatexToPlainText(latex)) {
        samples.push(latex || "[equation]");
      }
      return;
    }
    if (Array.isArray((node as { content?: unknown }).content)) {
      for (const child of (node as { content: unknown[] }).content) visit(child);
    } else if (!Array.isArray(node)) {
      for (const v of Object.values(node as Record<string, unknown>)) visit(v);
    }
  }

  visit(value);
  return samples;
}

export function hasQuantityMath(value: unknown): boolean {
  return collectQuantityMathSamples(value).length > 0;
}
