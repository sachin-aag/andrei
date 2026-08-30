// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionAccordion } from "./section-accordion";

describe("SectionAccordion titles", () => {
  it("shows Purpose & Scope and Revision History without underscores", () => {
    const { rerender } = render(
      <SectionAccordion
        section="purpose_scope"
        count={1}
        isOpen
        onToggle={vi.fn()}
      >
        <span>criterion</span>
      </SectionAccordion>
    );
    expect(screen.getByRole("button", { expanded: true })).toHaveTextContent(
      "Purpose & Scope"
    );
    expect(screen.queryByText(/purpose_scope/)).not.toBeInTheDocument();

    rerender(
      <SectionAccordion
        section="revision_history"
        count={1}
        isOpen
        onToggle={vi.fn()}
      >
        <span>criterion</span>
      </SectionAccordion>
    );
    expect(screen.getByRole("button", { expanded: true })).toHaveTextContent(
      "Revision History"
    );
    expect(screen.queryByText(/revision_history/)).not.toBeInTheDocument();
  });
});
