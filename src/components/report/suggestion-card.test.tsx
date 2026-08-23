// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  SuggestionQueueBridgeCard,
  suggestionQueueBridgeCopy,
} from "@/components/report/suggestion-card";

describe("SuggestionQueueBridgeCard", () => {
  it("offers Go to next and Dismiss", () => {
    render(
      <SuggestionQueueBridgeCard
        remainingTotal={2}
        pending={false}
        onGo={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /go to next/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("calls onGo or onDismiss, and not the other", async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    const onDismiss = vi.fn();

    const { rerender } = render(
      <SuggestionQueueBridgeCard
        remainingTotal={1}
        pending={false}
        onGo={onGo}
        onDismiss={onDismiss}
      />
    );

    await user.click(screen.getByRole("button", { name: /go to next/i }));
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    rerender(
      <SuggestionQueueBridgeCard
        remainingTotal={1}
        pending={false}
        onGo={onGo}
        onDismiss={onDismiss}
      />
    );

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it("names the other section when the next card is not in this one", () => {
    render(
      <SuggestionQueueBridgeCard
        remainingTotal={2}
        nextSectionLabel="Measure"
        pending={false}
        onGo={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(
      screen.getByText("2 suggestions remaining — next is in Measure.")
    ).toBeInTheDocument();
  });

  it("disables both actions while the jump is in flight", () => {
    render(
      <SuggestionQueueBridgeCard
        remainingTotal={3}
        pending
        onGo={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /go to next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeDisabled();
  });
});

describe("suggestionQueueBridgeCopy", () => {
  it("describes a same-section remainder", () => {
    expect(suggestionQueueBridgeCopy(1, null)).toBe(
      "1 suggestion remaining farther in this section."
    );
  });

  it("describes a remainder in another section", () => {
    expect(suggestionQueueBridgeCopy(1, "Measure")).toBe(
      "1 suggestion remaining in Measure."
    );
  });
});
