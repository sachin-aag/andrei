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

const managers = [
  { id: "manager-1", name: "Test Manager", title: "QA Manager" },
];

describe("CreateReportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(toast.error).toHaveBeenCalledWith("Deviation number is required");
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
});
