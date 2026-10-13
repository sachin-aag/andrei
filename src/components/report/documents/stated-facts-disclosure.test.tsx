// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StatedFactsDisclosure } from "./stated-facts-disclosure";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const factA = {
  id: "fact-a",
  entityText: "URS-13",
  valueText: "−15 °C",
  sourceText: "URS-13 operating range is −15 °C.",
  authorName: "Ada Lovelace",
  createdAt: "2026-04-01T12:00:00.000Z",
};

const factB = {
  id: "fact-b",
  entityText: "URS-14",
  valueText: "20 °C",
  sourceText: "URS-14 is 20 °C.",
  authorName: "Grace Hopper",
  createdAt: "2026-04-02T12:00:00.000Z",
};

describe("StatedFactsDisclosure", () => {
  it("renders nothing and does not fetch when there is no report id", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<StatedFactsDisclosure reportId={undefined} />);
    expect(screen.queryByTestId("stated-facts")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides when the report has no stated facts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ facts: [], canDelete: true }))
    );
    render(<StatedFactsDisclosure reportId="report-a" />);
    await waitFor(() => {
      expect(screen.queryByTestId("stated-facts")).toBeNull();
    });
  });

  it("shows the author and drops the row after delete", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return jsonResponse({ ok: true });
      return jsonResponse({ facts: [factA], canDelete: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StatedFactsDisclosure reportId="report-a" />);
    expect(await screen.findByText("URS-13: −15 °C")).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Delete stated fact URS-13: −15 °C" })
    );
    await waitFor(() => {
      expect(screen.queryByText("URS-13: −15 °C")).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/report-a/stated-facts/fact-a",
      { method: "DELETE" }
    );
  });

  it("clears the previous report before the next list loads", async () => {
    const pendingB: { resolve?: (value: Response) => void } = {};
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes("report-b")) {
        return new Promise<Response>((resolve) => {
          pendingB.resolve = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ facts: [factA], canDelete: false }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<StatedFactsDisclosure reportId="report-a" />);
    expect(await screen.findByText("URS-13: −15 °C")).toBeTruthy();
    view.rerender(<StatedFactsDisclosure reportId="report-b" />);
    await waitFor(() => {
      expect(screen.queryByText("URS-13: −15 °C")).toBeNull();
    });
    expect(screen.queryByText("URS-14: 20 °C")).toBeNull();
    pendingB.resolve?.(jsonResponse({ facts: [factB], canDelete: false }));
    expect(await screen.findByText("URS-14: 20 °C")).toBeTruthy();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
  });
});
