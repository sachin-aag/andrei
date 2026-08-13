// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateReportButton } from "@/components/dashboard/create-report-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from "sonner";
import { getCustomerPack, DEMO_PACK, MJ_PACK } from "@/lib/customers/packs";

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

const managers = [
  { id: "manager-1", name: "Test Manager", title: "QA Manager" },
];

describe("CreateReportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
  });

  it("opens the create dialog", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(
      screen.getByRole("heading", { name: /create investigation report/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/deviation number/i)).toBeInTheDocument();
  });

  it("shows toast when deviation number is empty", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(toast.error).toHaveBeenCalledWith("Deviation Number is required");
  });

  it("closes the dialog on cancel", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(
      screen.queryByRole("heading", { name: /create investigation report/i })
    ).not.toBeInTheDocument();
  });

  it("does not show a Word-body field on demo", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(
      screen.queryByLabelText(/existing report/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/documents \(optional\)/i)).toBeInTheDocument();
  });

  it("shows a Word-body field when the MJ pack is active", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(MJ_PACK);
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(screen.getByLabelText(/existing report/i)).toBeInTheDocument();
    expect(screen.getByText(/documents \(optional\)/i)).toBeInTheDocument();
  });
});
