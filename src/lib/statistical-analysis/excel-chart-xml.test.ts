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
