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

  it("leaves every export option to the export split button", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    render(<ReportActionsMenu auditHref="/reports/report-1/audit" />);
    await openMenu();

    expect(
      screen.queryByRole("menuitem", { name: /export/i })
    ).not.toBeInTheDocument();
  });

  it("hides expert review unless enabled", async () => {
    render(<ReportActionsMenu auditHref="/reports/report-1/audit" />);

    expect(
      screen.getByRole("button", { name: /more report actions/i })
    ).toHaveAttribute("data-walkthrough", "audit-trail");

    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /audit trail/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /andrei expert/i })
    ).not.toBeInTheDocument();
  });

  it("renders nothing when no action qualifies for the overflow", () => {
    const { container } = render(<ReportActionsMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("runs the expert review handler from the menu", async () => {
    const onExpertReview = vi.fn();
    render(
      <ReportActionsMenu
        showExpertReview
        onExpertReview={onExpertReview}
      />
    );
    const user = await openMenu();

    await user.click(screen.getByRole("menuitem", { name: /andrei expert/i }));
    expect(onExpertReview).toHaveBeenCalledTimes(1);
  });

  it("leaves track changes to the editor toolbar", async () => {
    render(<ReportActionsMenu auditHref="/reports/report-1/audit" />);
    await openMenu();

    expect(
      screen.queryByRole("menuitemcheckbox", { name: /track changes/i })
    ).not.toBeInTheDocument();
  });
});
