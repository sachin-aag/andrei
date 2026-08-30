// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FieldInfoIcon } from "./field-info";

describe("FieldInfoIcon", () => {
  it("shows the explanation on hover", async () => {
    const user = userEvent.setup();
    render(
      <FieldInfoIcon
        label="Legend"
        text="Colors dots, lines, or stacked columns by this column."
        testId="legend-info"
      />
    );

    await user.hover(screen.getByTestId("legend-info"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /colors dots, lines, or stacked columns/i
    );
  });
});
