// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TEMPLATE_READY_HINT, TemplateReadyBadge } from "./ready-badge";

describe("TemplateReadyBadge", () => {
  it("shows the complete-template explanation on hover", async () => {
    const user = userEvent.setup();
    render(<TemplateReadyBadge />);

    await user.hover(screen.getByTestId("template-ready-badge"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      TEMPLATE_READY_HINT
    );
  });
});
