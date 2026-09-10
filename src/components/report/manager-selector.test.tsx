// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ManagerSelector } from "@/components/report/manager-selector";

const managers = [
  { id: "mgr-1", name: "Alex Chen", title: "QA Manager" },
  { id: "mgr-2", name: "Blake Rivera", title: "Engineering Manager" },
];

describe("ManagerSelector", () => {
  it("uses custom search copy for vault sharing", async () => {
    const user = userEvent.setup();
    render(
      <ManagerSelector
        managers={managers}
        selectedIds={[]}
        onSelectedIdsChange={vi.fn()}
        placeholder="Add colleagues…"
        searchPlaceholder="Search colleagues…"
        noResultsMessage="No colleagues match your search."
        inDialog
      />
    );

    await user.click(
      screen.getByRole("combobox", { name: /add colleagues/i })
    );

    expect(
      screen.getByPlaceholderText("Search colleagues…")
    ).toBeInTheDocument();
  });
});
