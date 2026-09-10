// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMessageTargetTag } from "./chat-message-target-tag";

describe("ChatMessageTargetTag", () => {
  it("renders a Report pill", () => {
    render(<ChatMessageTargetTag target="report" />);
    expect(screen.getByTestId("chat-message-target-report")).toHaveTextContent(
      "Report"
    );
  });

  it("renders an Analytics pill", () => {
    render(<ChatMessageTargetTag target="analytics" />);
    expect(
      screen.getByTestId("chat-message-target-analytics")
    ).toHaveTextContent("Analytics");
  });

  it("renders nothing when the turn is untagged", () => {
    const { container } = render(<ChatMessageTargetTag target={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
