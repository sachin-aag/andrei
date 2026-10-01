import {
  childElements,
  elementText,
  findChild,
  isElement,
  setParagraphText,
  splitTopLevelElements,
  withChildren,
} from "./ooxml";
import { QSR_INDEX_ENTRIES, type QsrIndexEntry } from "./slots";

/**
 * Cover, signatures, revision history, and Index are fixed chrome on this
 * landscape form. Body content (Introduction onward) always starts on page 5.
 */
export const QSR_BODY_START_PAGE = 5;

/** Usable body band below the repeating header table and above the footer. */
const PAGE_BODY_TWIPS = 7400;
const DEFAULT_LINE_TWIPS = 360;
const CHARS_PER_LINE = 90;

function paragraphHeight(p: string): number {
  const pPr = findChild(p, "w:pPr") ?? "";
  const line = Number(/w:line="(\d+)"/.exec(pPr)?.[1] ?? DEFAULT_LINE_TWIPS);
  const before = Number(/w:before="(\d+)"/.exec(pPr)?.[1] ?? 0);
  const after = Number(/w:after="(\d+)"/.exec(pPr)?.[1] ?? 0);
  const chars = elementText(p).length || 1;
  return before + after + Math.max(1, Math.ceil(chars / CHARS_PER_LINE)) * line;
}

function rowHeight(tr: string): number {
  const explicit = /<w:trHeight[^>]*w:val="(\d+)"/.exec(tr);
  if (explicit) return Number(explicit[1]);
  const cells = childElements(tr).filter((c) => isElement(c, "w:tc"));
  let max = DEFAULT_LINE_TWIPS;
  for (const cell of cells) {
    const height = childElements(cell)
      .filter((c) => isElement(c, "w:p"))
      .reduce((sum, p) => sum + paragraphHeight(p), 0);
    if (height > max) max = height;
  }
  return max;
}

function bookmarkNames(xml: string): string[] {
  return [...xml.matchAll(/<w:bookmarkStart\b[^>]*w:name="(_Qsr[^"]+)"/g)].map(
    (m) => m[1]
  );
}

type TableLayout = { headerTwips: number; bodyTwips: number[] };

function tableLayout(tbl: string): TableLayout {
  const rows = childElements(tbl).filter((c) => isElement(c, "w:tr"));
  const headerRows = rows.filter((row) => row.includes("<w:tblHeader"));
  const bodyRows = headerRows.length
    ? rows.filter((row) => !row.includes("<w:tblHeader"))
    : rows;
  return {
    headerTwips: headerRows.reduce((sum, row) => sum + rowHeight(row), 0),
    bodyTwips: bodyRows.map(rowHeight),
  };
}

/**
 * Page of each `_Qsr*` bookmark after a filled export. Front matter is page 1–4;
 * `_QsrIdx_1` (Introduction) starts page 5 and later content is stacked by
 * paragraph/row height in the landscape body band.
 */
export function estimateQsrBookmarkPages(
  bodyElements: readonly string[]
): Map<string, number> {
  const pages = new Map<string, number>();
  const intro = bodyElements.findIndex((el) =>
    bookmarkNames(el).includes("_QsrIdx_1")
  );
  if (intro === -1) return pages;

  let page = QSR_BODY_START_PAGE;
  let y = 0;
  const record = (xml: string) => {
    for (const name of bookmarkNames(xml)) {
      if (!pages.has(name)) pages.set(name, page);
    }
  };
  const wrapIfNeeded = (height: number, repeatingHeader = 0): void => {
    if (y > 0 && y + height > PAGE_BODY_TWIPS) {
      page += 1;
      y = repeatingHeader;
    }
  };

  for (let i = intro; i < bodyElements.length; i += 1) {
    const el = bodyElements[i]!;
    record(el);
    if (isElement(el, "w:sectPr")) continue;
    if (isElement(el, "w:p")) {
      const height = paragraphHeight(el);
      wrapIfNeeded(height);
      y += height;
      continue;
    }
    if (!isElement(el, "w:tbl")) {
      wrapIfNeeded(DEFAULT_LINE_TWIPS);
      y += DEFAULT_LINE_TWIPS;
      continue;
    }
    const { headerTwips, bodyTwips } = tableLayout(el);
    wrapIfNeeded(headerTwips + (bodyTwips[0] ?? 0));
    y += headerTwips;
    for (const height of bodyTwips) {
      wrapIfNeeded(height, headerTwips);
      y += height;
    }
  }
  return pages;
}

export function formatQsrIndexPage(
  entry: QsrIndexEntry,
  pages: Map<string, number>
): string {
  const start = pages.get(entry.start);
  if (start === undefined) return "";
  if (!entry.end) return String(start);
  const end = pages.get(entry.end);
  if (end === undefined || end <= start) return String(start);
  return `${start}-${end}`;
}

function isIndexTable(tbl: string): boolean {
  const header = childElements(tbl).find((c) => isElement(c, "w:tr"));
  if (!header) return false;
  const text = elementText(header);
  return text.includes("Sr. No.") && text.includes("Page No");
}

function setCellText(tc: string, text: string): string {
  const p = childElements(tc).find((c) => isElement(c, "w:p"));
  if (!p) return tc;
  return withChildren(
    tc,
    childElements(tc).map((child) =>
      isElement(child, "w:p") ? setParagraphText(child, text) : child
    )
  );
}

function fillIndexTable(tbl: string, pages: Map<string, number>): string {
  let rowIndex = -1;
  return withChildren(
    tbl,
    childElements(tbl).map((child) => {
      if (!isElement(child, "w:tr")) return child;
      rowIndex += 1;
      if (rowIndex === 0) return child;
      const entry = QSR_INDEX_ENTRIES[rowIndex - 1];
      if (!entry) return child;
      const label = formatQsrIndexPage(entry, pages);
      let cell = -1;
      return withChildren(
        child,
        childElements(child).map((tc) => {
          if (!isElement(tc, "w:tc")) return tc;
          cell += 1;
          return cell === 2 ? setCellText(tc, label) : tc;
        })
      );
    })
  );
}

/** Replace Index PAGEREF fields with the page numbers of this export. */
export function fillQsrIndexPageNumbers(documentXml: string): string {
  const open = "<w:body>";
  const bodyStart = documentXml.indexOf(open);
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  if (bodyStart === -1 || bodyEnd === -1) return documentXml;
  const start = bodyStart + open.length;
  const els = splitTopLevelElements(documentXml.slice(start, bodyEnd));
  const pages = estimateQsrBookmarkPages(els);
  const out = els.map((el) =>
    isElement(el, "w:tbl") && isIndexTable(el) ? fillIndexTable(el, pages) : el
  );
  return `${documentXml.slice(0, start)}${out.join("")}${documentXml.slice(bodyEnd)}`;
}
