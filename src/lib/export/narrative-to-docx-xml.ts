import type { JSONContent } from "@tiptap/core";
import { wordNumIdForList } from "@/lib/tiptap/list-style";
import { linesToDoc } from "@/lib/tiptap/rich-text";

/**
 * Convert a Tiptap JSONContent narrative document to OOXML (Word XML).
 * Paragraphs become `<w:p>` elements; table nodes become `<w:tbl>` with
 * proper borders and header-row shading. Returns raw XML suitable for
 * injection via docxtemplater's `{@rawXml}` syntax.
 */
export function narrativeToDocxXml(
  doc: JSONContent | undefined | null
): string {
  if (!doc || !doc.content?.length) {
    return wrapParagraph("Not Applicable");
  }

  const parts: string[] = [];

  for (const node of doc.content) {
    if (node.type === "table") {
      parts.push(tableToXml(node));
    } else if (node.type === "paragraph") {
      parts.push(paragraphToXml(node));
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      parts.push(listToXml(node));
    } else if (node.type === "heading") {
      parts.push(paragraphToXml(node, true));
    } else {
      // Fallback: treat as paragraph
      parts.push(paragraphToXml(node));
    }
  }

  const result = parts.join("");
  return result || wrapParagraph("Not Applicable");
}

/** Plain multiline text (markdown-style list markers) → Word XML. */
export function plainTextToDocxXml(text: string | undefined | null): string {
  const trimmed = text?.trim();
  if (!trimmed) return wrapParagraph("Not Applicable");
  return narrativeToDocxXml(linesToDoc(trimmed));
}

const DEFAULT_RUN_FONT = "Times New Roman";
const DEFAULT_RUN_SIZE_HALF_POINTS = "24";

/**
 * Max table grid width in dxa (twips), matching investigation template body:
 * pgSz 11909 − left/right pgMar 720 each = 10469.
 */
const TABLE_GRID_TOTAL_MAX_DXA = 10469;

/** Minimum per-column width in dxa so cells stay readable after scaling. */
const TABLE_GRID_MIN_COL_DXA = 180;

function normalizeGridColWidths(widths: number[], maxTotalDxa: number): number[] {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum <= maxTotalDxa) return widths;

  const scale = maxTotalDxa / sum;
  const scaled = widths.map((w) =>
    Math.max(TABLE_GRID_MIN_COL_DXA, Math.round(w * scale))
  );
  const scaledSum = scaled.reduce((a, b) => a + b, 0);
  const drift = maxTotalDxa - scaledSum;
  if (drift !== 0 && scaled.length > 0) {
    const last = scaled.length - 1;
    scaled[last] = Math.max(
      TABLE_GRID_MIN_COL_DXA,
      scaled[last]! + drift
    );
  }
  return scaled;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paragraphJustification(align?: string | null): string {
  const val =
    align === "center" || align === "right" ? align : "left";
  return `<w:jc w:val="${val}"/>`;
}

