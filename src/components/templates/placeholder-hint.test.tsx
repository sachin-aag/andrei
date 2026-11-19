// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_WORD_EXPORT_HINT,
  PlaceholderHint,
} from "./placeholder-hint";

describe("PlaceholderHint", () => {
  it("shows the placeholder explanation on hover", async () => {
    const user = userEvent.setup();
    render(<PlaceholderHint />);

    await user.hover(screen.getByTestId("template-placeholder-hint"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      PLACEHOLDER_WORD_EXPORT_HINT
    );
  });
});
