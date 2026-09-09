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

  it("splits two files packed into one bracket into two links", async () => {
    const onOpen = vi.fn();
    render(
      <>
        {linkifyCitationText(
          "See [RTM for E-PR-068,.pdf, p. 100, CSV-RTM-PR-053.pdf, p. 5].",
          onOpen
        )}
      </>
    );
    const links = screen.getAllByTestId("citation-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("RTM for E-PR-068,.pdf, p. 100");
    expect(links[1]).toHaveTextContent("CSV-RTM-PR-053.pdf, p. 5");
    await userEvent.click(links[0]!);
    expect(onOpen).toHaveBeenCalledWith("[RTM for E-PR-068,.pdf, p. 100]");
    await userEvent.click(links[1]!);
    expect(onOpen).toHaveBeenCalledWith("[CSV-RTM-PR-053.pdf, p. 5]");
  });

  it("keeps commas inside a filename as one link", async () => {
    const onOpen = vi.fn();
    const cite =
      "[URS-FP-21-006 vial washinh, sterilization, filling and sealing machine.pdf, p. 16]";
    render(<>{linkifyCitationText(`1. ${cite}`, onOpen)}</>);
    const links = screen.getAllByTestId("citation-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent(cite);
    await userEvent.click(links[0]!);
    expect(onOpen).toHaveBeenCalledWith(cite);
  });

  it("keeps repeated p. N lists as one link", async () => {
    const onOpen = vi.fn();
    const cite =
      "[Master PMC-PR-014-R03 Filling and Capping Machine.pdf, p. 1, p. 2]";
    render(<>{linkifyCitationText(`2. ${cite}`, onOpen)}</>);
    const links = screen.getAllByTestId("citation-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent(cite);
    await userEvent.click(links[0]!);
    expect(onOpen).toHaveBeenCalledWith(cite);
  });
});
