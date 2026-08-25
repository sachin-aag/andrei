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
import {
  CONVERGENT_PACK,
  DEMO_PACK,
  getCustomerPack,
  MJ_PACK,
} from "@/lib/customers/packs";

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

  it("does not show a Word-body field or attachment dropzone on demo", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(
      screen.queryByLabelText(/existing report/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/documents \(optional\)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/drop pdfs or word docs/i)
    ).not.toBeInTheDocument();
  });

  it("shows a Word-body field without an attachment dropzone when the MJ pack is active", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(MJ_PACK);
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(screen.getByLabelText(/existing report/i)).toBeInTheDocument();
    expect(screen.queryByText(/documents \(optional\)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/drop pdfs or word docs/i)
    ).not.toBeInTheDocument();
  });

  it("offers software and mechanical DV on Convergent, not investigation", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    const typeSelect = screen.getByLabelText(/document type/i);
    expect(typeSelect).toHaveValue("design_verification");
    expect(
      screen.getByRole("option", { name: /design verification report/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /mechanical dv report/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /investigation/i })
    ).not.toBeInTheDocument();
  });
});
