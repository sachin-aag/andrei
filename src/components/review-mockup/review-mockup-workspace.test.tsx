// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewMockupWorkspace } from "./review-mockup-workspace";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => (
    // Test double for next/image — not a production <img>.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} />
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ReviewMockupWorkspace", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("opens on Agents with the sample protocol", () => {
    render(<ReviewMockupWorkspace />);
    expect(screen.getByTestId("review-mockup-workspace")).toBeInTheDocument();
    expect(screen.getAllByText("DVP-0142").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Design Traceability Gaps")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /AX-7 Irrigated RF Ablation Catheter/i,
      })
    ).toBeInTheDocument();
  });

  it("runs Design Traceability Gaps and jumps to the coverage statement", async () => {
    const user = userEvent.setup();
    render(<ReviewMockupWorkspace />);

    await user.click(screen.getByTestId("review-agent-traceability-gaps"));
    expect(screen.getByRole("button", { name: /run on dvp-0142/i })).toBeInTheDocument();
    await user.click(screen.getByTestId("review-run-agent"));
    expect(screen.getByTestId("review-agent-progress")).toBeInTheDocument();
    expect(
      await screen.findByText(/DI-038 \(electrical isolation\) has no test/i, undefined, {
        timeout: 4000,
      })
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: /show in document/i })[0]!
    );
    const hit = document.getElementById("coverage-statement");
    expect(hit).toHaveAttribute("data-active", "true");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("applies the TM-02 tracked change", async () => {
    const user = userEvent.setup();
    render(<ReviewMockupWorkspace />);

    await user.click(
      screen.getByTestId("review-agent-acceptance-objectivity")
    );
    await user.click(screen.getByTestId("review-run-agent"));
    expect(
      await screen.findByText(/Subjective acceptance criterion/i, undefined, {
        timeout: 4000,
      })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /apply as tracked change/i }));
    expect(document.querySelector(".suggestion-insert")).toHaveTextContent(
      /Measured force within ±5 g/i
    );
    expect(
      screen.getByRole("button", { name: /applied as tracked change/i })
    ).toBeDisabled();
  });

  it("opens playbooks, skills, and the trace matrix", async () => {
    const user = userEvent.setup();
    render(<ReviewMockupWorkspace />);

    await user.click(screen.getByRole("button", { name: /^playbooks$/i }));
    await user.click(screen.getByTestId("review-playbook-audit-memory"));
    expect(screen.getByText("AF-02")).toBeInTheDocument();
    expect(screen.getByText(/Repeats 483 Obs. 3/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^skills$/i }));
    await user.click(screen.getByTestId("review-skill-dv-matrix"));
    expect(screen.getByText("Extracted from DVP-0142")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send to dvr_tracker/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^trace$/i }));
    const trace = screen.getByTestId("review-trace-list");
    expect(within(trace).getByText("DI-038")).toBeInTheDocument();
    expect(within(trace).getByText("No test")).toBeInTheDocument();
  });

  it("switches Document and Agent chrome", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewMockupWorkspace />);
    const switchBtn = screen.getByTestId("review-mockup-chrome-switch");
    expect(switchBtn).toHaveTextContent("Switch to Agent");
    await user.click(switchBtn);
    expect(switchBtn).toHaveTextContent("Switch to Document");
    const body = container.querySelector('[data-testid="review-mockup-workspace"] > div:last-child');
    const first = body?.firstElementChild;
    expect(first).toContainElement(screen.getByTestId("review-mockup-rail"));
  });
});
