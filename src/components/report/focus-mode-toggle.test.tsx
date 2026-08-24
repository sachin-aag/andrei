// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  FocusModeToggle,
  isFocusModeShortcut,
} from "@/components/report/focus-mode-toggle";

describe("isFocusModeShortcut", () => {
  it("matches Ctrl/Cmd+Shift+F and ignores other chords", () => {
    expect(
      isFocusModeShortcut(
        new KeyboardEvent("keydown", { key: "f", shiftKey: true, ctrlKey: true })
      )
    ).toBe(true);
    expect(
      isFocusModeShortcut(
        new KeyboardEvent("keydown", { key: "F", shiftKey: true, metaKey: true })
      )
    ).toBe(true);
    expect(
      isFocusModeShortcut(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true })
      )
    ).toBe(false);
    expect(
      isFocusModeShortcut(
        new KeyboardEvent("keydown", { key: "f", shiftKey: true, altKey: true, ctrlKey: true })
      )
    ).toBe(false);
  });
});

describe("FocusModeToggle", () => {
  it("toggles with the button and reports pressed state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <FocusModeToggle enabled={false} onToggle={onToggle} />
    );

    const button = screen.getByRole("button", { name: /focus/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<FocusModeToggle enabled onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: /focus/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("On")).toBeInTheDocument();
  });

  it("toggles from the keyboard shortcut", () => {
    const onToggle = vi.fn();
    render(<FocusModeToggle enabled={false} onToggle={onToggle} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "f",
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not toggle from the shortcut while a dialog is open", () => {
    const onToggle = vi.fn();
    render(
      <>
        <div role="dialog">
          <input aria-label="dialog field" />
        </div>
        <FocusModeToggle enabled={false} onToggle={onToggle} />
      </>
    );

    screen.getByLabelText("dialog field").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "f",
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(onToggle).not.toHaveBeenCalled();
  });
});
