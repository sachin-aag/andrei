// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERGENT_PACK, DEMO_PACK, getCustomerPack } from "@/lib/customers/packs";
import { ReportActionsMenu } from "./report-actions-menu";

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

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /more report actions/i }));
  return user;
}

describe("ReportActionsMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
  });

  it("offers a single Export DOCX item on demo", async () => {
    render(<ReportActionsMenu reportId="report-1" />);
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /^export docx$/i })
    ).toHaveAttribute("href", "/api/reports/report-1/export");
    expect(
      screen.queryByRole("menuitem", { name: /without citations/i })
    ).not.toBeInTheDocument();
  });

  it("adds a without-citations item on Convergent", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    render(<ReportActionsMenu reportId="report-1" />);
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /^export docx$/i })
    ).toHaveAttribute("href", "/api/reports/report-1/export");
    expect(
      screen.getByRole("menuitem", { name: /export without citations/i })
    ).toHaveAttribute("href", "/api/reports/report-1/export?omitCitations=1");
  });

  it("hides expert review, audit trail, and track changes unless enabled", async () => {
    render(<ReportActionsMenu reportId="report-1" />);
    await openMenu();

    expect(
      screen.queryByRole("menuitem", { name: /andrei expert/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /audit trail/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /track changes/i })
    ).not.toBeInTheDocument();
  });

  it("runs the expert review handler from the menu", async () => {
    const onExpertReview = vi.fn();
    render(
      <ReportActionsMenu
        reportId="report-1"
        showExpertReview
        onExpertReview={onExpertReview}
      />
    );
    const user = await openMenu();

    await user.click(screen.getByRole("menuitem", { name: /andrei expert/i }));
    expect(onExpertReview).toHaveBeenCalledTimes(1);
  });

  it("toggles track changes from the menu", async () => {
    const onTrackChangesModeChange = vi.fn();
    render(
      <ReportActionsMenu
        reportId="report-1"
        showTrackChanges
        trackChangesMode={false}
        onTrackChangesModeChange={onTrackChangesModeChange}
      />
    );
    const user = await openMenu();

    const item = screen.getByRole("menuitemcheckbox", { name: /track changes/i });
    expect(item).toHaveAttribute("aria-checked", "false");

    await user.click(item);
    expect(onTrackChangesModeChange).toHaveBeenCalledWith(true);
  });
});
