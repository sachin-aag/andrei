import PizZip from "pizzip";

const RELS_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const CHART_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const WORKSHEET_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const CHART_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const DRAWING_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.drawing+xml";

/** 1 cm = 360_000 EMUs. */
export const EMU_PER_CM = 360000;

export type ExcelChartKind =
  | "scatter"
  | "line"
  | "area"
  | "column"
  | "columnStacked"
  | "columnLine";

export type ExcelCellRange = {
  sheetName: string;
  /** 0-based column. */
  col0: number;
  /** 1-based inclusive data start (not the header). */
  rowStart: number;
  /** 1-based inclusive data end. */
  rowEnd: number;
  cache: Array<number | string | null>;
};

export type ExcelChartSeries = {
  name: string;
  color: string;
  vals: ExcelCellRange;
  /** Scatter X values. */
  x?: ExcelCellRange;
  /** Category axis labels or numeric cats. */
  cats?: ExcelCellRange;
  errPlus?: ExcelCellRange;
  errMinus?: ExcelCellRange;
  /** Scatter connecting line. */
  scatterStyle?: "marker" | "line" | "lineMarker";
  dash?: boolean;
  marker?: boolean;
  noLine?: boolean;
  /** Invisible stacked-column base. */
  hiddenFill?: boolean;
  /** Place this series on the line chart of a column+line combo. */
  asLine?: boolean;
};

export type ExcelNativeChart = {
  title: string;
  kind: ExcelChartKind;
  xAxisTitle?: string;
  yAxisTitle?: string;
  xMin?: number | null;
  xMax?: number | null;
  yMin?: number | null;
  yMax?: number | null;
  series: ExcelChartSeries[];
  /** 0-based worksheet row for the top-left of the drawing. */
  anchorRow: number;
  /** 0-based worksheet column. */
  anchorCol: number;
  widthEmu: number;
  heightEmu: number;
};

export type SheetChartPlan = {
  sheetName: string;
  charts: ExcelNativeChart[];
};

