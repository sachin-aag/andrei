// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TableOfContentsPanel } from "./table-of-contents-panel";
import {
  getConvergentTableOfContents,
  type TableOfContentsEntry,
} from "@/lib/document-types/convergent/table-of-contents";

const SAMPLE_TOC: TableOfContentsEntry[] = [
  { label: "Purpose", sectionKey: "purpose" },
  {
    label: "2. Methods of Measurement",
    children: [
      { label: "2.1 Executed Protocol", sectionKey: "executed_protocol" },
    ],
  },
  { label: "Revision History" },
];

describe("TableOfContentsPanel", () => {
  it("scrolls to a section when a leaf entry is clicked", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();

    render(<TableOfContentsPanel entries={SAMPLE_TOC} onJumpToSection={onJump} />);

    await user.click(screen.getByRole("button", { name: "Purpose" }));
    expect(onJump).toHaveBeenCalledWith("purpose");

    await user.click(screen.getByRole("button", { name: "2.1 Executed Protocol" }));
    expect(onJump).toHaveBeenCalledWith("executed_protocol");
  });

  it("does not render group headers or static rows as buttons", () => {
    render(<TableOfContentsPanel entries={SAMPLE_TOC} onJumpToSection={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: "2. Methods of Measurement" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revision History" })).not.toBeInTheDocument();
    expect(screen.getByText("Revision History")).toBeInTheDocument();
  });

  it("nests software Methods children and jumps Test Equipment to its own section", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const toc = getConvergentTableOfContents("design_verification");
    expect(toc).not.toBeNull();

    render(<TableOfContentsPanel entries={toc!} onJumpToSection={onJump} />);

    expect(
      screen.queryByRole("button", { name: "Methods of Measurement" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Methods of Measurement")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Executed Protocol" }));
    expect(onJump).toHaveBeenCalledWith("methods_of_measurement");

    await user.click(screen.getByRole("button", { name: "Test Equipment" }));
    expect(onJump).toHaveBeenCalledWith("test_equipment");

    await user.click(
      screen.getByRole("button", { name: "Requirements Verified" })
    );
    expect(onJump).toHaveBeenCalledWith("results_and_discussions");
  });
});
