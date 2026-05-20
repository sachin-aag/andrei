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

/** Target total grid width in dxa (~6.5" usable on Letter) — avoids overrun when widths unknown. */
const TABLE_GRID_TOTAL_FALLBACK_DXA = 9360;

/** Chain keepNext on all rows so Word moves the whole table if it does not fit on one page. */
const TABLE_KEEP_TOGETHER_MAX_ROWS = 8;

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
  numId?: number | null
): string {
  const jc = paragraphJustification(align);
  if (numId) {
    return `<w:pPr>${jc}<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
  }
  return `<w:pPr>${jc}</w:pPr>`;
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
  numId?: number | null
): string {
  const runs = textNodesToRuns(node.content ?? [], bold);
  const pPr = paragraphProperties(paragraphAlign, numId);
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
    Math.floor(TABLE_GRID_TOTAL_FALLBACK_DXA / colCount)
  );
  const gridColXmlParts = storedWidths
    ? storedWidths.map((w) => `<w:gridCol w:w="${Math.round(w)}"/>`)
    : Array.from({ length: colCount }).map(
        () => `<w:gridCol w:w="${perColFallback}"/>`
      );
  const tblGrid = `<w:tblGrid>${gridColXmlParts.join("")}</w:tblGrid>`;

  const tblPr = `<w:tblPr>
<w:tblStyle w:val="TableGrid"/>
<w:tblW w:w="5000" w:type="pct"/>
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
    .map((row, rowIdx) => tableRowToXml(row, rowIdx, rows, activeMerges, colCount))
    .join("");

  return `<w:tbl>${tblPr}${tblGrid}${rowsXml}</w:tbl>`;
}

function isRepeatingHeaderRow(row: JSONContent): boolean {
  const cells = row.content ?? [];
  if (cells.length === 0) return false;
  return cells.every((c) => c.type === "tableHeader");
}

/** First row index that is body/data (after title + column-header band). */
function headerBandEndIndex(rows: JSONContent[]): number {
  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    if (isRepeatingHeaderRow(row)) {
      i++;
      continue;
    }
    if (i + 1 < rows.length && isRepeatingHeaderRow(rows[i + 1]!)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

function tableRowProperties(
  rowIdx: number,
  rows: JSONContent[],
  row: JSONContent
): string {
  const parts: string[] = [];
  if (isRepeatingHeaderRow(row)) {
    parts.push("<w:tblHeader/>");
  }
  parts.push("<w:cantSplit/>");

  const keepTogether = rows.length <= TABLE_KEEP_TOGETHER_MAX_ROWS;
  const keepWithNext = keepTogether
    ? rowIdx < rows.length - 1
    : rowIdx < headerBandEndIndex(rows);

  if (keepWithNext) {
    parts.push("<w:keepNext/>");
  }

  return `<w:trPr>${parts.join("")}</w:trPr>`;
}

type ActiveRowMerge = {
  cell: JSONContent;
  colspan: number;
  remainingRows: number;
};

function tableRowToXml(
  row: JSONContent,
  rowIdx: number,
  rows: JSONContent[],
  activeMerges: (ActiveRowMerge | null)[],
  colCount: number
): string {
  const trPr = tableRowProperties(rowIdx, rows, row);
  const cells = row.content ?? [];
  const consumedMerges = new Set<ActiveRowMerge>();
  const cellsXml: string[] = [];
  let col = 0;

  const emitActiveMerge = () => {
    const merge = activeMerges[col];
    if (!merge) return false;

    const isMergeStart = col === 0 || activeMerges[col - 1] !== merge;
    if (isMergeStart) {
      cellsXml.push(
        tableCellToXml(merge.cell, {
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
      tableCellToXml(cell, {
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
      cellsXml.push(tableCellToXml({ type: "tableCell", content: [] }));
      col++;
    }
  }

  consumeActiveMerges(activeMerges, consumedMerges);

  return `<w:tr>${trPr}${cellsXml.join("")}</w:tr>`;
}

function tableCellToXml(
  cell: JSONContent,
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
  if (cell.type === "tableHeader") {
    tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>';
  }
  if (vWord) {
    tcPr += `<w:vAlign w:val="${vWord}"/>`;
  }
  tcPr += "</w:tcPr>";

  const paragraphs = options.empty ? [] : cell.content ?? [];
  const content = paragraphs
    .map((p) => {
      if (p.type === "paragraph") {
        return paragraphToXml(
          p,
          cell.type === "tableHeader",
          hAlign ?? null
        );
      }
      return paragraphToXml(p, false, hAlign ?? null);
    })
    .join("");

  // Word requires at least one paragraph in each cell
  const cellContent = content || "<w:p/>";
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
