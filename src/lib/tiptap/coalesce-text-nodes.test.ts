import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { coalesceAdjacentTextNodes } from "./coalesce-text-nodes";
import { findPlaceholders } from "@/lib/placeholders/find";

describe("coalesceAdjacentTextNodes", () => {
  it("merges sibling text nodes with the same marks", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "[CAPA number: " },
            { type: "text", text: "<to be filled>]" },
          ],
        },
      ],
    };

    const merged = coalesceAdjacentTextNodes(doc);
    const para = merged.content?.[0] as JSONContent;
    expect(para.content).toHaveLength(1);
    expect(para.content?.[0]).toMatchObject({
      type: "text",
      text: "[CAPA number: <to be filled>]",
    });

    const [placeholder] = findPlaceholders(merged, "improve", "narrative");
    expect(placeholder?.text).toBe("[CAPA number: <to be filled>]");
  });
});
