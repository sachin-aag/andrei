// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentCitationsRail } from "./document-citations-rail";

describe("DocumentCitationsRail", () => {
  it("shows an empty state when nothing is parked", () => {
    render(<DocumentCitationsRail citations={[]} />);

    expect(
      screen.getByRole("complementary", { name: /citations/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/numbered sources will appear here/i)).toBeInTheDocument();
  });

  it("lists parked sources and jumps to the matching bubble", async () => {
    HTMLElement.prototype.scrollIntoView = function () {};
    const user = userEvent.setup();
    const marker = document.createElement("span");
    marker.className = "citation-ref";
    marker.dataset.citationNumber = "1";
    const scroll = vi.spyOn(marker, "scrollIntoView").mockImplementation(() => {});
    document.body.appendChild(marker);

    render(
      <DocumentCitationsRail
        citations={[{ number: 1, source: "[protocol.pdf, p. 3]" }]}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /protocol\.pdf, p\. 3/i })
    );
    expect(scroll).toHaveBeenCalled();
    marker.remove();
  });
});
