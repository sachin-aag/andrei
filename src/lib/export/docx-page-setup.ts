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

/** True when equal-width portrait columns would be narrower than 0.5". */
export function tableNeedsLandscapePage(
  columnCount: number,
  portraitContentWidthDxa: number
): boolean {
  if (columnCount < 2) return false;
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
