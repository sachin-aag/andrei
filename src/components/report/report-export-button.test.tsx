// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportExportButton, exportHref } from "./report-export-button";

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

describe("ReportExportButton", () => {
  it("exports in one click, without a variant menu", () => {
    render(<ReportExportButton reportId="report-1" />);

    expect(screen.getByRole("link", { name: /export docx/i })).toHaveAttribute(
      "href",
      "/api/reports/report-1/export"
    );
    expect(
      screen.queryByRole("button", { name: /more export options/i })
    ).not.toBeInTheDocument();
  });
});

describe("exportHref", () => {
  it("appends omitCitations only when asked", () => {
    expect(exportHref("r1", false)).toBe("/api/reports/r1/export");
    expect(exportHref("r1", true)).toBe("/api/reports/r1/export?omitCitations=1");
  });
});
