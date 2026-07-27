import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { contextForPrompt } from "@/lib/ai/section-context";
import { contextForSuggestionPrompt } from "@/lib/ai/suggestion-section-context";

describe("suggestion vs eval section context isolation", () => {
  const tableDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Man" }],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "operator not trained" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it("eval contextForPrompt still emits markdown pipes (unchanged)", () => {
    const content = { narrative: tableDoc };
    const evalPrompt = contextForPrompt("define", content);
    expect(evalPrompt).toContain("|");
  });

  it("suggestion context uses canonical flatten (no pipes / equation tokens)", () => {
    const content = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "See " },
              { type: "mathInline" },
              { type: "text", text: " for assay." },
            ],
          },
        ],
      },
    };
    const suggestPrompt = contextForSuggestionPrompt("define", content);
    expect(suggestPrompt).not.toContain("|");
    expect(suggestPrompt).not.toContain("[equation]");
    expect(suggestPrompt).toContain("See");
    expect(suggestPrompt).toContain("for assay.");
  });
});
