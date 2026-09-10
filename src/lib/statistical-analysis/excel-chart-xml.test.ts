import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  a1Range,
  buildChartXml,
  colLetter,
  injectExcelCharts,
  listZipPaths,
  quotedSheetName,
  zipText,
  type ExcelNativeChart,
} from "./excel-chart-xml";

describe("excel chart xml helpers", () => {
  it("converts 0-based columns to A1 letters", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(25)).toBe("Z");
    expect(colLetter(26)).toBe("AA");
  });

  it("quotes sheet names for formulas", () => {
    expect(quotedSheetName("Assay sixpack")).toBe("'Assay sixpack'");
    expect(quotedSheetName("O'Brien")).toBe("'O''Brien'");
    expect(
      a1Range({
        sheetName: "Assay sixpack",
        col0: 1,
        rowStart: 20,
        rowEnd: 27,
        cache: [],
      })
    ).toBe("'Assay sixpack'!$B$20:$B$27");
  });

  it("emits a scatter chart bound to a cell range", () => {
    const chart: ExcelNativeChart = {
      title: "Torque",
      kind: "scatter",
      xAxisTitle: "Index",
      yAxisTitle: "Torque",
      series: [
        {
          name: "Torque",
          color: "#001838",
          scatterStyle: "marker",
          marker: true,
          x: {
            sheetName: "Torque scatter",
            col0: 0,
            rowStart: 5,
            rowEnd: 7,
            cache: [1, 2, 3],
          },
          vals: {
            sheetName: "Torque scatter",
            col0: 1,
            rowStart: 5,
            rowEnd: 7,
            cache: [3.1, 4.1, 3.3],
          },
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 1,
      heightEmu: 1,
    };
    const xml = buildChartXml(chart);
    expect(xml).toContain("c:scatterChart");
    expect(xml).toContain("scatterStyle val=\"marker\"");
    expect(xml).toContain("'Torque scatter'!$A$5:$A$7");
    expect(xml).toContain("'Torque scatter'!$B$5:$B$7");
    expect(xml).toContain("001838");
  });

  it("emits a column+scatter histogram with one bar per bin", () => {
    const range = (
      col0: number,
      rowStart: number,
      rowEnd: number,
      cache: number[]
    ) => ({
      sheetName: "Assay sixpack",
      col0,
      rowStart,
      rowEnd,
      cache,
    });
    const xml = buildChartXml({
      title: "Capability Histogram",
      kind: "columnScatter",
      xAxisTitle: "Measurement",
      yAxisTitle: "Count",
      xMin: 8,
      xMax: 16,
      yMin: 0,
      yMax: 4,
      gapWidth: 0,
      overlap: 100,
      forceCategoryAxis: true,
      series: [
        {
          name: "Count",
          color: "#001838",
          cats: range(0, 20, 24, [9, 10, 11, 12, 13]),
          vals: range(1, 20, 24, [1, 2, 3, 2, 1]),
        },
        {
          name: "Overall",
          color: "#5b8ad0",
          marker: false,
          dash: true,
          asScatter: true,
          smooth: true,
          scatterStyle: "line",
          x: range(0, 30, 39, Array.from({ length: 10 }, (_, i) => 8 + i)),
          vals: range(1, 30, 39, Array.from({ length: 10 }, (_, i) => i)),
        },
        {
          name: "LSL",
          color: "#dc2626",
          marker: false,
          dash: true,
          asScatter: true,
          scatterStyle: "line",
          x: range(0, 42, 43, [8, 8]),
          vals: range(1, 42, 43, [0, 4]),
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 1,
      heightEmu: 1,
    });
    expect(xml).toContain("c:barChart");
    expect(xml).toContain("c:scatterChart");
    expect(xml).not.toContain("c:lineChart");
    expect(xml).toContain('<c:gapWidth val="0"/>');
    expect(xml).toContain('<c:overlap val="100"/>');
    expect(xml).toContain('<c:delete val="0"/>');
    expect(xml).toContain('<c:axPos val="t"/>');
    expect(xml).toContain('<c:smooth val="1"/>');
    expect(xml).toContain("'Assay sixpack'!$A$20:$A$24");
    expect(xml).toContain("'Assay sixpack'!$A$42:$A$43");
  });
});

describe("injectExcelCharts", () => {
  it("adds chart and drawing parts to an ExcelJS workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["X", "Y"]);
    sheet.addRow([1, 10]);
    sheet.addRow([2, 12]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const withCharts = injectExcelCharts(bytes, [
      {
        sheetName: "Data",
        charts: [
          {
            title: "Y vs X",
            kind: "scatter",
            series: [
              {
                name: "Y",
                color: "#133782",
                scatterStyle: "marker",
                x: {
                  sheetName: "Data",
                  col0: 0,
                  rowStart: 2,
                  rowEnd: 3,
                  cache: [1, 2],
                },
                vals: {
                  sheetName: "Data",
                  col0: 1,
                  rowStart: 2,
                  rowEnd: 3,
                  cache: [10, 12],
                },
              },
            ],
            anchorRow: 0,
            anchorCol: 3,
            widthEmu: 4_000_000,
            heightEmu: 2_400_000,
          },
        ],
      },
    ]);
    const paths = listZipPaths(withCharts);
    expect(paths).toContain("xl/charts/chart1.xml");
    expect(paths).toContain("xl/drawings/drawing1.xml");
    expect(zipText(withCharts, "xl/worksheets/sheet1.xml")).toContain(
      "<drawing r:id="
    );
    expect(zipText(withCharts, "[Content_Types].xml")).toContain(
      "drawingml.chart+xml"
    );
  });
});

describe("chart chrome", () => {
  function lineChart(overrides: Partial<ExcelNativeChart> = {}): string {
    return buildChartXml({
      title: "I Chart",
      kind: "line",
      xAxisTitle: "Observation",
      yAxisTitle: "Individual",
      axisColor: "#5b6b82",
      gridColor: "#e2e8f2",
      titleColor: "#0f1e33",
      series: [
        {
          name: "Value",
          color: "#001838",
          marker: true,
          vals: {
            sheetName: "S",
            col0: 1,
            rowStart: 2,
            rowEnd: 4,
            cache: [1, 2, 3],
          },
          cats: {
            sheetName: "S",
            col0: 0,
            rowStart: 2,
            rowEnd: 4,
            cache: [1, 2, 3],
          },
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 100,
      heightEmu: 100,
      ...overrides,
    });
  }

  it("draws horizontal gridlines only, and never an unstyled default", () => {
    const xml = lineChart();
    expect(xml).not.toContain("<c:majorGridlines/>");
    const catAx = xml.match(/<c:catAx>[\s\S]*?<\/c:catAx>/)?.[0] ?? "";
    expect(catAx).not.toContain("majorGridlines");
    const valAx = xml.match(/<c:valAx>[\s\S]*?<\/c:valAx>/)?.[0] ?? "";
    expect(valAx).toContain("<c:majorGridlines><c:spPr>");
    expect(valAx).toContain('<a:srgbClr val="E2E8F2"/>');
    expect(valAx).toContain('<a:prstDash val="sysDash"/>');
  });

  it("opts into vertical gridlines only when asked", () => {
    const xml = lineChart({ categoryGrid: true });
    const catAx = xml.match(/<c:catAx>[\s\S]*?<\/c:catAx>/)?.[0] ?? "";
    expect(catAx).toContain("<c:majorGridlines><c:spPr>");
  });

  it("styles axis lines, tick labels and titles from the pack palette", () => {
    const xml = lineChart();
    const catAx = xml.match(/<c:catAx>[\s\S]*?<\/c:catAx>/)?.[0] ?? "";
    expect(catAx).toContain('<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="5B6B82"/>');
    expect(catAx).toContain('<c:txPr>');
    expect(xml).toContain('<a:srgbClr val="0F1E33"/>');
  });

  it("suppresses the legend when the chart labels values inline", () => {
    expect(lineChart()).toContain("<c:legend>");
    expect(lineChart({ showLegend: false })).not.toContain("<c:legend>");
  });

  it("pins the tick spacing so it does not drift with chart size", () => {
    const valAx =
      lineChart({ yMin: 0, yMax: 15, yMajorUnit: 5 }).match(
        /<c:valAx>[\s\S]*?<\/c:valAx>/
      )?.[0] ?? "";
    expect(valAx).toContain('<c:min val="0"/>');
    expect(valAx).toContain('<c:max val="15"/>');
    expect(valAx).toContain('<c:majorUnit val="5"/>');
    expect(valAx.indexOf("<c:majorUnit")).toBeGreaterThan(
      valAx.indexOf("<c:crossAx")
    );
  });

  it("drops horizontal gridlines when valueGrid is off", () => {
    const valAx =
      lineChart({ valueGrid: false }).match(/<c:valAx>[\s\S]*?<\/c:valAx>/)?.[0] ?? "";
    expect(valAx).not.toContain("majorGridlines");
  });
});

describe("series element order and combo kinds", () => {
  const range = (col0: number) => ({
    sheetName: "S",
    col0,
    rowStart: 2,
    rowEnd: 3,
    cache: [1, 2],
  });

  it("puts error bars before the category and value refs", () => {
    const xml = buildChartXml({
      title: "Interval plot",
      kind: "line",
      series: [
        {
          name: "Mean",
          color: "#001838",
          marker: true,
          noLine: true,
          vals: range(1),
          cats: { ...range(0), cache: ["a", "b"] },
          errPlus: range(2),
          errMinus: range(3),
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 100,
      heightEmu: 100,
    });
    const ser = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/)?.[0] ?? "";
    expect(ser.indexOf("<c:errBars>")).toBeGreaterThan(-1);
    expect(ser.indexOf("<c:errBars>")).toBeLessThan(ser.indexOf("<c:cat>"));
    expect(ser.indexOf("<c:errBars>")).toBeLessThan(ser.indexOf("<c:val>"));
  });

  it("puts scatter error bars before xVal", () => {
    const xml = buildChartXml({
      title: "Scatter",
      kind: "scatter",
      series: [
        {
          name: "Y",
          color: "#001838",
          scatterStyle: "marker",
          marker: true,
          x: range(0),
          vals: range(1),
          errPlus: range(2),
          errMinus: range(3),
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 100,
      heightEmu: 100,
    });
    const ser = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/)?.[0] ?? "";
    expect(ser.indexOf("<c:errBars>")).toBeLessThan(ser.indexOf("<c:xVal>"));
  });

  it("draws area spec limits as lines rather than filled areas", () => {
    const xml = buildChartXml({
      title: "Area",
      kind: "areaLine",
      series: [
        {
          name: "Y",
          color: "#001838",
          vals: range(1),
          cats: { ...range(0), cache: ["a", "b"] },
        },
        {
          name: "USL",
          color: "#dc2626",
          dash: true,
          marker: false,
          asLine: true,
          vals: range(2),
          cats: { ...range(0), cache: ["a", "b"] },
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 100,
      heightEmu: 100,
    });
    expect(xml).toContain("<c:areaChart>");
    expect(xml).toContain("<c:lineChart>");
    const area = xml.match(/<c:areaChart>[\s\S]*?<\/c:areaChart>/)?.[0] ?? "";
    expect(area).not.toContain("USL");
    const line = xml.match(/<c:lineChart>[\s\S]*?<\/c:lineChart>/)?.[0] ?? "";
    expect(line).toContain("USL");
    expect(line).toContain('<a:prstDash val="dash"/>');
  });
});

describe("point overrides, value labels and subtitles", () => {
  const cats = {
    sheetName: "S",
    col0: 0,
    rowStart: 2,
    rowEnd: 4,
    cache: [1, 2, 3],
  };
  const vals = {
    sheetName: "S",
    col0: 1,
    rowStart: 2,
    rowEnd: 4,
    cache: [1, 9, 3],
  };

  it("paints out-of-control points and labels the limit line", () => {
    const xml = buildChartXml({
      title: "I Chart",
      kind: "line",
      series: [
        {
          name: "Value",
          color: "#001838",
          marker: true,
          vals,
          cats,
          pointOverrides: [{ index: 1, color: "#dc2626", markerSize: 7 }],
        },
        {
          name: "UCL",
          color: "#5b8ad0",
          dash: true,
          marker: false,
          vals,
          cats,
          valueLabel: { index: 2, text: "6.34", color: "#dc2626", position: "t" },
        },
      ],
      showLegend: false,
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 100,
      heightEmu: 100,
    });
    const value = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/)?.[0] ?? "";
    expect(value).toContain('<c:dPt><c:idx val="1"/>');
    expect(value).toContain('<a:srgbClr val="DC2626"/>');
    // dPt and dLbls must sit between the marker and the data refs.
    expect(value.indexOf("<c:dPt>")).toBeGreaterThan(value.indexOf("<c:marker>"));
    expect(value.indexOf("<c:dPt>")).toBeLessThan(value.indexOf("<c:cat>"));

    const ucl = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/g)?.[1] ?? "";
    expect(ucl).toContain("<c:dLbls>");
    expect(ucl).toContain("<a:t>6.34</a:t>");
    expect(ucl).toContain('<c:dLblPos val="t"/>');
    // Only the pinned point shows a label.
    expect(ucl.split('<c:showVal val="1"/>')).toHaveLength(2);
    expect(ucl).toContain('<c:showVal val="0"/>');
  });

  it("adds a second title line for AD / P", () => {
    const xml = buildChartXml({
      title: "Normal Probability Plot",
      kind: "scatter",
      subtitle: "AD: 0.802   P: 0.033",
      titleColor: "#0f1e33",
      series: [
        {
          name: "Value",
          color: "#001838",
          scatterStyle: "marker",
          marker: true,
          x: cats,
          vals,
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 100,
      heightEmu: 100,
    });
    const title = xml.match(/<c:title>[\s\S]*?<\/c:title>/)?.[0] ?? "";
    expect(title).toContain("<a:t>Normal Probability Plot</a:t>");
    expect(title).toContain("<a:t>AD: 0.802   P: 0.033</a:t>");
    expect(title.match(/<a:p>/g)).toHaveLength(2);
  });
});

describe("stacked boxes", () => {
  const cats = {
    sheetName: "S",
    col0: 0,
    rowStart: 2,
    rowEnd: 3,
    cache: ["A", "B"],
  };
  const nums = (col0: number, cache: Array<number | null>) => ({
    sheetName: "S",
    col0,
    rowStart: 2,
    rowEnd: 3,
    cache,
  });

  it("stacks the box segments and hangs one-sided whiskers off them", () => {
    const xml = buildChartXml({
      title: "Boxplot",
      kind: "columnStackedLine",
      overlap: 100,
      gapWidth: 80,
      showLegend: false,
      series: [
        {
          name: "Q1",
          color: "#5b8ad0",
          hiddenFill: true,
          cats,
          vals: nums(1, [10, 11]),
          errMinus: nums(4, [2, 2]),
          errColor: "#061528",
        },
        {
          name: "Median to Q3",
          color: "#5b8ad0",
          fillOpacity: 0.45,
          borderColor: "#001838",
          cats,
          vals: nums(3, [3, 1]),
          errPlus: nums(5, [3, 3]),
          errColor: "#061528",
        },
        {
          name: "Outlier 1",
          color: "#061528",
          marker: true,
          markerSymbol: "star",
          noLine: true,
          asLine: true,
          cats,
          vals: nums(7, [22, null]),
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 100,
      heightEmu: 100,
    });

    expect(xml).toContain('<c:grouping val="stacked"/>');
    expect(xml).toContain('<c:overlap val="100"/>');
    const bar = xml.match(/<c:barChart>[\s\S]*?<\/c:barChart>/)?.[0] ?? "";
    expect(bar).toContain('<c:errBarType val="minus"/>');
    expect(bar).toContain('<c:errBarType val="plus"/>');
    expect(bar).not.toContain('<c:errBarType val="both"/>');
    expect(bar).toContain('<a:alpha val="45000"/>');
    expect(bar).not.toContain("Outlier 1");

    const line = xml.match(/<c:lineChart>[\s\S]*?<\/c:lineChart>/)?.[0] ?? "";
    expect(line).toContain("Outlier 1");
    expect(line).toContain('<c:symbol val="star"/>');
    expect(xml).not.toContain("<c:legend>");
  });
});
