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
  | "columnLine"
  | "columnScatter"
  | "columnStackedLine"
  | "areaLine";

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
  /** Column/area outline. The app draws histogram bars as a light fill with a border. */
  borderColor?: string;
  /** Connecting line, when it differs from the marker colour (I chart, MR chart). */
  lineColor?: string;
  /** Marker diameter in points. Scaled down on two-up charts. */
  markerSize?: number;
  /** Marker glyph. Boxplot outliers are asterisks on screen. */
  markerSymbol?:
    | "circle"
    | "star"
    | "square"
    | "diamond"
    | "triangle"
    | "x"
    | "plus"
    | "dash"
    | "dot";
  /** Error-bar ink, for whiskers drawn off an invisible stacking base. */
  errColor?: string;
  /** Fill opacity 0-1 for area marks. */
  fillOpacity?: number;
  /** Per-point overrides — the panels paint out-of-control points red. */
  pointOverrides?: Array<{ index: number; color: string; markerSize?: number }>;
  /**
   * One literal label pinned to a point, mirroring the value the SVG panels
   * print at the end of a limit line. Literal because a spec line's Y value is
   * the plot ceiling, not the limit.
   */
  valueLabel?: {
    index: number;
    text: string;
    color?: string;
    position?: "t" | "b" | "l" | "r" | "ctr";
  };
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
  /** Place this series on the scatter overlay of a column+scatter combo. */
  asScatter?: boolean;
  /** Excel Bezier smoothing on a scatter or line series (distribution-fit curves). */
  smooth?: boolean;
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
  /** Tick spacing. Without it Excel picks its own, and it shifts with chart size. */
  xMajorUnit?: number | null;
  yMajorUnit?: number | null;
  series: ExcelChartSeries[];
  /** Column chart gap. 0 fuses adjacent equal-height histogram bins. */
  gapWidth?: number;
  /** Column overlap. 100 with gapWidth 0 makes histogram bars share edges. */
  overlap?: number;
  /** Skip category tick labels on dense measurement axes. */
  tickLblSkip?: number;
  /** Force a discrete category axis (numeric measurement labels stay categories). */
  forceCategoryAxis?: boolean;
  /** Emit category labels as text so Excel does not treat X as a value axis. */
  categoryAsText?: boolean;
  /** Axis line, tick label and axis title ink. Defaults to the demo axis gray. */
  axisColor?: string;
  /** Gridline ink. Defaults to the demo grid gray. */
  gridColor?: string;
  /** Chart title ink. */
  titleColor?: string;
  /** Second, smaller title line — the panels print AD / P inside the plot. */
  subtitle?: string;
  /** Horizontal gridlines. On unless the chart annotates values inline. */
  valueGrid?: boolean;
  /** Vertical gridlines on the category axis. The app never draws these. */
  categoryGrid?: boolean;
  /** Bottom legend. Off for charts the app annotates inline instead. */
  showLegend?: boolean;
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

/** Fallbacks only — `excel-chart-source` passes the pack palette through. */
const DEFAULT_AXIS_COLOR = "#5b6b82";
const DEFAULT_GRID_COLOR = "#e2e8f2";

/** Light dashed gridlines. Without an explicit spPr Excel paints a hard default. */
function gridlinesXml(color: string): string {
  return `<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${rgbHex(color)}"/></a:solidFill><a:prstDash val="sysDash"/></a:ln></c:spPr></c:majorGridlines>`;
}

function axisLineXml(color: string | null): string {
  if (color == null) return `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>`;
  return `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${rgbHex(color)}"/></a:solidFill></a:ln></c:spPr>`;
}

