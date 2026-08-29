// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERGENT_PACK, DEMO_PACK, getCustomerPack } from "@/lib/customers/packs";
import { ReportExportButton, exportHref } from "./report-export-button";
import { analyticsExportHref } from "@/lib/statistical-analysis/analytics-export-href";

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

describe("ReportExportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
  });

  it("shows a single Export DOCX link on demo investigation reports", () => {
    render(
      <ReportExportButton
        reportId="report-1"
        documentType="investigation_report"
      />
    );

    expect(screen.getByRole("link", { name: /export docx/i })).toHaveAttribute(
      "href",
      "/api/reports/report-1/export"
    );
    expect(
      screen.queryByRole("button", { name: /more export options/i })
    ).not.toBeInTheDocument();
  });

  it("offers a without-citations export on demo generic documents", async () => {
    const user = userEvent.setup();
    render(
      <ReportExportButton reportId="report-1" documentType="generic_document" />
    );

    expect(screen.getByRole("link", { name: /export docx/i })).toHaveAttribute(
      "href",
      "/api/reports/report-1/export"
    );

    await user.click(screen.getByRole("button", { name: /more export options/i }));
    expect(
      screen.getByRole("menuitem", { name: /export without citations/i })
    ).toHaveAttribute("href", "/api/reports/report-1/export?omitCitations=1");
  });

  it("offers Download original when a source Word file was uploaded", async () => {
    const user = userEvent.setup();
    render(
      <ReportExportButton
        reportId="report-1"
        sourceDocxFilename="memo.docx"
      />
    );

    await user.click(screen.getByRole("button", { name: /more export options/i }));
    const original = screen.getByRole("menuitem", { name: /download original/i });
    expect(original).toHaveAttribute("href", "/api/reports/report-1/source-docx");
  });

  it("adds a split-button menu with a without-citations option on Convergent", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    const user = userEvent.setup();
    render(<ReportExportButton reportId="report-1" />);

    expect(screen.getByRole("link", { name: /export docx/i })).toHaveAttribute(
      "href",
      "/api/reports/report-1/export"
    );

    await user.click(screen.getByRole("button", { name: /more export options/i }));

    expect(
      screen.getByRole("menuitem", { name: /^export docx$/i })
    ).toHaveAttribute("href", "/api/reports/report-1/export");
    expect(
      screen.getByRole("menuitem", { name: /export without citations/i })
    ).toHaveAttribute("href", "/api/reports/report-1/export?omitCitations=1");
  });

  it("shows Export XLSX on the analytics surface", () => {
    render(<ReportExportButton reportId="report-1" surface="analytics" />);

    expect(screen.getByRole("link", { name: /export xlsx/i })).toHaveAttribute(
      "href",
      analyticsExportHref("report-1", false)
    );
  });

  it("offers export with plots on the analytics surface", async () => {
    const user = userEvent.setup();
    render(<ReportExportButton reportId="report-1" surface="analytics" />);

    await user.click(screen.getByRole("button", { name: /more export options/i }));
    expect(
      screen.getByRole("menuitem", { name: /export with plots/i })
    ).toHaveAttribute("href", analyticsExportHref("report-1", true));
  });
});

describe("exportHref", () => {
  it("appends omitCitations only when asked", () => {
    expect(exportHref("r1", false)).toBe("/api/reports/r1/export");
    expect(exportHref("r1", true)).toBe("/api/reports/r1/export?omitCitations=1");
  });
});
