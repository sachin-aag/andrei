// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentRevisionHistory } from "./document-revision-history";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DocumentRevisionHistory", () => {
  it("shows empty copy when there are no versions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ revisions: [] }),
      })
    );
    const user = userEvent.setup();
    render(
      <DocumentRevisionHistory
        reportId="r1"
        compare={null}
        onCompare={vi.fn()}
        onExitCompare={vi.fn()}
      />
    );
    await user.click(screen.getByTestId("document-revision-history"));
    expect(
      screen.getByText(
        "Versions appear after you edit the document or the assistant writes to it."
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId("document-revision-compare")).not.toBeInTheDocument();
  });

  it("closes when clicking outside the panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ revisions: [] }),
      })
    );
    const user = userEvent.setup();
    render(
      <div>
        <DocumentRevisionHistory
          reportId="r1"
          compare={null}
          onCompare={vi.fn()}
          onExitCompare={vi.fn()}
        />
        <button type="button">Outside</button>
      </div>
    );
    await user.click(screen.getByTestId("document-revision-history"));
    expect(
      screen.getByText(
        "Versions appear after you edit the document or the assistant writes to it."
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(
      screen.queryByText(
        "Versions appear after you edit the document or the assistant writes to it."
      )
    ).not.toBeInTheDocument();
  });

  it("stays open when clicking inside the panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ revisions: [] }),
      })
    );
    const user = userEvent.setup();
    render(
      <DocumentRevisionHistory
        reportId="r1"
        compare={null}
        onCompare={vi.fn()}
        onExitCompare={vi.fn()}
      />
    );
    await user.click(screen.getByTestId("document-revision-history"));
    const emptyCopy = screen.getByText(
      "Versions appear after you edit the document or the assistant writes to it."
    );
    await user.click(emptyCopy);
    expect(emptyCopy).toBeInTheDocument();
  });

  it("compares the latest two versions from History", async () => {
    const onCompare = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          revisions: [
            {
              id: "v1",
              revisionNo: 1,
              source: "agent_turn",
              summary: "Added temperature drift from the batch record.",
              createdAt: "2026-08-28T10:00:00.000Z",
              updatedAt: "2026-08-28T10:00:00.000Z",
              createdBy: null,
            },
            {
              id: "v2",
              revisionNo: 2,
              source: "manual",
              summary: "Edited Define",
              createdAt: "2026-08-28T10:05:00.000Z",
              updatedAt: "2026-08-28T10:06:00.000Z",
              createdBy: null,
            },
          ],
        }),
      })
    );
    const user = userEvent.setup();
    render(
      <DocumentRevisionHistory
        reportId="r1"
        compare={null}
        onCompare={onCompare}
        onExitCompare={vi.fn()}
      />
    );
    await user.click(screen.getByTestId("document-revision-history"));
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText(/Agent/)).toBeInTheDocument();
    expect(screen.getByText(/Edits/)).toBeInTheDocument();
    await user.click(screen.getByTestId("document-revision-compare"));
    expect(onCompare).toHaveBeenCalledWith({ from: 1, to: 2 });
  });

  it("shows analytics empty copy and fetches analytics revisions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revisions: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <DocumentRevisionHistory
        reportId="r1"
        surface="analytics"
        compare={null}
        onCompare={vi.fn()}
        onExitCompare={vi.fn()}
      />
    );
    await user.click(screen.getByTestId("analytics-revision-history"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/r1/analytics/revisions"
    );
    expect(
      screen.getByText(
        "Versions appear after you edit the worksheet or the assistant writes to it."
      )
    ).toBeInTheDocument();
  });
});
