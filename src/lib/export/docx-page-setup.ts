import type PizZip from "pizzip";

/**
 * Investigation / MJ QRA templates: A4 portrait, 0.5" left/right.
 * pgSz 11909 − 720 − 720 = 10469.
 */
export const DEFAULT_PORTRAIT_PAGE_WIDTH_DXA = 11909;
export const DEFAULT_PORTRAIT_PAGE_HEIGHT_DXA = 16834;
export const DEFAULT_PAGE_MARGIN_LEFT_DXA = 720;
export const DEFAULT_PAGE_MARGIN_RIGHT_DXA = 720;

/** Half-inch floor: below this, equal-width portrait columns are too cramped. */
export const TABLE_GRID_MIN_COMFORTABLE_COL_DXA = 720;

/** Tables this wide (or wider) always export on a landscape section. */
export const TABLE_LANDSCAPE_MIN_COLUMNS = 8;

export type DocxPageSetup = {
  /** Full `<w:sectPr>…</w:sectPr>` cloned from the template (portrait). */
  portraitSectPr: string;
  /** Same sectPr with pgSz swapped and `w:orient="landscape"`. */
  landscapeSectPr: string;
  portraitContentWidthDxa: number;
  landscapeContentWidthDxa: number;
};

export const DEFAULT_A4_PAGE_SETUP: DocxPageSetup = pageSetupFromParts({
  pageWidthDxa: DEFAULT_PORTRAIT_PAGE_WIDTH_DXA,
  pageHeightDxa: DEFAULT_PORTRAIT_PAGE_HEIGHT_DXA,
  marginLeftDxa: DEFAULT_PAGE_MARGIN_LEFT_DXA,
  marginRightDxa: DEFAULT_PAGE_MARGIN_RIGHT_DXA,
  paperCode: "9",
  restInnerXml:
    `<w:pgMar w:top="720" w:right="720" w:bottom="1008" w:left="720" ` +
    `w:header="720" w:footer="1008" w:gutter="0"/>` +
    `<w:cols w:space="720"/><w:docGrid w:linePitch="272"/>`,
});

function pageSetupFromParts(parts: {
  pageWidthDxa: number;
  pageHeightDxa: number;
  marginLeftDxa: number;
  marginRightDxa: number;
  paperCode?: string;
  restInnerXml: string;
  headerFooterXml?: string;
}): DocxPageSetup {
  const codeAttr = parts.paperCode ? ` w:code="${parts.paperCode}"` : "";
  const headerFooterXml = parts.headerFooterXml ?? "";
  const portraitPgSz =
    `<w:pgSz w:w="${parts.pageWidthDxa}" w:h="${parts.pageHeightDxa}"${codeAttr}/>`;
  const portraitSectPr =
    `<w:sectPr>${headerFooterXml}${portraitPgSz}${parts.restInnerXml}</w:sectPr>`;
  return {
    portraitSectPr,
    landscapeSectPr: toLandscapeSectPr(portraitSectPr),
    portraitContentWidthDxa: Math.max(
      1,
      parts.pageWidthDxa - parts.marginLeftDxa - parts.marginRightDxa
    ),
    landscapeContentWidthDxa: Math.max(
      1,
      Math.max(parts.pageWidthDxa, parts.pageHeightDxa) -
        parts.marginLeftDxa -
        parts.marginRightDxa
    ),
  };
}

/**
 * True when the table has 8+ columns, or when equal-width portrait
 * columns would be narrower than 0.5" on a cramped page.
 */
export function tableNeedsLandscapePage(
  columnCount: number,
  portraitContentWidthDxa: number
): boolean {
  if (columnCount < 2) return false;
  if (columnCount >= TABLE_LANDSCAPE_MIN_COLUMNS) return true;
  return (
    columnCount * TABLE_GRID_MIN_COMFORTABLE_COL_DXA > portraitContentWidthDxa
  );
}

export function sectionBreakParagraphXml(sectPr: string): string {
  return (
    `<w:p><w:pPr>` +
    `<w:spacing w:before="0" w:after="0"/>` +
    `${sectPr}` +
    `</w:pPr></w:p>`
  );
}

export function toLandscapeSectPr(sectPr: string): string {
  return sectPr.replace(/<w:pgSz\b([^>]*)\/>/, (_full, attrs: string) => {
    const width = Number(/w:w="(\d+)"/.exec(attrs)?.[1] ?? DEFAULT_PORTRAIT_PAGE_WIDTH_DXA);
    const height = Number(
      /w:h="(\d+)"/.exec(attrs)?.[1] ?? DEFAULT_PORTRAIT_PAGE_HEIGHT_DXA
    );
    const code = /w:code="([^"]+)"/.exec(attrs)?.[1];
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    const codeAttr = code ? ` w:code="${code}"` : "";
    return `<w:pgSz w:w="${long}" w:h="${short}" w:orient="landscape"${codeAttr}/>`;
  });
}

