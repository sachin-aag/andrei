/**
 * Small string-level OOXML helpers for the QSR template build and export.
 * Word attribute values never contain a raw `>` (it is written `&gt;`), which
 * is what makes tag scanning with a regex safe here.
 */

const TAG_RE = /<(\/?)([A-Za-z_][\w.-]*(?::[\w.-]+)?)((?:\s[^>]*?)?)(\/?)>/g;

/** Split XML into its top-level elements (whitespace between them dropped). */
export function splitTopLevelElements(xml: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let name = "";
  for (const m of xml.matchAll(TAG_RE)) {
    const [whole, close, tag, , selfClose] = m;
    const index = m.index ?? 0;
    if (whole.startsWith("<?")) continue;
    if (depth === 0) {
      if (close) continue;
      if (selfClose) {
        out.push(whole);
        continue;
      }
      start = index;
      name = tag;
      depth = 1;
      continue;
    }
    if (tag !== name) continue;
    if (close) {
      depth -= 1;
      if (depth === 0) out.push(xml.slice(start, index + whole.length));
    } else if (!selfClose) {
      depth += 1;
    }
  }
  return out;
}

export function tagName(element: string): string {
  const m = /^<([A-Za-z_][\w.-]*(?::[\w.-]+)?)/.exec(element);
  return m?.[1] ?? "";
}

export function isElement(element: string, name: string): boolean {
  return tagName(element) === name;
}

export function openTag(element: string): string {
  return element.slice(0, element.indexOf(">") + 1);
}

export function innerXml(element: string): string {
  const open = openTag(element);
  if (open.endsWith("/>")) return "";
  return element.slice(open.length, element.lastIndexOf("</"));
}

export function childElements(element: string): string[] {
  return splitTopLevelElements(innerXml(element));
}

export function findChild(element: string, name: string): string | undefined {
  return childElements(element).find((child) => isElement(child, name));
}

export function withChildren(element: string, children: readonly string[]): string {
  const name = tagName(element);
  const open = openTag(element).replace(/\/>$/, ">");
  return `${open}${children.join("")}</${name}>`;
}

export function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function elementText(xml: string): string {
  let text = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
    text += decodeXmlText(m[1]);
  }
  return text;
}

/** First run's `<w:rPr>` (falls back to the paragraph mark's rPr). */
export function paragraphRunProperties(paragraph: string): string {
  for (const child of childElements(paragraph)) {
    if (isElement(child, "w:r")) {
      const rPr = findChild(child, "w:rPr");
      if (rPr) return rPr;
      return "";
    }
  }
  const pPr = findChild(paragraph, "w:pPr");
  const markRPr = pPr ? findChild(pPr, "w:rPr") : undefined;
  return markRPr ? withChildren(markRPr, childElements(markRPr)) : "";
}

