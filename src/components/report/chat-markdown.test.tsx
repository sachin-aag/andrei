// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
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

  it("still renders GFM lists", () => {
    render(<ChatMarkdown>{"- one\n- two"}</ChatMarkdown>);
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
  });

  it("leaves dollar signs inside inline code", () => {
    render(<ChatMarkdown>{"Use `$x$` as a placeholder"}</ChatMarkdown>);
    expect(screen.getByText("$x$")).toBeInTheDocument();
  });
});
