import type { JSONContent } from "@tiptap/core";
import { MECHANICAL_RESULTS_COL_WIDTH_SHARES } from "@/lib/document-types/mechanical/sections";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

const RESULTS_FOOTNOTE_RE =
  /see deviation|not applicable to the current testing|deemed not applicable/i;
const PROTOTYPE_FOOTNOTE_RE =
  /functionally equivalent|prototype that was|adapter was a prototype/i;
const QUALIFIED_VERDICT_RE = /\*$/;
const WRAPPED_ASTERISK_RE = /^\*([\s\S]+)\*$/;

function isDoc(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as JSONContent).type === "doc"
  );
}

function asDoc(value: unknown): JSONContent {
  if (isDoc(value)) return value;
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function paragraphPlainText(node: JSONContent): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "text") return child.text ?? "";
      if (child.type === "hardBreak") return "\n";
      if (child.content?.length) return paragraphPlainText(child);
      return "";
    })
    .join("");
}

function paragraphIsFullyItalic(node: JSONContent): boolean {
  const texts = (node.content ?? []).filter((child) => child.type === "text");
  if (texts.length === 0) return false;
  return texts.every((child) =>
    (child.marks ?? []).some((mark) => mark.type === "italic")
  );
}

function isStrayFootnoteLeak(node: JSONContent): boolean {
  const text = paragraphPlainText(node).trim();
  return text === "" || text === "*" || /^i$/i.test(text);
}

function isResultsFootnoteParagraph(node: JSONContent): boolean {
  if (node.type !== "paragraph") return false;
  const text = paragraphPlainText(node).trim();
  if (!text || isStrayFootnoteLeak(node)) return false;
  if (RESULTS_FOOTNOTE_RE.test(text)) return true;
  return text.startsWith("*") && text.length < 500 && RESULTS_FOOTNOTE_RE.test(text);
}

function isPrototypeFootnoteParagraph(node: JSONContent): boolean {
  if (node.type !== "paragraph") return false;
  const text = paragraphPlainText(node).trim();
  if (!text || isStrayFootnoteLeak(node)) return false;
  if (PROTOTYPE_FOOTNOTE_RE.test(text)) return true;
  if (text.startsWith("*") && PROTOTYPE_FOOTNOTE_RE.test(text.replace(/^\*|\*$/g, ""))) {
    return true;
  }
  return (
    paragraphIsFullyItalic(node) &&
    text.length < 500 &&
    PROTOTYPE_FOOTNOTE_RE.test(text)
  );
}

function normalizeFootnoteParagraph(node: JSONContent): JSONContent {
  const text = paragraphPlainText(node).trim();
  const wrapped = WRAPPED_ASTERISK_RE.exec(text);
  if (!wrapped) return node;
  const inner = wrapped[1]!.trim();
  if (!inner) return node;
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: inner.startsWith("*") ? inner : `*${inner}`,
        marks: [{ type: "italic" }],
      },
    ],
  };
}

