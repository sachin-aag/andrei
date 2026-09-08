// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { linkifyCitationText } from "@/lib/citations/linkify-citation-text";

describe("linkifyCitationText", () => {
  it("turns a source citation into a button that opens the source bracket", async () => {
    const onOpen = vi.fn();
    render(
      <>{linkifyCitationText("Met spec [protocol.pdf, p. 3] today.", onOpen)}</>
    );
    const link = screen.getByTestId("citation-link");
    expect(link).toHaveTextContent("[protocol.pdf, p. 3]");
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith("[protocol.pdf, p. 3]");
  });

  it("opens the parked source when clicking a numbered marker", async () => {
    const onOpen = vi.fn();
    const numbered = new Map([[1, "[protocol.pdf, p. 3]"]]);
    render(<>{linkifyCitationText("Met spec [1] today.", onOpen, numbered)}</>);
    await userEvent.click(screen.getByTestId("citation-link"));
    expect(onOpen).toHaveBeenCalledWith("[protocol.pdf, p. 3]");
  });

  it("leaves placeholders and unresolved numbered markers as text", () => {
    const onOpen = vi.fn();
    render(
      <>{linkifyCitationText("Use [batch number] then marker [2].", onOpen)}</>
    );
    expect(screen.queryByTestId("citation-link")).not.toBeInTheDocument();
    expect(screen.getByText(/batch number/)).toBeInTheDocument();
  });
});
