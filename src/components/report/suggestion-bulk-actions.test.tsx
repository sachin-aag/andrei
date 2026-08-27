// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SuggestionBulkActions } from "./suggestion-bulk-actions";

describe("SuggestionBulkActions", () => {
  it("hides when there is only one suggestion", () => {
    render(
      <SuggestionBulkActions
        queueTotal={1}
        pending={false}
        canResolve
        resolveHint="locked"
        onAcceptAll={() => {}}
        onDismissAll={() => {}}
      />
    );

    expect(screen.queryByTestId("suggestion-bulk-actions")).not.toBeInTheDocument();
  });

  it("shows Apply all and Dismiss all when a queue exists", async () => {
    const user = userEvent.setup();
    const onAcceptAll = vi.fn();
    const onDismissAll = vi.fn();

    render(
      <SuggestionBulkActions
        queueTotal={3}
        pending={false}
        canResolve
        resolveHint="locked"
        onAcceptAll={onAcceptAll}
        onDismissAll={onDismissAll}
      />
    );

    await user.click(screen.getByRole("button", { name: /^apply all$/i }));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /^dismiss all$/i }));
    expect(onDismissAll).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while a resolve is in flight", () => {
    render(
      <SuggestionBulkActions
        queueTotal={2}
        pending
        canResolve
        resolveHint="locked"
        onAcceptAll={() => {}}
        onDismissAll={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /^apply all$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^dismiss all$/i })).toBeDisabled();
  });
});
