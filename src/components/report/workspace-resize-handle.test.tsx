// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceResizeHandle } from "./workspace-resize-handle";

describe("WorkspaceResizeHandle", () => {
  it("grows the right-hand chat panel when ArrowLeft is pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WorkspaceResizeHandle
        label="Resize assistant panel"
        edge="start"
        value={400}
        min={280}
        max={538}
        onChange={onChange}
      />
    );

    const handle = screen.getByRole("separator", {
      name: /resize assistant panel/i,
    });
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith(416);
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(384);
  });

  it("grows the documents panel when ArrowRight is pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WorkspaceResizeHandle
        label="Resize documents panel"
        edge="end"
        value={300}
        min={200}
        max={358}
        onChange={onChange}
      />
    );

    screen.getByRole("separator", { name: /resize documents panel/i }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(316);
  });

  it("jumps to min and max with Home and End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WorkspaceResizeHandle
        label="Resize assistant panel"
        edge="start"
        value={400}
        min={280}
        max={538}
        onChange={onChange}
      />
    );

    screen.getByRole("separator", { name: /resize assistant panel/i }).focus();
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith(280);
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith(538);
  });
});
