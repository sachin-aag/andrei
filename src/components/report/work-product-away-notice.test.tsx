// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkProductAwayNotice } from "./work-product-away-notice";

describe("WorkProductAwayNotice", () => {
  it("points report edits back to the top-left pane", () => {
    render(<WorkProductAwayNotice product="Report" />);
    expect(screen.getByTestId("report-away-notice")).toHaveTextContent(
      "top-left pane"
    );
  });

  it("points analytics edits at the other pane", () => {
    render(<WorkProductAwayNotice product="Analytics" />);
    expect(screen.getByTestId("analytics-away-notice")).toHaveTextContent(
      "another pane"
    );
  });
});
