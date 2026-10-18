// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkProductViewOnlyBanner } from "./work-product-view-only-banner";

describe("WorkProductViewOnlyBanner", () => {
  it("tells the engineer the report copy is view-only", () => {
    render(<WorkProductViewOnlyBanner product="Report" />);
    expect(screen.getByTestId("report-view-only-banner")).toHaveTextContent(
      "View only. Edits stay in the top-left report."
    );
  });

  it("tells the engineer the analytics copy is view-only", () => {
    render(<WorkProductViewOnlyBanner product="Analytics" />);
    expect(screen.getByTestId("analytics-view-only-banner")).toHaveTextContent(
      "View only. Edits stay in the other Analytics pane."
    );
  });
});