function paragraphProperties(
  align?: string | null,
  numId?: number | null,
  keepNext?: boolean
): string {
  const jc = paragraphJustification(align);
  const keep = keepNext ? "<w:keepNext/>" : "";
  if (numId) {
    return `<w:pPr>${keep}${jc}<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
  }
  return `<w:pPr>${keep}${jc}</w:pPr>`;
}

function wrapParagraph(text: string): string {
  return `<w:p>${paragraphProperties()}<w:r>${runProperties()}<w:t xml:space="preserve">${escapeXml(
    text
  )}</w:t></w:r></w:p>`;
}

function paragraphToXml(
  node: JSONContent,
  bold = false,
  paragraphAlign?: string | null,
  numId?: number | null,
  keepNext = false
): string {
  const runs = textNodesToRuns(node.content ?? [], bold);
  const pPr = paragraphProperties(paragraphAlign, numId, keepNext);
  if (!runs) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function textNodesToRuns(
  nodes: JSONContent[],
  forceBold = false
): string {
  const parts: string[] = [];

  for (const child of nodes) {
    if (child.type === "text") {
      const text = child.text ?? "";
      if (!text) continue;
      const marks = child.marks ?? [];
      const isBold =
        forceBold || marks.some((m) => m.type === "bold");
      const isItalic = marks.some((m) => m.type === "italic");

      const rPr = runProperties({ bold: isBold, italic: isItalic });

      // Handle line breaks within text
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          parts.push(`<w:r>${rPr}<w:br/></w:r>`);
        }
        if (lines[i]) {
          parts.push(
            `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(lines[i]!)}</w:t></w:r>`
          );
        }
      }
    } else if (child.type === "hardBreak") {
      parts.push(`<w:r>${runProperties()}<w:br/></w:r>`);
    }
  }

  return parts.join("");
}

function runProperties(options: { bold?: boolean; italic?: boolean } = {}): string {
  let rPr =
    `<w:rPr><w:rFonts w:ascii="${DEFAULT_RUN_FONT}" w:eastAsia="${DEFAULT_RUN_FONT}" ` +
    `w:hAnsi="${DEFAULT_RUN_FONT}" w:cs="${DEFAULT_RUN_FONT}"/>` +
    `<w:sz w:val="${DEFAULT_RUN_SIZE_HALF_POINTS}"/>` +
    `<w:szCs w:val="${DEFAULT_RUN_SIZE_HALF_POINTS}"/>`;
  if (options.bold) rPr += "<w:b/>";
  if (options.italic) rPr += "<w:i/>";
  rPr += "</w:rPr>";
  return rPr;
}

function listToXml(node: JSONContent): string {
  const listType = node.type === "orderedList" ? "orderedList" : "bulletList";
  const numId = wordNumIdForList(
    listType,
    (node.attrs?.listStyle as string | undefined) ?? null
  );
  const parts: string[] = [];
  for (const item of node.content ?? []) {
    if (item.type === "listItem") {
      for (const child of item.content ?? []) {
        parts.push(paragraphToXml(child, false, null, numId));
      }
    }
  }
  return parts.join("");
}

function tableToXml(node: JSONContent): string {
  const inner = buildInnerTableXml(node);
  if (!inner) return "";

  // Wrap the real table inside a single-row, single-cell, borderless table
  // marked <w:cantSplit/>. Word treats the wrapper row as atomic, which keeps
  // the inner table together across page breaks. If the wrapper row is taller
  // than one page Word ignores cantSplit and splits the inner table anyway,
  // which is the desired escape hatch for genuinely oversize tables.
  const wrapperTblPr = `<w:tblPr>` +
    `<w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="nil"/>` +
    `<w:left w:val="nil"/>` +
    `<w:bottom w:val="nil"/>` +
    `<w:right w:val="nil"/>` +
    `<w:insideH w:val="nil"/>` +
    `<w:insideV w:val="nil"/>` +
    `</w:tblBorders>` +
    `<w:tblCellMar>` +
    `<w:top w:w="0" w:type="dxa"/>` +
    `<w:left w:w="0" w:type="dxa"/>` +
    `<w:bottom w:w="0" w:type="dxa"/>` +
    `<w:right w:w="0" w:type="dxa"/>` +
    `</w:tblCellMar>` +
    `<w:tblLook w:val="04A0" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>` +
    `</w:tblPr>`;
  const wrapperGrid = `<w:tblGrid><w:gridCol w:w="${TABLE_GRID_TOTAL_MAX_DXA}"/></w:tblGrid>`;
  const wrapperCell =
    `<w:tc>` +
    `<w:tcPr><w:tcW w:w="5000" w:type="pct"/>` +
    `<w:tcMar>` +
    `<w:top w:w="0" w:type="dxa"/>` +
    `<w:left w:w="0" w:type="dxa"/>` +
    `<w:bottom w:w="0" w:type="dxa"/>` +
    `<w:right w:w="0" w:type="dxa"/>` +
    `</w:tcMar>` +
    `</w:tcPr>` +
    inner +
    // Word requires a trailing paragraph in every cell. Zero spacing keeps
    // the wrapper from adding visible whitespace below the real table.
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>` +
    `</w:tc>`;
  const wrapperRow = `<w:tr><w:trPr><w:cantSplit/></w:trPr>${wrapperCell}</w:tr>`;
  return `<w:tbl>${wrapperTblPr}${wrapperGrid}${wrapperRow}</w:tbl>`;
}

