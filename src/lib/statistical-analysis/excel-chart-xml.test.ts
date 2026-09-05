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

  it("emits a dense smoothed histogram fit as column+line", () => {
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
    const xs = Array.from({ length: 20 }, (_, i) => 8 + i * 0.4);
    const xml = buildChartXml({
      title: "Capability Histogram",
      kind: "columnLine",
      xAxisTitle: "Measurement",
      yAxisTitle: "Count",
      yMin: 0,
      yMax: 4,
      gapWidth: 0,
      tickLblSkip: 3,
      series: [
        {
          name: "Count",
          color: "#001838",
          cats: range(0, 20, 39, xs),
          vals: range(1, 20, 39, xs.map((_, i) => (i > 4 && i < 14 ? 2 : 0))),
        },
        {
          name: "Overall",
          color: "#5b8ad0",
          marker: false,
          dash: true,
          asLine: true,
          smooth: true,
          cats: range(0, 20, 39, xs),
          vals: range(1, 20, 39, xs.map((x) => Math.exp(-((x - 12) ** 2) / 4))),
        },
      ],
      anchorRow: 1,
      anchorCol: 0,
      widthEmu: 1,
      heightEmu: 1,
    });
    expect(xml).toContain("c:barChart");
    expect(xml).toContain("c:lineChart");
    expect(xml).toContain('<c:gapWidth val="0"/>');
    expect(xml).toContain('<c:smooth val="1"/>');
    expect(xml).toContain('<c:tickLblSkip val="3"/>');
    expect(xml).toContain("'Assay sixpack'!$A$20:$A$39");
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
