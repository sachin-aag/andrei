import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { validateXlsx } from "@/lib/attachments/validate-xlsx";

async function validXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["batch", "result"]);
  sheet.addRow(["B-1", "pass"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("validateXlsx", () => {
  it("accepts a real .xlsx and reports a sentinel page count", async () => {
    expect(validateXlsx(await validXlsx())).toEqual({ pageCount: 1 });
  });

  it("rejects a PDF masquerading as Excel", () => {
    expect(() => validateXlsx(Buffer.from("%PDF-1.7\n"))).toThrow(
      /not an Excel/i
    );
  });

  it("rejects a zip archive that is not a workbook", () => {
    const emptyZip = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x50, 0x4b, 0x05, 0x06, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    expect(() => validateXlsx(emptyZip)).toThrow(
      /Excel \.xlsx|parsed|corrupted|not a valid Excel/i
    );
  });
});
