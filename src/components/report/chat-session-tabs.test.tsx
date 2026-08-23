// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatSessionTabs } from "./chat-session-tabs";

describe("ChatSessionTabs", () => {
  it("renders a tab for each open chat with a status name and close control", () => {
    render(
      <ChatSessionTabs
        currentId="b"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        items={[
          { id: "a", title: "Draft Define", status: "running" },
          { id: "b", title: "Batch number", status: "questions" },
          { id: "c", title: "Improve CAPA", status: "done" },
        ]}
      />
    );

    const tabs = screen.getByRole("tablist", { name: "Open chats" });
    expect(tabs).toBeInTheDocument();
    expect(tabs).toHaveClass("[scrollbar-width:none]");
    expect(screen.getByRole("tab", { name: "Draft Define. Still working" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(screen.getByRole("tab", { name: "Batch number. Needs answers" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Improve CAPA. Ready" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Draft Define" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Batch number" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Improve CAPA" })).toBeInTheDocument();
  });

  it("selects a tab on click", async () => {
    const onSelect = vi.fn();
    render(
      <ChatSessionTabs
        currentId="a"
        onSelect={onSelect}
        onClose={vi.fn()}
        items={[
          { id: "a", title: "One", status: "done" },
          { id: "b", title: "Two", status: "running" },
        ]}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Two. Still working" }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("closes a tab without selecting it", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ChatSessionTabs
        currentId="a"
        onSelect={onSelect}
        onClose={onClose}
        items={[
          { id: "a", title: "One", status: "done" },
          { id: "b", title: "Two", status: "running" },
        ]}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Close Two" }));
    expect(onClose).toHaveBeenCalledWith("b");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