export function textRunXml(rPr: string, text: string): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r>`;
}

/** Keep the paragraph's pPr, replace every run with one text run. */
export function setParagraphText(paragraph: string, text: string, rPr?: string): string {
  const pPr = findChild(paragraph, "w:pPr") ?? "";
  const runProps = rPr ?? paragraphRunProperties(paragraph);
  return `<w:p>${pPr}${textRunXml(runProps, text)}</w:p>`;
}

const RPR_ORDER = [
  "w:rStyle",
  "w:rFonts",
  "w:b",
  "w:bCs",
  "w:i",
  "w:iCs",
  "w:caps",
  "w:smallCaps",
  "w:strike",
  "w:dstrike",
  "w:outline",
  "w:shadow",
  "w:emboss",
  "w:imprint",
  "w:noProof",
  "w:snapToGrid",
  "w:vanish",
  "w:webHidden",
  "w:color",
  "w:spacing",
  "w:w",
  "w:kern",
  "w:position",
  "w:sz",
  "w:szCs",
  "w:highlight",
  "w:u",
  "w:effect",
  "w:bdr",
  "w:shd",
  "w:fitText",
  "w:vertAlign",
  "w:rtl",
  "w:cs",
  "w:em",
  "w:lang",
  "w:eastAsianLayout",
  "w:specVanish",
  "w:oMath",
];

const TC_PR_ORDER = [
  "w:cnfStyle",
  "w:tcW",
  "w:gridSpan",
  "w:hMerge",
  "w:vMerge",
  "w:tcBorders",
  "w:shd",
  "w:noWrap",
  "w:tcMar",
  "w:textDirection",
  "w:tcFitText",
  "w:vAlign",
  "w:hideMark",
];

function orderedProperties(
  wrapper: string,
  existing: readonly string[],
  overrides: ReadonlyMap<string, string | null>,
  order: readonly string[]
): string {
  const byName = new Map<string, string>();
  for (const child of existing) byName.set(tagName(child), child);
  for (const [name, value] of overrides) {
    if (value === null) byName.delete(name);
    else byName.set(name, value);
  }
  const rank = (name: string) => {
    const i = order.indexOf(name);
    return i === -1 ? order.length : i;
  };
  const children = [...byName.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([, value]) => value);
  return children.length ? `<${wrapper}>${children.join("")}</${wrapper}>` : "";
}

export type RunMarks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  vertAlign?: "superscript" | "subscript";
};

/** Add formatting to a prototype rPr without disturbing its font/size. */
export function mergeRunProperties(baseRPr: string, marks: RunMarks): string {
  const existing = baseRPr ? childElements(baseRPr) : [];
  const overrides = new Map<string, string | null>();
  if (marks.bold) {
    overrides.set("w:b", "<w:b/>");
    overrides.set("w:bCs", "<w:bCs/>");
  }
  if (marks.italic) {
    overrides.set("w:i", "<w:i/>");
    overrides.set("w:iCs", "<w:iCs/>");
  }
  if (marks.underline) overrides.set("w:u", '<w:u w:val="single"/>');
  if (marks.strike) overrides.set("w:strike", "<w:strike/>");
  if (marks.vertAlign) {
    overrides.set("w:vertAlign", `<w:vertAlign w:val="${marks.vertAlign}"/>`);
  }
  return orderedProperties("w:rPr", existing, overrides, RPR_ORDER);
}

export type CellShape = {
  width: number;
  gridSpan: number;
  vMerge: "restart" | "continue" | null;
};

export function buildCellProperties(protoTcPr: string, shape: CellShape): string {
  const existing = protoTcPr ? childElements(protoTcPr) : [];
  const overrides = new Map<string, string | null>([
    ["w:tcW", `<w:tcW w:w="${shape.width}" w:type="dxa"/>`],
    ["w:gridSpan", shape.gridSpan > 1 ? `<w:gridSpan w:val="${shape.gridSpan}"/>` : null],
    ["w:hMerge", null],
    [
      "w:vMerge",
      shape.vMerge === "restart"
        ? '<w:vMerge w:val="restart"/>'
        : shape.vMerge === "continue"
          ? "<w:vMerge/>"
          : null,
    ],
  ]);
  return orderedProperties("w:tcPr", existing, overrides, TC_PR_ORDER);
}

export function tableGridWidths(tbl: string): number[] {
  const grid = findChild(tbl, "w:tblGrid");
  if (!grid) return [];
  return childElements(grid)
    .filter((child) => isElement(child, "w:gridCol"))
    .map((col) => Number(/w:w="(\d+)"/.exec(col)?.[1] ?? 0));
}

export function cellGridSpan(tc: string): number {
  const tcPr = findChild(tc, "w:tcPr");
  const span = tcPr ? findChild(tcPr, "w:gridSpan") : undefined;
  return span ? Number(/w:val="(\d+)"/.exec(span)?.[1] ?? 1) : 1;
}

/** Drop `<w:tblHeader/>` so body rows do not repeat on every page. */
export function stripRowHeaderFlag(tr: string): string {
  return tr.replace(/<w:tblHeader(?:\s[^>]*)?\/>/g, "");
}

export function bookmarkXml(id: number, name: string): string {
  return `<w:bookmarkStart w:id="${id}" w:name="${name}"/><w:bookmarkEnd w:id="${id}"/>`;
}

/** Insert inline XML into the last paragraph of `xml` (e.g. an end bookmark). */
export function appendToLastParagraph(xml: string, inline: string): string {
  const index = xml.lastIndexOf("</w:p>");
  if (index === -1) return xml;
  return `${xml.slice(0, index)}${inline}${xml.slice(index)}`;
}
