import type { JSONContent } from "@tiptap/core";

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

const DEFAULT_RUN_FONT = "Times New Roman";
const DEFAULT_RUN_SIZE_HALF_POINTS = "24";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapParagraph(text: string): string {
  return `<w:p><w:r>${runProperties()}<w:t xml:space="preserve">${escapeXml(
    text
  )}</w:t></w:r></w:p>`;
}

function paragraphToXml(
  node: JSONContent,
  bold = false,
  paragraphAlign?: string | null
): string {
  const runs = textNodesToRuns(node.content ?? [], bold);
  const jc =
    paragraphAlign === "left" ||
    paragraphAlign === "center" ||
    paragraphAlign === "right"
      ? `<w:pPr><w:jc w:val="${paragraphAlign}"/></w:pPr>`
      : "";
  if (!runs) return `<w:p>${jc}</w:p>`;
  return `<w:p>${jc}${runs}</w:p>`;
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
  const parts: string[] = [];
  for (const item of node.content ?? []) {
    if (item.type === "listItem") {
      for (const child of item.content ?? []) {
        parts.push(paragraphToXml(child));
      }
    }
  }
  return parts.join("");
}

function tableToXml(node: JSONContent): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";

  const colCount = Math.max(1, getLogicalColumnCount(rows));

  // Table properties: borders + auto layout
  const tblPr = `<w:tblPr>
<w:tblStyle w:val="TableGrid"/>
<w:tblW w:w="0" w:type="auto"/>
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

  // Grid columns (equal width)
  const gridCols = Array.from({ length: colCount })
    .map(() => '<w:gridCol w:w="2000"/>')
    .join("");
  const tblGrid = `<w:tblGrid>${gridCols}</w:tblGrid>`;

  const activeMerges: (ActiveRowMerge | null)[] = [];
  const rowsXml = rows
    .map((row, rowIdx) =>
      tableRowToXml(row, rowIdx === 0, activeMerges, colCount)
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
  activeMerges: (ActiveRowMerge | null)[],
  colCount: number
): string {
  const cells = row.content ?? [];
  let trPr = "";
  if (isHeader) {
    trPr = "<w:trPr><w:tblHeader/></w:trPr>";
  }
  const consumedMerges = new Set<ActiveRowMerge>();
  const cellsXml: string[] = [];
  let col = 0;

  const emitActiveMerge = () => {
    const merge = activeMerges[col];
    if (!merge) return false;

    const isMergeStart = col === 0 || activeMerges[col - 1] !== merge;
    if (isMergeStart) {
      cellsXml.push(
        tableCellToXml(merge.cell, isHeader, {
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
      tableCellToXml(cell, isHeader, {
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
      cellsXml.push(tableCellToXml({ type: "tableCell", content: [] }, isHeader));
      col++;
    }
  }

  consumeActiveMerges(activeMerges, consumedMerges);

  return `<w:tr>${trPr}${cellsXml.join("")}</w:tr>`;
}

function tableCellToXml(
  cell: JSONContent,
  isHeader: boolean,
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

  const paragraphs = options.empty ? [] : cell.content ?? [];
  const content = paragraphs
    .map((p) => {
      if (p.type === "paragraph") {
        return paragraphToXml(p, isHeader, hAlign ?? null);
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
