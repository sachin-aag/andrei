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
});
