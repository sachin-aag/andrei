// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ProductWalkthroughProvider } from "@/components/walkthrough/product-walkthrough";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/analytics/events", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@/lib/customers/packs", () => ({
  getCustomerPack: () => ({
    branding: { productNameShort: "Andrei" },
  }),
}));

vi.mock("@/lib/document-types", () => ({
  listDocumentTypes: () => [{ label: "Investigation Report" }],
}));

function wrapper(children: ReactNode) {
  return (
    <ProductWalkthroughProvider userId="u1" role="engineer">
      {children}
    </ProductWalkthroughProvider>
  );
}

describe("ProductWalkthroughProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("shows the welcome step for a first-time user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "not_started",
          stepId: null,
          sessionKey: "sess-1",
        }),
      })
    );

    render(wrapper(<div>dashboard</div>));

    expect(
      await screen.findByRole("dialog", { name: /welcome to andrei/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /let's go/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /don't show this tour again/i })
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
          sessionKey: "sess-1",
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
          sessionKey: "sess-1",
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
          sessionKey: "sess-1",
        }),
      })
    );

    render(wrapper(<div>dashboard</div>));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("hides for this session when Skip for now is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "in_progress",
        stepId: "welcome",
        sessionKey: "sess-1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(wrapper(<div>dashboard</div>));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /^skip for now$/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("andrei:product-tour:paused")).toBe(
      "u1:sess-1"
    );
  });

  it("persists dismissed when Don't show this tour again is clicked", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
          sessionKey: "sess-1",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(wrapper(<div>dashboard</div>));
    await screen.findByRole("dialog");

    await user.click(
      screen.getByRole("button", { name: /don't show this tour again/i })
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

  it("shows the tour again after skip when a new login session starts", async () => {
    sessionStorage.setItem("andrei:product-tour:paused", "u1:sess-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "in_progress",
          stepId: "reports",
          sessionKey: "sess-2",
        }),
      })
    );

    render(wrapper(<div>dashboard</div>));

    expect(
      await screen.findByRole("heading", { name: /your reports live here/i })
    ).toBeInTheDocument();
  });
});