function footnoteKey(node: JSONContent): string {
  return paragraphPlainText(node)
    .replace(/^\*+|\*+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type FootnoteKind = "results" | "prototype";

function isFootnoteParagraph(node: JSONContent, kind: FootnoteKind): boolean {
  return kind === "results"
    ? isResultsFootnoteParagraph(node)
    : isPrototypeFootnoteParagraph(node);
}

export function splitTableFootnotes(
  doc: JSONContent | null | undefined,
  kind: FootnoteKind
): { body: JSONContent; footnotes: JSONContent[] } {
  const footnotes: JSONContent[] = [];
  const body: JSONContent[] = [];
  for (const node of asDoc(doc).content ?? []) {
    if (node.type !== "paragraph") {
      body.push(node);
      continue;
    }
    if (isStrayFootnoteLeak(node)) continue;
    if (isFootnoteParagraph(node, kind)) {
      footnotes.push(normalizeFootnoteParagraph(node));
      continue;
    }
    body.push(node);
  }
  return {
    body: {
      type: "doc",
      content: body.length > 0 ? body : [{ type: "paragraph" }],
    },
    footnotes,
  };
}

function dedupeFootnotes(nodes: JSONContent[]): JSONContent[] {
  const seen = new Set<string>();
  const out: JSONContent[] = [];
  for (const node of nodes) {
    const key = footnoteKey(node);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(node);
  }
  return out;
}

export function appendFootnotesToTableDoc(
  doc: JSONContent | null | undefined,
  footnotes: JSONContent[],
  kind: FootnoteKind
): JSONContent {
  const split = splitTableFootnotes(doc, kind);
  const unique = dedupeFootnotes([...split.footnotes, ...footnotes]);
  if (unique.length === 0) return split.body;
  return {
    type: "doc",
    content: [...(split.body.content ?? []), ...unique],
  };
}

export function tableHasQualifiedVerdict(doc: JSONContent | null | undefined): boolean {
  const haystack = richJsonToPlainText(isDoc(doc) ? doc : null);
  return /(?:pass|fail|n\/?a)\s*\*/i.test(haystack);
}

function footnotePrefersHardware(text: string): boolean {
  if (/\bM3-HRS\b/i.test(text)) return true;
  if (RESULTS_FOOTNOTE_RE.test(text)) return true;
  return false;
}

function footnotePrefersSystem(text: string): boolean {
  if (/\bM3-SYS\b/i.test(text)) return true;
  if (/\bfailure\b/i.test(text)) return true;
  return false;
}

export function placeRequirementsVerifiedFootnotes(args: {
  narrative: unknown;
  hardwareTable: unknown;
  systemTable: unknown;
}): {
  leadIn: JSONContent;
  hardwareTable: JSONContent;
  systemTable: JSONContent;
} {
  const leadSplit = splitTableFootnotes(asDoc(args.narrative), "results");
  const hardwareHasStar = tableHasQualifiedVerdict(asDoc(args.hardwareTable));
  const systemHasStar = tableHasQualifiedVerdict(asDoc(args.systemTable));

  const hardwareExtras: JSONContent[] = [];
  const systemExtras: JSONContent[] = [];
  for (const footnote of leadSplit.footnotes) {
    const text = paragraphPlainText(footnote);
    if (hardwareHasStar && !systemHasStar) {
      hardwareExtras.push(footnote);
      continue;
    }
    if (systemHasStar && !hardwareHasStar) {
      systemExtras.push(footnote);
      continue;
    }
    if (footnotePrefersSystem(text) && !footnotePrefersHardware(text)) {
      systemExtras.push(footnote);
      continue;
    }
    hardwareExtras.push(footnote);
  }

  return {
    leadIn: leadSplit.body,
    hardwareTable: appendFootnotesToTableDoc(
      asDoc(args.hardwareTable),
      hardwareExtras,
      "results"
    ),
    systemTable: appendFootnotesToTableDoc(
      asDoc(args.systemTable),
      systemExtras,
      "results"
    ),
  };
}

export function placeUutTableFootnotes(args: {
  narrative: unknown;
  table: unknown;
}): { narrative: JSONContent; table: JSONContent } {
  const split = splitTableFootnotes(asDoc(args.narrative), "prototype");
  return {
    narrative: split.body,
    table: appendFootnotesToTableDoc(asDoc(args.table), split.footnotes, "prototype"),
  };
}

/** Shared haystack for eval: lead-in, table cells, and trailing footnote paragraphs. */
export function mechanicalFootnoteHaystack(
  narrative: unknown,
  table: unknown
): string {
  return `${richJsonToPlainText(isDoc(narrative) ? narrative : null)} ${richJsonToPlainText(isDoc(table) ? table : null)}`;
}

/**
 * True when a prototype/equivalence footnote exists in a paragraph — the
 * lead-in or a paragraph after the table. An asterisk only inside a table
 * cell (the starred revision) does not count.
 */
export function sectionHasPrototypeFootnote(
  narrative: unknown,
  table: unknown
): boolean {
  for (const doc of [asDoc(narrative), asDoc(table)]) {
    const split = splitTableFootnotes(doc, "prototype");
    if (split.footnotes.length > 0) return true;
    for (const node of split.body.content ?? []) {
      if (node.type === "table") continue;
      if (paragraphPlainText(node).includes("*")) return true;
    }
  }
  return false;
}

export function applyMechanicalResultsColWidths(
  doc: JSONContent,
  maxGridDxa: number
): JSONContent {
  const shares = MECHANICAL_RESULTS_COL_WIDTH_SHARES;
  const total = shares.reduce((a, b) => a + b, 0);
  const widths = shares.map((share) =>
    Math.max(1, Math.round((maxGridDxa * share) / total))
  );
  const drift = maxGridDxa - widths.reduce((a, b) => a + b, 0);
  if (widths.length > 0) {
    widths[widths.length - 1] = Math.max(1, widths[widths.length - 1]! + drift);
  }
  return {
    ...doc,
    content: (doc.content ?? []).map((node) => {
      if (node.type !== "table") return node;
      return {
        ...node,
        attrs: { ...(node.attrs ?? {}), colWidths: widths },
      };
    }),
  };
}
