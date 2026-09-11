// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ProductWalkthroughProvider } from "@/components/walkthrough/product-walkthrough";

const push = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@/lib/customers/packs", () => ({
  getCustomerPack: () => ({
    branding: { productNameShort: "Andrei" },
    insightsEnabled: true,
    statisticalAnalysisEnabled: true,
  }),
}));

vi.mock("@/lib/document-types", () => ({
  listDocumentTypes: () => [{ label: "Investigation Report" }],
}));

function wrapper(children: ReactNode) {
  return (
    <ProductWalkthroughProvider role="engineer">
      {children}
    </ProductWalkthroughProvider>
  );
}

describe("ProductWalkthroughProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/";
  });

  it("shows the welcome step for a first-time user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "not_started",
          stepId: null,
        }),
      })
    );

    render(wrapper(<div>dashboard</div>));

    expect(
      await screen.findByRole("dialog", { name: /welcome to andrei/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /let's go/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /don't show this again/i })
    ).toBeInTheDocument();
  });

  it("advances from welcome to the reports step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "in_progress",
          stepId: "welcome",
        }),
      })
    );

    const user = userEvent.setup();
    render(wrapper(<div>dashboard</div>));
    await screen.findByRole("dialog", { name: /welcome to andrei/i });
    await user.click(screen.getByRole("button", { name: /let's go/i }));
    expect(
      await screen.findByRole("heading", { name: /your reports live here/i })
    ).toBeInTheDocument();
  });

  it("resumes from the saved step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "in_progress",
          stepId: "create-report",
        }),
      })
    );

    render(wrapper(<div>dashboard</div>));

    expect(
      await screen.findByRole("heading", { name: /start here: create a report/i })
    ).toBeInTheDocument();
  });

  it("does not show the tour after it was dismissed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "dismissed",
          stepId: "welcome",
        }),
      })
    );

    render(wrapper(<div>dashboard</div>));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not show the tour after it was completed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "completed",
          stepId: "done",
        }),
      })
    );

    render(wrapper(<div>dashboard</div>));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("persists dismissed when Don't show this again is clicked", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return {
          ok: true,
          json: async () => ({ status: "dismissed", stepId: "welcome" }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          status: "in_progress",
          stepId: "welcome",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(wrapper(<div>dashboard</div>));
    await screen.findByRole("dialog");

    await user.click(
      screen.getByRole("button", { name: /don't show this again/i })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me/walkthrough",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed", stepId: "welcome" }),
      })
    );
  });

  it("persists dismissed when Escape is pressed", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return {
          ok: true,
          json: async () => ({ status: "dismissed", stepId: "welcome" }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          status: "in_progress",
          stepId: "welcome",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(wrapper(<div>dashboard</div>));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me/walkthrough",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed", stepId: "welcome" }),
      })
    );
  });

  it("hides Document or Agent on the dashboard until a report is open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "in_progress",
          stepId: "chrome",
        }),
      })
    );

    const { rerender } = render(wrapper(<div>dashboard</div>));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    pathname = "/reports/abc/edit";
    rerender(wrapper(<div>report</div>));

    expect(
      await screen.findByRole("heading", { name: /document or agent/i })
    ).toBeInTheDocument();
  });

  it("opens Document or Agent when a report is created from the create-report card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "in_progress",
          stepId: "create-report",
        }),
      })
    );

    const { rerender } = render(wrapper(<div>dashboard</div>));
    expect(
      await screen.findByRole("heading", { name: /start here: create a report/i })
    ).toBeInTheDocument();

    pathname = "/reports/abc/edit";
    rerender(wrapper(<div>report</div>));

    expect(
      await screen.findByRole("heading", { name: /document or agent/i })
    ).toBeInTheDocument();
  });
});
