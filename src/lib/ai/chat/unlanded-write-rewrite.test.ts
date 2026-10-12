import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  rewriteUnlandedWriteParts,
  UNLANDED_TABLE_NOTE,
  UNLANDED_WRITE_NOTE,
} from "./unlanded-write-rewrite";

function parts(
  text: string,
  tools: Array<{ name: string; status: string }> = []
): UIMessage["parts"] {
  return [
    ...tools.map((tool) => ({
      type: `tool-${tool.name}`,
      toolCallId: `${tool.name}-1`,
      state: "output-available",
      output: { status: tool.status },
    })),
    { type: "text", text },
  ] as UIMessage["parts"];
}

describe("rewriteUnlandedWriteParts", () => {
  it("strips a dumped markdown table and a table claim when create_table never proposed", () => {
    const next = rewriteUnlandedWriteParts(
      parts(
        [
          "I've proposed a table for 15.2.3.2.",
          "",
          "| Parameter | Calculation | Value | Remarks |",
          "| --- | --- | --- | --- |",
          "| H | NA | 3.9 m | Shell height |",
          "",
          "Apply the card when you are ready.",
        ].join("\n")
      )
    );
    const text = (next.find((part) => part.type === "text") as { text: string })
      .text;
    expect(text).not.toMatch(/I've proposed a table/i);
    expect(text).not.toContain("| Parameter |");
    expect(text).toContain(UNLANDED_TABLE_NOTE);
    expect(text).not.toContain(UNLANDED_WRITE_NOTE);
    expect(text).toContain("Apply the card when you are ready.");
  });

  it("keeps wrap-up when edit_table proposed a card", () => {
    const original = parts("I've proposed a table for 15.2.3.2.", [
      { name: "edit_table", status: "proposed" },
    ]);
    expect(rewriteUnlandedWriteParts(original)).toBe(original);
  });

  it("rewrites a table claim when only a prose card proposed", () => {
    const next = rewriteUnlandedWriteParts(
      parts("I've proposed a table under 15.2.3.2. The heading edit is waiting.", [
        { name: "propose_edit", status: "proposed" },
      ])
    );
    const text = (next.find((part) => part.type === "text") as { text: string })
      .text;
    expect(text).toContain(UNLANDED_TABLE_NOTE);
    expect(text).not.toContain(UNLANDED_WRITE_NOTE);
    expect(text).toContain("The heading edit is waiting.");
    expect(text).not.toMatch(/I've proposed a table/i);
  });
});
