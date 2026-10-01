import type { JSONContent } from "@tiptap/core";

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
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
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
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
};

/** True when `$...$` content is TeX (subscript, superscript, command, braces), not currency. */
export function looksLikeTexFormula(latex: string): boolean {
  return /[\\_^{}]/.test(latex);
}

function withMarks(
  base: JSONContent["marks"] | undefined,
  extraMarks: JSONContent["marks"] | undefined
): JSONContent["marks"] | undefined {
  if (!extraMarks?.length) return base;
  if (!base?.length) return extraMarks;
  return [...extraMarks, ...base];
}

function textNode(text: string, marks: JSONContent["marks"] | undefined): JSONContent {
  return marks?.length ? { type: "text", text, marks } : { type: "text", text };
}

function mapChars(text: string, table: Record<string, string>): string {
  let out = "";
  for (const ch of text) {
    out += table[ch] ?? ch;
  }
  return out;
}

/**
 * Convert simple TeX like `N_2`, `CO_2`, `H_2O`, `x^2` into text + sub/super
 * marks so running prose matches Word (not a MathLive atom). Returns null when
 * the latex needs a real equation node (`\pm`, `\frac`, …).
 */
export function simpleLatexToTextNodes(
  latex: string,
  extraMarks?: JSONContent["marks"]
): JSONContent[] | null {
  const trimmed = latex.trim();
  if (!trimmed || /[\\$]/.test(trimmed) || !/[_^]/.test(trimmed)) return null;

  const nodes: JSONContent[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    nodes.push(textNode(buffer, extraMarks));
    buffer = "";
  };

  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i]!;
    if (ch !== "_" && ch !== "^") {
      buffer += ch;
      i++;
      continue;
    }
    const markType = ch === "_" ? "subscript" : "superscript";
    i++;
    if (i >= trimmed.length) return null;
    let script: string;
    if (trimmed[i] === "{") {
      const end = trimmed.indexOf("}", i + 1);
      if (end < 0) return null;
      script = trimmed.slice(i + 1, end);
      i = end + 1;
    } else {
      script = trimmed[i]!;
      i++;
    }
    if (!script) return null;
    flush();
    nodes.push(
      textNode(script, withMarks([{ type: markType }], extraMarks))
    );
  }
  flush();
  return nodes.length > 0 ? nodes : null;
}

/** Plain-text rendering of simple TeX (`N_2` → `N₂`). Null when not simple. */
export function simpleLatexToPlainText(latex: string): string | null {
  const nodes = simpleLatexToTextNodes(latex);
  if (!nodes) return null;
  return nodes
    .map((node) => {
      const text = node.text ?? "";
      const marks = node.marks ?? [];
      if (marks.some((mark) => mark.type === "subscript")) {
        return mapChars(text, SUBSCRIPT_CHARS);
      }
      if (marks.some((mark) => mark.type === "superscript")) {
        return mapChars(text, SUPERSCRIPT_CHARS);
      }
      return text;
    })
    .join("");
}