function axisTextXml(color: string): string {
  return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="${rgbHex(color)}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
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

function catsXml(range: ExcelCellRange, asText = false): string {
  const numeric =
    !asText &&
    range.cache.every(
      (value) => value == null || value === "" || typeof value === "number"
    );
  return `<c:cat>${cacheXml(range, numeric ? "num" : "str")}</c:cat>`;
}

function lineProps(series: ExcelChartSeries): string {
  const color = rgbHex(series.lineColor ?? series.color);
  if (series.noLine || series.scatterStyle === "marker") {
    return `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>`;
  }
  const dash = series.dash ? `<a:prstDash val="dash"/>` : "";
  return `<c:spPr><a:ln w="${series.dash ? 12700 : 15875}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${dash}</a:ln></c:spPr>`;
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
  const size = Math.round(Math.min(72, Math.max(2, series.markerSize ?? 7)));
  const symbol = series.markerSymbol ?? "circle";
  return `<c:marker><c:symbol val="${symbol}"/><c:size val="${size}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`;
}

function solidFill(series: ExcelChartSeries): string {
  if (series.hiddenFill) {
    return `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>`;
  }
  const alpha =
    series.fillOpacity == null
      ? ""
      : `<a:alpha val="${Math.round(Math.min(1, Math.max(0, series.fillOpacity)) * 100000)}"/>`;
  const fill = `<a:solidFill><a:srgbClr val="${rgbHex(series.color)}">${alpha}</a:srgbClr></a:solidFill>`;
  const border = series.borderColor
    ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${rgbHex(series.borderColor)}"/></a:solidFill></a:ln>`
    : `<a:ln><a:noFill/></a:ln>`;
  return `<c:spPr>${fill}${border}</c:spPr>`;
}

function errBarsXml(series: ExcelChartSeries): string {
  if (!series.errPlus && !series.errMinus) return "";
  const type = series.errPlus
    ? series.errMinus
      ? "both"
      : "plus"
    : "minus";
  const plus = series.errPlus
    ? `<c:plus>${cacheXml(series.errPlus, "num")}</c:plus>`
    : "";
  const minus = series.errMinus
    ? `<c:minus>${cacheXml(series.errMinus, "num")}</c:minus>`
    : "";
  const ink = series.errColor
    ? `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${rgbHex(series.errColor)}"/></a:solidFill></a:ln></c:spPr>`
    : "";
  return `<c:errBars><c:errDir val="y"/><c:errBarType val="${type}"/><c:errValType val="cust"/><c:noEndCap val="0"/>${plus}${minus}${ink}</c:errBars>`;
}

function pointOverridesXml(series: ExcelChartSeries): string {
  if (!series.pointOverrides?.length) return "";
  return series.pointOverrides
    .map((point) => {
      const size = Math.round(
        Math.min(72, Math.max(2, point.markerSize ?? series.markerSize ?? 7))
      );
      return `<c:dPt><c:idx val="${Math.trunc(point.index)}"/><c:marker><c:symbol val="circle"/><c:size val="${size}"/><c:spPr><a:solidFill><a:srgbClr val="${rgbHex(point.color)}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker><c:bubble3D val="0"/></c:dPt>`;
    })
    .join("");
}

const HIDDEN_LABEL_FLAGS =
  `<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>`;
const SHOWN_LABEL_FLAGS =
  `<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>`;

function dataLabelsXml(series: ExcelChartSeries): string {
  const label = series.valueLabel;
  if (!label) return "";
  const color = rgbHex(label.color ?? series.color);
  const runProps = `sz="800" b="1"`;
  const rich = `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr ${runProps}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" ${runProps}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(label.text)}</a:t></a:r></a:p></c:rich></c:tx>`;
  const position = `<c:dLblPos val="${label.position ?? "t"}"/>`;
  const one = `<c:dLbl><c:idx val="${Math.trunc(label.index)}"/>${rich}${position}${SHOWN_LABEL_FLAGS}</c:dLbl>`;
  return `<c:dLbls>${one}${HIDDEN_LABEL_FLAGS}</c:dLbls>`;
}

function seriesTx(name: string): string {
  return `<c:tx><c:v>${escapeXml(name)}</c:v></c:tx>`;
}

function scatterSerXml(series: ExcelChartSeries, idx: number): string {
  const x = series.x ?? series.cats;
  if (!x) return "";
  const style = series.scatterStyle ?? "marker";
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${seriesTx(series.name)}${lineProps({ ...series, scatterStyle: style })}${markerXml({ ...series, scatterStyle: style })}${pointOverridesXml(series)}${dataLabelsXml(series)}${errBarsXml(series)}<c:xVal>${cacheXml(x, "num")}</c:xVal><c:yVal>${cacheXml(series.vals, "num")}</c:yVal><c:smooth val="${series.smooth ? "1" : "0"}"/></c:ser>`;
}

function catValSerXml(
  series: ExcelChartSeries,
  idx: number,
  fill: "line" | "solid" | "none",
  categoryAsText = false
): string {
  const cats = series.cats ? catsXml(series.cats, categoryAsText) : "";
  const fillXml =
    fill === "solid"
      ? solidFill(series)
      : fill === "line"
        ? lineProps(series)
        : `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>`;
  const marker = fill === "line" ? markerXml(series) : "";
  const smooth =
    fill === "line" && series.smooth ? `<c:smooth val="1"/>` : "";
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${seriesTx(series.name)}${fillXml}${marker}${pointOverridesXml(series)}${dataLabelsXml(series)}${errBarsXml(series)}${cats}<c:val>${cacheXml(series.vals, "num")}</c:val>${smooth}</c:ser>`;
}

function titleParagraph(
  text: string,
  size: string,
  bold: "0" | "1",
  color?: string
): string {
  const fill = color
    ? `<a:solidFill><a:srgbClr val="${rgbHex(color)}"/></a:solidFill>`
    : "";
  return `<a:p><a:pPr><a:defRPr sz="${size}"/></a:pPr><a:r><a:rPr lang="en-US" sz="${size}" b="${bold}">${fill}</a:rPr><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;
}

function titleXml(
  text: string | undefined,
  kind: "chart" | "axis",
  color?: string,
  subtitle?: string
): string {
  if (!text?.trim()) {
    return kind === "chart" ? `<c:autoTitleDeleted val="1"/>` : "";
  }
  const size = kind === "chart" ? "1400" : "1000";
  const bold = kind === "chart" ? "1" : "0";
  const second =
    kind === "chart" && subtitle?.trim()
      ? titleParagraph(subtitle, "900", "0", color)
      : "";
  const body = `<c:tx><c:rich><a:bodyPr/><a:lstStyle/>${titleParagraph(text, size, bold, color)}${second}</c:rich></c:tx><c:overlay val="0"/>`;
  return `<c:title>${body}</c:title>`;
}

function scalingXml(min: number | null, max: number | null): string {
  const minXml = min == null ? "" : `<c:min val="${numLiteral(min)}"/>`;
  const maxXml = max == null ? "" : `<c:max val="${numLiteral(max)}"/>`;
  return `<c:scaling><c:orientation val="minMax"/>${minXml}${maxXml}</c:scaling>`;
}

function valAxXml(opts: {
  axId: number;
  crossAx: number;
  pos: "b" | "l" | "t";
  title?: string;
  min?: number | null;
  max?: number | null;
  grid: boolean;
  crossBetween?: boolean;
  majorUnit?: number | null;
  axisColor: string;
  gridColor: string;
  /** Hide ticks/labels but keep the axis (Excel drops scatter series if the axis is deleted). */
  hidden?: boolean;
}): string {
  const grid = opts.hidden || !opts.grid ? "" : gridlinesXml(opts.gridColor);
  const between = opts.crossBetween === false ? "" : `<c:crossBetween val="between"/>`;
  const ticks = opts.hidden
    ? `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="none"/>`
    : `<c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`;
  const chrome = opts.hidden
    ? axisLineXml(null)
    : `${axisLineXml(opts.axisColor)}${axisTextXml(opts.axisColor)}`;
  const majorUnit = finiteNumber(opts.majorUnit);
  const unit =
    opts.hidden || majorUnit == null || majorUnit <= 0
      ? ""
      : `<c:majorUnit val="${numLiteral(majorUnit)}"/>`;
  return `<c:valAx><c:axId val="${opts.axId}"/>${scalingXml(opts.min ?? null, opts.max ?? null)}<c:delete val="0"/><c:axPos val="${opts.pos}"/>${grid}${titleXml(opts.hidden ? undefined : opts.title, "axis", opts.axisColor)}<c:numFmt formatCode="General" sourceLinked="1"/>${ticks}${chrome}<c:crossAx val="${opts.crossAx}"/><c:crosses val="autoZero"/>${between}${unit}</c:valAx>`;
}

function catAxXml(opts: {
  axId: number;
  crossAx: number;
  title?: string;
  tickLblSkip?: number;
  auto?: boolean;
  axisColor: string;
  gridColor: string;
  /** Vertical gridlines. Off by default — the app draws horizontal only. */
  grid?: boolean;
}): string {
  const skip =
    opts.tickLblSkip != null && opts.tickLblSkip > 1
      ? `<c:tickLblSkip val="${Math.floor(opts.tickLblSkip)}"/><c:tickMarkSkip val="${Math.floor(opts.tickLblSkip)}"/>`
      : "";
  const auto = opts.auto === false ? "0" : "1";
  const grid = opts.grid === true ? gridlinesXml(opts.gridColor) : "";
  return `<c:catAx><c:axId val="${opts.axId}"/>${scalingXml(null, null)}<c:delete val="0"/><c:axPos val="b"/>${grid}${titleXml(opts.title, "axis", opts.axisColor)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axisLineXml(opts.axisColor)}${axisTextXml(opts.axisColor)}<c:crossAx val="${opts.crossAx}"/><c:crosses val="autoZero"/><c:auto val="${auto}"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>${skip}</c:catAx>`;
}

function gapAndOverlapXml(chart: ExcelNativeChart): string {
  const gap = `<c:gapWidth val="${chart.gapWidth ?? 80}"/>`;
  if (chart.overlap == null) return gap;
  return `${gap}<c:overlap val="${Math.trunc(chart.overlap)}"/>`;
}

function scatterStyleVal(
  series: ExcelChartSeries[]
): "marker" | "line" | "lineMarker" | "smooth" | "smoothMarker" {
  if (series.some((item) => item.smooth)) {
    return series.some((item) => item.marker) ? "smoothMarker" : "smooth";
  }
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
  const axisColor = chart.axisColor ?? DEFAULT_AXIS_COLOR;
  const gridColor = chart.gridColor ?? DEFAULT_GRID_COLOR;
  const valueGrid = chart.valueGrid !== false;
  const valAx = (opts: Omit<Parameters<typeof valAxXml>[0], "axisColor" | "gridColor">) =>
    valAxXml({ ...opts, axisColor, gridColor });
  const xUnit = chart.xMajorUnit;
  const yUnit = chart.yMajorUnit;
  const catAx = (opts: Omit<Parameters<typeof catAxXml>[0], "axisColor" | "gridColor">) =>
    catAxXml({ ...opts, axisColor, gridColor, grid: chart.categoryGrid === true });
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
      plot = `<c:scatterChart><c:scatterStyle val="${scatterStyleVal(series)}"/><c:varyColors val="0"/>${body}<c:axId val="1"/><c:axId val="2"/></c:scatterChart>${valAx({ axId: 1, crossAx: 2, pos: "b", title: chart.xAxisTitle, min: xMin, max: xMax, majorUnit: xUnit, grid: valueGrid, crossBetween: false })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid, crossBetween: false })}`;
      break;
    }
    case "line": {
      const body = series
        .map((item, idx) =>
          catValSerXml(item, idx, "line", chart.categoryAsText === true)
        )
        .join("");
      plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${body}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>${catAx({ axId: 1, crossAx: 2, title: chart.xAxisTitle, tickLblSkip: chart.tickLblSkip, auto: !chart.forceCategoryAxis })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid })}`;
      break;
    }
    case "area": {
      const body = series
        .map((item, idx) =>
          catValSerXml(item, idx, "solid", chart.categoryAsText === true)
        )
        .join("");
      plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${body}<c:axId val="1"/><c:axId val="2"/></c:areaChart>${catAx({ axId: 1, crossAx: 2, title: chart.xAxisTitle, tickLblSkip: chart.tickLblSkip, auto: !chart.forceCategoryAxis })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid })}`;
      break;
    }
    case "column":
    case "columnStacked": {
      const grouping = chart.kind === "columnStacked" ? "stacked" : "clustered";
      const body = series
        .map((item, idx) =>
          catValSerXml(item, idx, "solid", chart.categoryAsText === true)
        )
        .join("");
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${body}${gapAndOverlapXml(chart)}<c:axId val="1"/><c:axId val="2"/></c:barChart>${catAx({ axId: 1, crossAx: 2, title: chart.xAxisTitle, tickLblSkip: chart.tickLblSkip, auto: !chart.forceCategoryAxis })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid })}`;
      break;
    }
    case "areaLine": {
      const areas = series.filter((item) => !item.asLine);
      const lines = series.filter((item) => item.asLine);
      const asText = chart.categoryAsText === true;
      const areaBody = areas
        .map((item, idx) => catValSerXml(item, idx, "solid", asText))
        .join("");
      const lineBody = lines
        .map((item, idx) => catValSerXml(item, areas.length + idx, "line", asText))
        .join("");
      plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${areaBody}<c:axId val="1"/><c:axId val="2"/></c:areaChart><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineBody}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>${catAx({ axId: 1, crossAx: 2, title: chart.xAxisTitle, tickLblSkip: chart.tickLblSkip, auto: !chart.forceCategoryAxis })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid })}`;
      break;
    }
    case "columnStackedLine": {
      const columns = series.filter((item) => !item.asLine);
      const lines = series.filter((item) => item.asLine);
      const asText = chart.categoryAsText === true;
      const colBody = columns
        .map((item, idx) => catValSerXml(item, idx, "solid", asText))
        .join("");
      const lineBody = lines
        .map((item, idx) => catValSerXml(item, columns.length + idx, "line", asText))
        .join("");
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="stacked"/><c:varyColors val="0"/>${colBody}${gapAndOverlapXml(chart)}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineBody}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>${catAx({ axId: 1, crossAx: 2, title: chart.xAxisTitle, tickLblSkip: chart.tickLblSkip, auto: !chart.forceCategoryAxis })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid })}`;
      break;
    }
    case "columnLine": {
      const columns = series.filter((item) => !item.asLine);
      const lines = series.filter((item) => item.asLine);
      const asText = chart.categoryAsText === true;
      const colBody = columns
        .map((item, idx) => catValSerXml(item, idx, "solid", asText))
        .join("");
      const lineBody = lines
        .map((item, idx) =>
          catValSerXml(item, columns.length + idx, "line", asText)
        )
        .join("");
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${colBody}${gapAndOverlapXml(chart)}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineBody}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>${catAx({ axId: 1, crossAx: 2, title: chart.xAxisTitle, tickLblSkip: chart.tickLblSkip, auto: !chart.forceCategoryAxis })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid })}`;
      break;
    }
    case "columnScatter": {
      const columns = series.filter((item) => !item.asScatter);
      const scatters = series.filter((item) => item.asScatter);
      const colBody = columns
        .map((item, idx) =>
          catValSerXml(item, idx, "solid", chart.categoryAsText === true)
        )
        .join("");
      const scatterBody = scatters
        .map((item, idx) => scatterSerXml(item, columns.length + idx))
        .join("");
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${colBody}${gapAndOverlapXml(chart)}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:scatterChart><c:scatterStyle val="${scatterStyleVal(scatters)}"/><c:varyColors val="0"/>${scatterBody}<c:axId val="3"/><c:axId val="2"/></c:scatterChart>${catAx({ axId: 1, crossAx: 2, title: chart.xAxisTitle, tickLblSkip: chart.tickLblSkip, auto: !chart.forceCategoryAxis })}${valAx({ axId: 2, crossAx: 1, pos: "l", title: chart.yAxisTitle, min: yMin, max: yMax, majorUnit: yUnit, grid: valueGrid })}${valAx({ axId: 3, crossAx: 2, pos: "t", min: xMin, max: xMax, grid: false, crossBetween: false, hidden: true })}`;
      break;
    }
    default: {
      const exhaustive: never = chart.kind;
      return exhaustive;
    }
  }

  const legend =
    chart.showLegend === false
      ? ""
      : `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${axisTextXml(axisColor)}</c:legend>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${titleXml(chart.title, "chart", chart.titleColor, chart.subtitle)}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
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