export function parseDocxPageSetup(documentXml: string): DocxPageSetup | null {
  const matches = [...documentXml.matchAll(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g)];
  const last = matches.at(-1)?.[0];
  if (!last) return null;

  const pgSz = last.match(/<w:pgSz\b([^>]*)\/>/);
  const pgMar = last.match(/<w:pgMar\b([^>]*)\/>/);
  if (!pgSz || !pgMar) return null;

  const pageWidthDxa = Number(/w:w="(\d+)"/.exec(pgSz[1] ?? "")?.[1]);
  const pageHeightDxa = Number(/w:h="(\d+)"/.exec(pgSz[1] ?? "")?.[1]);
  const marginLeftDxa = Number(/w:left="(\d+)"/.exec(pgMar[1] ?? "")?.[1]);
  const marginRightDxa = Number(/w:right="(\d+)"/.exec(pgMar[1] ?? "")?.[1]);
  if (
    ![pageWidthDxa, pageHeightDxa, marginLeftDxa, marginRightDxa].every(
      (n) => Number.isFinite(n) && n > 0
    )
  ) {
    return null;
  }

  return {
    portraitSectPr: last,
    landscapeSectPr: toLandscapeSectPr(last),
    portraitContentWidthDxa: Math.max(1, pageWidthDxa - marginLeftDxa - marginRightDxa),
    landscapeContentWidthDxa: Math.max(
      1,
      Math.max(pageWidthDxa, pageHeightDxa) - marginLeftDxa - marginRightDxa
    ),
  };
}

export function loadDocxPageSetupFromZip(zip: PizZip): DocxPageSetup {
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  return parseDocxPageSetup(xml) ?? DEFAULT_A4_PAGE_SETUP;
}

const TABLE_NAME_TEXT_RE = /^Table\s+\d+\s*[.:]|^Table\s+\d+\.?\s*$/i;
const OOXML_TAG_RE =
  /<(\/?)([A-Za-z_][\w.-]*(?::[\w.-]+)?)((?:\s[^>]*?)?)(\/?)>/g;

/** Split body XML into top-level `w:p` / `w:tbl` / `w:sectPr` elements. */
function splitDocxBodyBlocks(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let name = "";
  for (const m of body.matchAll(OOXML_TAG_RE)) {
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
      if (depth === 0) out.push(body.slice(start, index + whole.length));
    } else if (!selfClose) {
      depth += 1;
    }
  }
  return out;
}

function blockPlainText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => (m[1] ?? "").replaceAll("&amp;", "&").replaceAll("&lt;", "<"))
    .join("")
    .trim();
}

function isSectionBreakParagraph(block: string): boolean {
  return block.startsWith("<w:p") && block.includes("<w:sectPr");
}

function isTableBlock(block: string): boolean {
  return block.startsWith("<w:tbl");
}

function isEmptyParagraph(block: string): boolean {
  return block.startsWith("<w:p") && !blockPlainText(block);
}

function isTableNameParagraph(block: string): boolean {
  return block.startsWith("<w:p") && TABLE_NAME_TEXT_RE.test(blockPlainText(block));
}

function isTableTitleParagraph(block: string): boolean {
  if (!block.startsWith("<w:p")) return false;
  const text = blockPlainText(block);
  if (!text || TABLE_NAME_TEXT_RE.test(text)) return false;
  return !/^\d+(\.\d+)*(\s|$)/.test(text);
}

function nextContentIndex(blocks: readonly string[], from: number): number {
  let i = from;
  while (i < blocks.length && isEmptyParagraph(blocks[i]!)) i += 1;
  return i;
}

function tableHeaderRunStart(
  blocks: readonly string[],
  breakIndex: number
): number {
  let i = breakIndex;
  const skipEmpty = () => {
    while (i > 0 && isEmptyParagraph(blocks[i - 1]!)) i -= 1;
  };
  skipEmpty();
  if (i > 0 && isTableTitleParagraph(blocks[i - 1]!)) {
    const afterTitle = i;
    i -= 1;
    skipEmpty();
    if (!(i > 0 && isTableNameParagraph(blocks[i - 1]!))) {
      i = afterTitle;
    }
  }
  while (i > 0 && isTableNameParagraph(blocks[i - 1]!)) {
    i -= 1;
    skipEmpty();
  }
  return i;
}

/**
 * Word `sectPr` describes the section that just ended. Landscape breaks
 * emitted immediately before `<w:tbl>` leave the table name/title on the
 * previous (portrait) page. Slide those breaks to before the caption run.
 */
export function moveSectionBreakBeforeTableCaptions(documentXml: string): string {
  const open = "<w:body>";
  const bodyStart = documentXml.indexOf(open);
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  if (bodyStart === -1 || bodyEnd === -1) return documentXml;
  const start = bodyStart + open.length;
  const blocks = splitDocxBodyBlocks(documentXml.slice(start, bodyEnd));
  const out = [...blocks];
  for (let i = 0; i < out.length; i++) {
    if (!isSectionBreakParagraph(out[i]!)) continue;
    const tableAt = nextContentIndex(out, i + 1);
    if (!isTableBlock(out[tableAt] ?? "")) continue;
    const headerStart = tableHeaderRunStart(out, i);
    if (headerStart >= i) continue;
    const [breakBlock] = out.splice(i, 1);
    out.splice(headerStart, 0, breakBlock!);
    i = tableAt;
  }
  return (
    documentXml.slice(0, start) + out.join("") + documentXml.slice(bodyEnd)
  );
}

export function applyTableCaptionSectionBreaksToDocxZip(zip: PizZip): void {
  const file = zip.file("word/document.xml");
  if (!file) return;
  zip.file("word/document.xml", moveSectionBreakBeforeTableCaptions(file.asText()));
}