export function colLetter(col0: number): string {
  let n = col0 + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function quotedSheetName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

export function a1Range(range: ExcelCellRange): string {
  const start = `$${colLetter(range.col0)}$${range.rowStart}`;
  const end = `$${colLetter(range.col0)}$${range.rowEnd}`;
  return `${quotedSheetName(range.sheetName)}!${start}:${end}`;
}

export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function rgbHex(color: string): string {
  return color.replace(/^#/, "").toUpperCase();
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numLiteral(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}

function cacheXml(
  range: ExcelCellRange,
  kind: "num" | "str"
): string {
  const formula = escapeXml(a1Range(range));
  const pts = range.cache
    .map((value, idx) => {
      if (value == null || value === "") return null;
      if (kind === "num") {
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        return `<c:pt idx="${idx}"><c:v>${numLiteral(value)}</c:v></c:pt>`;
      }
      return `<c:pt idx="${idx}"><c:v>${escapeXml(String(value))}</c:v></c:pt>`;
    })
    .filter((pt): pt is string => pt != null);
  const cacheName = kind === "num" ? "numCache" : "strCache";
  const format =
    kind === "num" ? "<c:formatCode>General</c:formatCode>" : "";
  return `<c:${kind}Ref><c:f>${formula}</c:f><c:${cacheName}>${format}<c:ptCount val="${range.cache.length}"/>${pts.join("")}</c:${cacheName}></c:${kind}Ref>`;
}

function catsXml(range: ExcelCellRange): string {
  const numeric = range.cache.every(
    (value) => value == null || value === "" || typeof value === "number"
  );
  return `<c:cat>${cacheXml(range, numeric ? "num" : "str")}</c:cat>`;
}

function lineProps(series: ExcelChartSeries): string {
  const color = rgbHex(series.color);
  if (series.noLine || series.scatterStyle === "marker") {
    return `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>`;
  }
  const dash = series.dash ? `<a:prstDash val="dash"/>` : "";
  return `<c:spPr><a:ln w="${series.dash ? 12700 : 19050}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${dash}</a:ln></c:spPr>`;
}

function markerXml(series: ExcelChartSeries): string {
  const color = rgbHex(series.color);
  const show =
    series.marker === true ||
    series.scatterStyle === "marker" ||
    series.scatterStyle === "lineMarker";
  if (!show) {
    return `<c:marker><c:symbol val="none"/></c:marker>`;
  }
  return `<c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`;
}

function solidFill(series: ExcelChartSeries): string {
  if (series.hiddenFill) {
    return `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>`;
  }
  const color = rgbHex(series.color);
  return `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
}

function errBarsXml(series: ExcelChartSeries): string {
  if (!series.errPlus || !series.errMinus) return "";
  return `<c:errBars><c:errDir val="y"/><c:errBarType val="both"/><c:errValType val="cust"/><c:noEndCap val="0"/><c:plus>${cacheXml(series.errPlus, "num")}</c:plus><c:minus>${cacheXml(series.errMinus, "num")}</c:minus></c:errBars>`;
}

function seriesTx(name: string): string {
  return `<c:tx><c:v>${escapeXml(name)}</c:v></c:tx>`;
}

function scatterSerXml(series: ExcelChartSeries, idx: number): string {
  const x = series.x ?? series.cats;
  if (!x) return "";
  const style = series.scatterStyle ?? "marker";
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${seriesTx(series.name)}${lineProps({ ...series, scatterStyle: style })}${markerXml({ ...series, scatterStyle: style })}<c:xVal>${cacheXml(x, "num")}</c:xVal><c:yVal>${cacheXml(series.vals, "num")}</c:yVal>${errBarsXml(series)}<c:smooth val="0"/></c:ser>`;
}

function catValSerXml(
  series: ExcelChartSeries,
  idx: number,
  fill: "line" | "solid" | "none"
): string {
  const cats = series.cats ? catsXml(series.cats) : "";
  const fillXml =
    fill === "solid"
      ? solidFill(series)
      : fill === "line"
        ? lineProps(series)
        : `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>`;
  const marker = fill === "line" ? markerXml(series) : "";
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${seriesTx(series.name)}${fillXml}${marker}${cats}<c:val>${cacheXml(series.vals, "num")}</c:val>${errBarsXml(series)}</c:ser>`;
}

function titleXml(text: string | undefined, kind: "chart" | "axis"): string {
  if (!text?.trim()) {
    return kind === "chart" ? `<c:autoTitleDeleted val="1"/>` : "";
  }
  const body = `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${kind === "chart" ? "1400" : "1000"}"/></a:pPr><a:r><a:rPr lang="en-US" sz="${kind === "chart" ? "1400" : "1000"}" b="${kind === "chart" ? "1" : "0"}"/><a:t>${escapeXml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/>`;
  return kind === "chart" ? `<c:title>${body}</c:title>` : `<c:title>${body}</c:title>`;
}

function scalingXml(min: number | null, max: number | null): string {
  const minXml = min == null ? "" : `<c:min val="${numLiteral(min)}"/>`;
  const maxXml = max == null ? "" : `<c:max val="${numLiteral(max)}"/>`;
  return `<c:scaling><c:orientation val="minMax"/>${minXml}${maxXml}</c:scaling>`;
}

function valAxXml(opts: {
  axId: number;
  crossAx: number;
  pos: "b" | "l";
  title?: string;
  min?: number | null;
  max?: number | null;
  grid: boolean;
  crossBetween?: boolean;
}): string {
  const grid = opts.grid ? "<c:majorGridlines/>" : "";
  const between = opts.crossBetween === false ? "" : `<c:crossBetween val="between"/>`;
  return `<c:valAx><c:axId val="${opts.axId}"/>${scalingXml(opts.min ?? null, opts.max ?? null)}<c:delete val="0"/><c:axPos val="${opts.pos}"/>${grid}${titleXml(opts.title, "axis")}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${opts.crossAx}"/><c:crosses val="autoZero"/>${between}</c:valAx>`;
}

function catAxXml(opts: {
  axId: number;
  crossAx: number;
  title?: string;
}): string {
  return `<c:catAx><c:axId val="${opts.axId}"/>${scalingXml(null, null)}<c:delete val="0"/><c:axPos val="b"/><c:majorGridlines/>${titleXml(opts.title, "axis")}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${opts.crossAx}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>`;
}

function scatterStyleVal(
  series: ExcelChartSeries[]
): "marker" | "line" | "lineMarker" {
  if (series.some((item) => item.scatterStyle === "lineMarker")) {
    return "lineMarker";
  }
  if (series.every((item) => (item.scatterStyle ?? "marker") === "marker")) {
    return "marker";
  }
  return "line";
}

export function buildChartXml(chart: ExcelNativeChart): string {
  const series = chart.series.filter((item) => item.vals.rowEnd >= item.vals.rowStart);
  const xMin = finiteNumber(chart.xMin);
  const xMax = finiteNumber(chart.xMax);
  const yMin = finiteNumber(chart.yMin);
  const yMax = finiteNumber(chart.yMax);

  let plot = "";
  switch (chart.kind) {
    case "scatter": {
      const body = series
        .map((item, idx) => scatterSerXml(item, idx))
        .join("");
      plot = `<c:scatterChart><c:scatterStyle val="${scatterStyleVal(series)}"/><c:varyColors val="0"/>${body}<c:axId val="1"/><c:axId val="2"/></c:scatterChart>${valAxXml({ axId: 1, crossAx: 2, pos: "b", title: chart.xAxisTitle, min: xMin, max: xMax, grid: true, crossBetween: false })}${valAxXml({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, grid: true, crossBetween: false })}`;
      break;
    }
    case "line": {
      const body = series
        .map((item, idx) => catValSerXml(item, idx, "line"))
        .join("");
      plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${body}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>${catAxXml({ axId: 1, crossAx: 2, title: chart.xAxisTitle })}${valAxXml({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, grid: true })}`;
      break;
    }
    case "area": {
      const body = series
        .map((item, idx) => catValSerXml(item, idx, "solid"))
        .join("");
      plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${body}<c:axId val="1"/><c:axId val="2"/></c:areaChart>${catAxXml({ axId: 1, crossAx: 2, title: chart.xAxisTitle })}${valAxXml({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, grid: true })}`;
      break;
    }
    case "column":
    case "columnStacked": {
      const grouping = chart.kind === "columnStacked" ? "stacked" : "clustered";
      const body = series
        .map((item, idx) => catValSerXml(item, idx, "solid"))
        .join("");
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${body}<c:gapWidth val="80"/><c:axId val="1"/><c:axId val="2"/></c:barChart>${catAxXml({ axId: 1, crossAx: 2, title: chart.xAxisTitle })}${valAxXml({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, grid: true })}`;
      break;
    }
    case "columnLine": {
      const columns = series.filter((item) => !item.asLine);
      const lines = series.filter((item) => item.asLine);
      const colBody = columns
        .map((item, idx) => catValSerXml(item, idx, "solid"))
        .join("");
      const lineBody = lines
        .map((item, idx) => catValSerXml(item, columns.length + idx, "line"))
        .join("");
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${colBody}<c:gapWidth val="80"/><c:axId val="1"/><c:axId val="2"/></c:barChart><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineBody}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>${catAxXml({ axId: 1, crossAx: 2, title: chart.xAxisTitle })}${valAxXml({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, grid: true })}`;
      break;
    }
    default: {
      const exhaustive: never = chart.kind;
      return exhaustive;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${titleXml(chart.title, "chart")}<c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

export function buildDrawingXml(
  charts: Array<{ chartRid: string; chart: ExcelNativeChart }>,
  namePrefix: string
): string {
  const anchors = charts.map(({ chartRid, chart }, index) => {
    const id = index + 2;
    return `<xdr:oneCellAnchor><xdr:from><xdr:col>${chart.anchorCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.anchorRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${chart.widthEmu}" cy="${chart.heightEmu}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${escapeXml(`${namePrefix} ${index + 1}`)}"/><xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join("")}</xdr:wsDr>`;
}

function relsXml(rels: Array<{ id: string; type: string; target: string }>): string {
  const body = rels
    .map(
      (rel) =>
        `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeXml(rel.target)}"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}">${body}</Relationships>`;
}

function parseRels(
  xml: string | null
): Array<{ id: string; type: string; target: string }> {
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b([^>]*)\/>/g)].flatMap((match) => {
    const attrs = match[1] ?? "";
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !type || !target) return [];
    return [{ id, type, target }];
  });
}

function nextRid(
  rels: Array<{ id: string }>
): number {
  let max = 0;
  for (const rel of rels) {
    const n = Number(rel.id.replace(/^rId/i, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

function nextPartIndex(zip: PizZip, dir: string, prefix: string): number {
  let max = 0;
  for (const name of Object.keys(zip.files)) {
    const match = name.match(
      new RegExp(`^${dir}/${prefix}(\\d+)\\.xml$`)
    );
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function sheetPathByName(zip: PizZip): Map<string, string> {
  const workbook = zip.file("xl/workbook.xml")?.asText() ?? "";
  const wbRels = parseRels(zip.file("xl/_rels/workbook.xml.rels")?.asText() ?? null);
  const map = new Map<string, string>();
  for (const tag of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = tag[1] ?? "";
    const name = attrs.match(/\bname="([^"]+)"/)?.[1];
    const rid = attrs.match(/\br:id="([^"]+)"/)?.[1];
    if (!name || !rid) continue;
    const rel = wbRels.find(
      (item) => item.id === rid && item.type === WORKSHEET_REL_TYPE
    );
    if (!rel) continue;
    const target = rel.target.replace(/^\//, "");
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    map.set(name, path);
  }
  return map;
}

function insertDrawingOnSheet(sheetXml: string, rid: string): string {
  if (/<drawing\b/.test(sheetXml)) {
    return sheetXml.replace(
      /<drawing\b[^>]*\/?>/,
      `<drawing r:id="${rid}"/>`
    );
  }
  return sheetXml.replace(
    /<\/worksheet>/,
    `<drawing r:id="${rid}"/></worksheet>`
  );
}

function insertContentType(
  typesXml: string,
  partName: string,
  contentType: string
): string {
  if (typesXml.includes(`PartName="${partName}"`)) return typesXml;
  const override = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  return typesXml.replace(/<\/Types>/, `${override}</Types>`);
}

function sheetRelsPath(sheetPath: string): string {
  const file = sheetPath.split("/").pop();
  const dir = sheetPath.slice(0, sheetPath.lastIndexOf("/"));
  return `${dir}/_rels/${file}.rels`;
}

export function injectExcelCharts(
  xlsxBytes: Uint8Array,
  plans: SheetChartPlan[]
): Uint8Array {
  const charts = plans.flatMap((plan) =>
    plan.charts.filter((chart) => chart.series.length > 0)
  );
  if (charts.length === 0) return xlsxBytes;

  const zip = new PizZip(xlsxBytes);
  const sheets = sheetPathByName(zip);
  let typesXml = zip.file("[Content_Types].xml")?.asText() ?? "";
  let drawingIndex = nextPartIndex(zip, "xl/drawings", "drawing");
  let chartIndex = nextPartIndex(zip, "xl/charts", "chart");

  for (const plan of plans) {
    const liveCharts = plan.charts.filter((chart) => chart.series.length > 0);
    if (liveCharts.length === 0) continue;
    const sheetPath = sheets.get(plan.sheetName);
    if (!sheetPath) continue;
    const sheetXml = zip.file(sheetPath)?.asText();
    if (!sheetXml) continue;

    const drawingName = `drawing${drawingIndex}`;
    drawingIndex += 1;
    const drawingRels: Array<{ id: string; type: string; target: string }> = [];
    const drawingCharts: Array<{ chartRid: string; chart: ExcelNativeChart }> =
      [];

    for (const chart of liveCharts) {
      const chartName = `chart${chartIndex}`;
      chartIndex += 1;
      const chartRid = `rId${drawingRels.length + 1}`;
      zip.file(`xl/charts/${chartName}.xml`, buildChartXml(chart));
      typesXml = insertContentType(
        typesXml,
        `/xl/charts/${chartName}.xml`,
        CHART_CONTENT_TYPE
      );
      drawingRels.push({
        id: chartRid,
        type: CHART_REL_TYPE,
        target: `../charts/${chartName}.xml`,
      });
      drawingCharts.push({ chartRid, chart });
    }

    zip.file(
      `xl/drawings/${drawingName}.xml`,
      buildDrawingXml(drawingCharts, plan.sheetName)
    );
    zip.file(
      `xl/drawings/_rels/${drawingName}.xml.rels`,
      relsXml(drawingRels)
    );
    typesXml = insertContentType(
      typesXml,
      `/xl/drawings/${drawingName}.xml`,
      DRAWING_CONTENT_TYPE
    );

    const relsPath = sheetRelsPath(sheetPath);
    const existing = parseRels(zip.file(relsPath)?.asText() ?? null);
    const drawingRid = `rId${nextRid(existing)}`;
    existing.push({
      id: drawingRid,
      type: DRAWING_REL_TYPE,
      target: `../drawings/${drawingName}.xml`,
    });
    zip.file(relsPath, relsXml(existing));
    zip.file(sheetPath, insertDrawingOnSheet(sheetXml, drawingRid));
  }

  zip.file("[Content_Types].xml", typesXml);
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

export function listZipPaths(xlsxBytes: Uint8Array): string[] {
  const zip = new PizZip(xlsxBytes);
  return Object.keys(zip.files).toSorted();
}

export function zipText(xlsxBytes: Uint8Array, path: string): string | null {
  return new PizZip(xlsxBytes).file(path)?.asText() ?? null;
}