function buildInnerTableXml(node: JSONContent): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";

  const colCount = Math.max(1, getLogicalColumnCount(rows));

  const colWidthsRaw = node.attrs?.colWidths as unknown;
  let storedWidths: number[] | null = null;
  if (Array.isArray(colWidthsRaw) && colWidthsRaw.length === colCount) {
    const nums = colWidthsRaw.filter(
      (x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0
    );
    if (nums.length === colCount) storedWidths = nums;
  }

  const perColFallback = Math.max(
    360,
    Math.floor(TABLE_GRID_TOTAL_MAX_DXA / colCount)
  );
  const rawWidths = storedWidths
    ? storedWidths
    : Array.from({ length: colCount }, () => perColFallback);
  const colWidths = normalizeGridColWidths(rawWidths, TABLE_GRID_TOTAL_MAX_DXA);
  const gridTotalDxa = colWidths.reduce((a, b) => a + b, 0);
  const gridColXmlParts = colWidths.map(
    (w) => `<w:gridCol w:w="${Math.round(w)}"/>`
  );
  const tblGrid = `<w:tblGrid>${gridColXmlParts.join("")}</w:tblGrid>`;

  // Nested inside the keep-together wrapper: explicit dxa width prevents Word
  // from honoring an oversized imported tblGrid sum and clipping the right edge.
  const tblPr = `<w:tblPr>
<w:tblStyle w:val="TableGrid"/>
<w:tblW w:w="${gridTotalDxa}" w:type="dxa"/>
<w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
</w:tblBorders>
<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
</w:tblPr>`;

  const activeMerges: (ActiveRowMerge | null)[] = [];
  const rowsXml = rows
    .map((row, rowIdx) =>
      tableRowToXml(
        row,
        rowIdx === 0,
        rowIdx === rows.length - 1,
        activeMerges,
        colCount
      )
    )
    .join("");

  return `<w:tbl>${tblPr}${tblGrid}${rowsXml}</w:tbl>`;
}

type ActiveRowMerge = {
  cell: JSONContent;
  colspan: number;
  remainingRows: number;
};

function tableRowToXml(
  row: JSONContent,
  isHeader: boolean,
  isLastRow: boolean,
  activeMerges: (ActiveRowMerge | null)[],
  colCount: number
): string {
  const cells = row.content ?? [];
  // Always set cantSplit so a single row never breaks mid-content across pages.
  // Header rows additionally repeat at the top of each page if the table spills.
  let trPr = "<w:trPr><w:cantSplit/>";
  if (isHeader) trPr += "<w:tblHeader/>";
  trPr += "</w:trPr>";
  const consumedMerges = new Set<ActiveRowMerge>();
  const cellsXml: string[] = [];
  let col = 0;

  const emitActiveMerge = () => {
    const merge = activeMerges[col];
    if (!merge) return false;

    const isMergeStart = col === 0 || activeMerges[col - 1] !== merge;
    if (isMergeStart) {
      cellsXml.push(
        tableCellToXml(merge.cell, isHeader, isLastRow, {
          colspan: merge.colspan,
          vMerge: "continue",
          empty: true,
        })
      );
      consumedMerges.add(merge);
      col += merge.colspan;
    } else {
      col++;
    }

    return true;
  };

  for (const cell of cells) {
    while (col < colCount && activeMerges[col]) {
      emitActiveMerge();
    }

    const colspan = getSpan(cell, "colspan");
    const rowspan = getSpan(cell, "rowspan");
    cellsXml.push(
      tableCellToXml(cell, isHeader, isLastRow, {
        colspan,
        vMerge: rowspan > 1 ? "restart" : null,
      })
    );

    if (rowspan > 1) {
      const merge: ActiveRowMerge = {
        cell,
        colspan,
        remainingRows: rowspan - 1,
      };
      for (let i = 0; i < colspan; i++) {
        activeMerges[col + i] = merge;
      }
    }

    col += colspan;
  }

  while (col < colCount) {
    if (!emitActiveMerge()) {
      cellsXml.push(
        tableCellToXml({ type: "tableCell", content: [] }, isHeader, isLastRow)
      );
      col++;
    }
  }

  consumeActiveMerges(activeMerges, consumedMerges);

  return `<w:tr>${trPr}${cellsXml.join("")}</w:tr>`;
}

