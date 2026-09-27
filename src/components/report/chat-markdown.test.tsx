// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ChatMarkdown } from "@/components/report/chat-markdown";
import { ensureMathliveSsr } from "@/lib/math/mathlive-ssr";

const SCREENSHOT_SNIPPET = String.raw`AlignUSB beam profiler against the predefined **$\pm 20\%$** tolerance and **$<60$**
**s** alignment duration threshold [825-00101(RevA) Model 3 Perioguide DV Report.pdf, p. 4, 26, 163, 260].`;

describe("ChatMarkdown", () => {
  beforeAll(async () => {
    await ensureMathliveSsr();
  });

  it("renders inline latex instead of dollar delimiters", async () => {
    const { container } = render(
      <ChatMarkdown>{String.raw`tolerance **$\pm 20\%$**`}</ChatMarkdown>
    );

    await waitFor(() => {
      expect(container.querySelector("math")).not.toBeNull();
    });
    expect(container.textContent).not.toContain("$");
    expect(container.textContent).toContain("±");
    expect(container.textContent).toContain("20");
    expect(container.querySelector("strong")).not.toBeNull();
  });

  it("renders $<60$ instead of raw latex", async () => {
    const { container } = render(
      <ChatMarkdown>{String.raw`duration **$<60$** s`}</ChatMarkdown>
    );

    await waitFor(() => {
      expect(container.querySelector("math")).not.toBeNull();
    });
    expect(container.textContent).not.toContain("$<60$");
    expect(container.textContent).not.toContain("$\\lt");
    expect(container.textContent).toMatch(/60/);
  });

  it("renders the screenshot citation sentence with two equations", async () => {
    const { container } = render(<ChatMarkdown>{SCREENSHOT_SNIPPET}</ChatMarkdown>);

    await waitFor(() => {
      expect(container.querySelectorAll("math").length).toBe(2);
    });
    expect(container.textContent).not.toMatch(/\$\\pm/);
    expect(container.textContent).toContain("AlignUSB");
    expect(container.textContent).toContain("825-00101");
  });

  it("renders block latex", async () => {
    const { container } = render(
      <ChatMarkdown>{String.raw`$$\frac{a}{b}$$`}</ChatMarkdown>
    );

    await waitFor(() => {
      const math = container.querySelector("math");
      expect(math).not.toBeNull();
      expect(math?.getAttribute("display")).toBe("block");
    });
  });

  it("renders $N_2$ instead of dollar latex", async () => {
    const { container } = render(
      <ChatMarkdown>{"high-purity process Nitrogen ($N_2$),"}</ChatMarkdown>
    );

    await waitFor(() => {
      expect(container.querySelector("math")).not.toBeNull();
    });
    expect(container.textContent).not.toContain("$");
    expect(container.textContent).toMatch(/N/);
    expect(container.textContent).toMatch(/2/);
  });

  it("still renders GFM lists", () => {
    render(<ChatMarkdown>{"- one\n- two"}</ChatMarkdown>);
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
  });

  it("leaves dollar signs inside inline code", () => {
    render(<ChatMarkdown>{"Use `$x$` as a placeholder"}</ChatMarkdown>);
    expect(screen.getByText("$x$")).toBeInTheDocument();
  });

  it("turns source citations into buttons when a click handler is provided", async () => {
    const onOpenCitation = vi.fn();
    render(
      <ChatMarkdown onOpenCitation={onOpenCitation}>
        {String.raw`Output met spec [protocol.pdf, p. 3] for configuration A.`}
      </ChatMarkdown>
    );
    await userEvent.click(screen.getByTestId("citation-link"));
    expect(onOpenCitation).toHaveBeenCalledWith("[protocol.pdf, p. 3]");
  });

  it("opens the parked source for a numbered citation in the same message", async () => {
    const onOpenCitation = vi.fn();
    render(
      <ChatMarkdown onOpenCitation={onOpenCitation}>
        {["Output met spec [1].", "", "Citations:", "1. [protocol.pdf, p. 3]"].join(
          "\n"
        )}
      </ChatMarkdown>
    );
    const links = screen.getAllByTestId("citation-link");
    expect(links.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(links[0]!);
    expect(onOpenCitation).toHaveBeenCalledWith("[protocol.pdf, p. 3]");
  });

  it("does not linkify citations without a click handler", () => {
    render(
      <ChatMarkdown>
        {String.raw`Output met spec [protocol.pdf, p. 3] for configuration A.`}
      </ChatMarkdown>
    );
    expect(screen.queryByTestId("citation-link")).not.toBeInTheDocument();
  });

  it("splits two files packed into one bracket into two links", async () => {
    const onOpenCitation = vi.fn();
    render(
      <ChatMarkdown onOpenCitation={onOpenCitation}>
        {String.raw`See [RTM for E-PR-068,.pdf, p. 100, CSV-RTM-PR-053.pdf, p. 5].`}
      </ChatMarkdown>
    );
    const links = screen.getAllByTestId("citation-link");
    expect(links).toHaveLength(2);
    await userEvent.click(links[1]!);
    expect(onOpenCitation).toHaveBeenCalledWith("[CSV-RTM-PR-053.pdf, p. 5]");
  });

  it("turns <br> in a GFM table cell into a line break", () => {
    const markdown = [
      "| Section | IDs | Detail |",
      "| --- | --- | --- |",
      "| Core Process (URS-1 to URS-29)<br>• Capacity, MOC | `URS-1`, `URS-7`<br>`URS-58` | • URS-3 (Shell Op Temp)<br>• URS-4 (Shell Op Press) [User Requirement Specification.PDF, p. 6-7] |",
    ].join("\n");
    const { container } = render(<ChatMarkdown>{markdown}</ChatMarkdown>);
    expect(container.querySelectorAll("td br").length).toBe(3);
    expect(container.textContent).not.toMatch(/<br/i);
    expect(container.textContent).toContain("Capacity, MOC");
    expect(container.textContent).toContain("URS-58");
    expect(container.textContent).toContain("URS-4 (Shell Op Press)");
  });

  it("turns paragraph <br/> tags into line breaks", () => {
    const { container } = render(
      <ChatMarkdown>{"Line one<br/>Line two<br />Line three"}</ChatMarkdown>
    );
    expect(container.querySelectorAll("br")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/<br/i);
    expect(container.textContent).toContain("Line one");
    expect(container.textContent).toContain("Line three");
  });

  it("leaves <br> inside inline code literal", () => {
    render(<ChatMarkdown>{"Use `<br>` in table cells"}</ChatMarkdown>);
    expect(screen.getByText("<br>")).toBeInTheDocument();
  });

  it("linkifies a citation after a <br> in a table cell", async () => {
    const onOpenCitation = vi.fn();
    render(
      <ChatMarkdown onOpenCitation={onOpenCitation}>
        {[
          "| A | B |",
          "| --- | --- |",
          "| see<br>[urs.pdf, p. 6] | y |",
        ].join("\n")}
      </ChatMarkdown>
    );
    await userEvent.click(screen.getByTestId("citation-link"));
    expect(onOpenCitation).toHaveBeenCalledWith("[urs.pdf, p. 6]");
  });

  it("splits a compact and-cite only when both attached filenames are known", async () => {
    const onOpenCitation = vi.fn();
    const { rerender } = render(
      <ChatMarkdown onOpenCitation={onOpenCitation}>
        {String.raw`See [E-PR-068 and E-PR-071.pdf, p. 1].`}
      </ChatMarkdown>
    );
    expect(screen.getAllByTestId("citation-link")).toHaveLength(1);

    rerender(
      <ChatMarkdown
        onOpenCitation={onOpenCitation}
        knownFilenames={["E-PR-068.pdf", "E-PR-071.pdf"]}
      >
        {String.raw`See [E-PR-068 and E-PR-071.pdf, p. 1].`}
      </ChatMarkdown>
    );
    const links = screen.getAllByTestId("citation-link");
    expect(links).toHaveLength(2);
    await userEvent.click(links[0]!);
    expect(onOpenCitation).toHaveBeenCalledWith("[E-PR-068]");
  });

  it("rewrites attachment and plot ids into filenames and titles", () => {
    const attachmentId = "me1q4zzhb1me0wwskpmqfw7i";
    const analysisId = "zbud2fet70yu88pvfpccjtko";
    const { container } = render(
      <ChatMarkdown
        filenameByAttachmentId={
          new Map([[attachmentId, "Lab Results_20250320092518.pdf"]])
        }
        labelByInternalId={new Map([[analysisId, "Assay scatter"]])}
      >
        {`See id=${attachmentId} and [${analysisId}]. Output met spec [${attachmentId}, p. 3].`}
      </ChatMarkdown>
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain(attachmentId);
    expect(text).not.toContain(analysisId);
    expect(text).toContain("Lab Results.pdf");
    expect(text).toContain("Assay scatter");
  });

  it("linkifies a rewritten attachment-id citation", async () => {
    const onOpenCitation = vi.fn();
    const attachmentId = "me1q4zzhb1me0wwskpmqfw7i";
    render(
      <ChatMarkdown
        onOpenCitation={onOpenCitation}
        filenameByAttachmentId={
          new Map([[attachmentId, "protocol.pdf"]])
        }
      >
        {`Output met spec [${attachmentId}, p. 3] today.`}
      </ChatMarkdown>
    );
    await userEvent.click(screen.getByTestId("citation-link"));
    expect(onOpenCitation).toHaveBeenCalledWith("[protocol.pdf, p. 3]");
  });
});
