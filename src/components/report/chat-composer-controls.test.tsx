// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CHAT_PACE_OPTIONS,
  ComposerSelect,
  DOCUMENT_CHAT_MODE_OPTIONS,
} from "./chat-composer-controls";

describe("ComposerSelect", () => {
  it("renders the in-box Agent pill without a fixed width", () => {
    render(
      <ComposerSelect
        value="agent"
        options={DOCUMENT_CHAT_MODE_OPTIONS}
        onChange={() => {}}
        ariaLabel="Assistant mode"
        variant="pill"
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Assistant mode" });
    expect(trigger.className).toContain("rounded-full");
    expect(trigger.className).not.toContain("w-[6rem]");
    expect(trigger).toHaveTextContent("Agent");
  });

  it("renders Quick/Deep as a ghost label without an icon", () => {
    render(
      <ComposerSelect
        value="quick"
        options={CHAT_PACE_OPTIONS}
        onChange={() => {}}
        ariaLabel="Answer depth"
        variant="ghost"
        showIcon={false}
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Answer depth" });
    expect(trigger.className).toContain("bg-transparent");
    expect(trigger).toHaveTextContent("Quick");
    expect(trigger.querySelector("svg.lucide-zap")).toBeNull();
  });
});
