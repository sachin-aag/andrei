import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/audit/export", () => ({
  exportAuditEventsCsv: vi.fn(),
  exportAuditEventsPdf: vi.fn(),
}));

vi.mock("@/lib/audit/queries", () => ({
  listAuditEvents: vi.fn(),
  listReportSignatures: vi.fn(),
}));

vi.mock("@/lib/export/generate-docx", () => ({
  generateReportDocx: vi.fn(),
}));

vi.mock("@/lib/reports/managers", () => ({
  listReportManagerIds: vi.fn(),
  withAssignedManagerIds: vi.fn((report, managerIds: string[]) => ({
    ...report,
    assignedManagerIds: managerIds,
  })),
}));

import PizZip from "pizzip";
import { db } from "@/db";
import { exportAuditEventsCsv, exportAuditEventsPdf } from "@/lib/audit/export";
import { listAuditEvents, listReportSignatures } from "@/lib/audit/queries";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { listReportManagerIds } from "@/lib/reports/managers";
import { buildCompleteRecordExportZip } from "./complete-export";

const report = {
  id: "report-1",
  authorId: "engineer-1",
  assignedManagerId: null,
  status: "approved",
  deviationNo: "DEV-001",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  deletedAt: null,
};

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function zipFilenames(buffer: Buffer): string[] {
  return Object.keys(new PizZip(buffer).files).filter((name) => !name.endsWith("/"));
}

describe("buildCompleteRecordExportZip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listReportManagerIds).mockResolvedValue([]);
    vi.mocked(listReportSignatures).mockResolvedValue([]);
    vi.mocked(listAuditEvents).mockResolvedValue([]);
    vi.mocked(exportAuditEventsCsv).mockResolvedValue("csv");
    vi.mocked(exportAuditEventsPdf).mockResolvedValue(Buffer.from("pdf"));
    vi.mocked(generateReportDocx).mockResolvedValue(Buffer.from("docx"));
  });

  it("excludes audit trail files when includeAuditTrail is false", async () => {
    mockSelectOnce([report]);
    mockSelectOnce([]);
    mockSelectOnce([]);
    mockSelectOnce([]);

    const result = await buildCompleteRecordExportZip(report.id, {
      includeAuditTrail: false,
    });

    expect(result).not.toBeNull();
    expect(zipFilenames(result!.buffer)).toEqual([
      "metadata.xml",
      "version-history.csv",
      "investigation-report.docx",
    ]);
    expect(listAuditEvents).not.toHaveBeenCalled();
    expect(exportAuditEventsCsv).not.toHaveBeenCalled();
    expect(exportAuditEventsPdf).not.toHaveBeenCalled();
  });

  it("includes audit trail files when includeAuditTrail is true", async () => {
    mockSelectOnce([report]);
    mockSelectOnce([]);
    mockSelectOnce([]);
    mockSelectOnce([]);

    const result = await buildCompleteRecordExportZip(report.id, {
      includeAuditTrail: true,
    });

    expect(result).not.toBeNull();
    expect(zipFilenames(result!.buffer)).toEqual([
      "metadata.xml",
      "audit-trail.csv",
      "audit-trail.pdf",
      "version-history.csv",
      "investigation-report.docx",
    ]);
    expect(listAuditEvents).toHaveBeenCalledWith({
      reportId: report.id,
      limit: 10_000,
    });
  });
});
