// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwitchToAnalyticsCard } from "./chat-switch-to-analytics";

describe("SwitchToAnalyticsCard", () => {
  it("switches the composer on click and keeps the confirmation visible", () => {
    const onSwitch = vi.fn();
    const { rerender } = render(
      <SwitchToAnalyticsCard onSwitch={onSwitch} composerOnAnalytics={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch to Analytics" }));
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(
      screen.getByText("Switched to Analytics. Sending your request.")
    ).toBeInTheDocument();

    rerender(
      <SwitchToAnalyticsCard onSwitch={onSwitch} composerOnAnalytics={true} />
    );
    expect(
      screen.getByText("Switched to Analytics. Sending your request.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch to Analytics" })
    ).not.toBeInTheDocument();
  });

  it("hides when the composer is already on Analytics", () => {
    const { container } = render(
      <SwitchToAnalyticsCard onSwitch={() => undefined} composerOnAnalytics />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