function tableCellToXml(
  cell: JSONContent,
  isHeader: boolean,
  isLastRow: boolean,
  options: {
    colspan?: number;
    vMerge?: "restart" | "continue" | null;
    empty?: boolean;
  } = {}
): string {
  const hAlign = cell.attrs?.align as string | undefined;
  const vAttr = cell.attrs?.verticalAlign as string | undefined;
  const vWord =
    vAttr === "middle" ? "center" : vAttr === "top" || vAttr === "bottom" ? vAttr : null;

  let tcPr = "<w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/>";
  if (options.colspan && options.colspan > 1) {
    tcPr += `<w:gridSpan w:val="${options.colspan}"/>`;
  }
  if (options.vMerge) {
    tcPr += `<w:vMerge w:val="${options.vMerge}"/>`;
  }
  if (isHeader) {
    tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>';
  }
  if (vWord) {
    tcPr += `<w:vAlign w:val="${vWord}"/>`;
  }
  tcPr += "</w:tcPr>";

  // keepNext on every paragraph in every non-last row asks Word to keep the
  // table together when it fits on a single page, while still allowing a
  // genuine split when the table is too tall for one page.
  const keepNext = !isLastRow;
  const paragraphs = options.empty ? [] : cell.content ?? [];
  const content = paragraphs
    .map((p) => {
      if (p.type === "paragraph") {
        return paragraphToXml(p, isHeader, hAlign ?? null, null, keepNext);
      }
      return paragraphToXml(p, false, hAlign ?? null, null, keepNext);
    })
    .join("");

  // Word requires at least one paragraph in each cell
  const cellContent =
    content ||
    (keepNext ? `<w:p>${paragraphProperties(null, null, true)}</w:p>` : "<w:p/>");
  return `<w:tc>${tcPr}${cellContent}</w:tc>`;
}

function getLogicalColumnCount(rows: JSONContent[]): number {
  const activeMerges: (ActiveRowMerge | null)[] = [];
  let maxCols = 0;

  for (const row of rows) {
    const consumedMerges = new Set<ActiveRowMerge>();
    let col = 0;

    const skipActiveMerge = () => {
      const merge = activeMerges[col];
      if (!merge) return false;
      const isMergeStart = col === 0 || activeMerges[col - 1] !== merge;
      if (isMergeStart) {
        consumedMerges.add(merge);
        col += merge.colspan;
      } else {
        col++;
      }
      return true;
    };

    for (const cell of row.content ?? []) {
      while (activeMerges[col]) skipActiveMerge();

      const colspan = getSpan(cell, "colspan");
      const rowspan = getSpan(cell, "rowspan");
      if (rowspan > 1) {
        const merge: ActiveRowMerge = {
          cell,
          colspan,
          remainingRows: rowspan - 1,
        };
        for (let i = 0; i < colspan; i++) {
          activeMerges[col + i] = merge;
        }
      }
      col += colspan;
    }

    while (activeMerges[col]) skipActiveMerge();
    if (col > maxCols) maxCols = col;
    consumeActiveMerges(activeMerges, consumedMerges);
  }

  return maxCols;
}

function consumeActiveMerges(
  activeMerges: (ActiveRowMerge | null)[],
  consumedMerges: Set<ActiveRowMerge>
) {
  for (const merge of consumedMerges) {
    merge.remainingRows -= 1;
    if (merge.remainingRows <= 0) {
      for (let i = 0; i < activeMerges.length; i++) {
        if (activeMerges[i] === merge) activeMerges[i] = null;
      }
    }
  }
}

function getSpan(cell: JSONContent, key: "colspan" | "rowspan"): number {
  const raw = (cell.attrs as { colspan?: number; rowspan?: number } | undefined)?.[key];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1) return Math.floor(raw);
  return 1;
}
