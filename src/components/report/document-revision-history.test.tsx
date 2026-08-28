// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentRevisionHistory } from "./document-revision-history";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DocumentRevisionHistory", () => {
  it("shows empty copy when the assistant has not written a version", async () => {
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
      screen.getByText("Versions appear after the assistant edits the document.")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("document-revision-compare")).not.toBeInTheDocument();
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
              createdBy: null,
            },
            {
              id: "v2",
              revisionNo: 2,
              source: "agent_turn",
              summary: "Replaced temperature with humidity from the logger.",
              createdAt: "2026-08-28T10:05:00.000Z",
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
    await user.click(screen.getByTestId("document-revision-compare"));
    expect(onCompare).toHaveBeenCalledWith({ from: 1, to: 2 });
  });
});
