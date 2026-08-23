// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERGENT_PACK, DEMO_PACK, getCustomerPack } from "@/lib/customers/packs";
import { ReportExportButton } from "./report-export-button";

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

  it("shows a single Export DOCX link on demo", () => {
    render(<ReportExportButton reportId="report-1" />);

    const link = screen.getByRole("link", { name: /export docx/i });
    expect(link).toHaveAttribute("href", "/api/reports/report-1/export");
    expect(
      screen.queryByRole("button", { name: /more export options/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /without citations/i })
    ).not.toBeInTheDocument();
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
    ).toHaveAttribute(
      "href",
      "/api/reports/report-1/export?omitCitations=1"
    );
  });
});
