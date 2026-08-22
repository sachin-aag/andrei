// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SuggestionQueueBridgeCard } from "@/components/report/suggestion-card";

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
