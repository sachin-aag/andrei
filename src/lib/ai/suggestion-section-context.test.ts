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

  it("serializes DV table sections instead of dumping TipTap JSON", () => {
    const content = {
      table: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableHeader",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Requirement ID" }],
                      },
                    ],
                  },
                  {
                    type: "tableHeader",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Design Input" }],
                      },
                    ],
                  },
                ],
              },
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "DI-1" }],
                      },
                    ],
                  },
                  {
                    type: "tableCell",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Seal integrity" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const evalPrompt = contextForPrompt("traceability", content);
    expect(evalPrompt).toContain("| Requirement ID | Design Input |");
    expect(evalPrompt).toContain("DI-1");
    expect(evalPrompt).not.toContain('"type": "table"');

    const suggestPrompt = contextForSuggestionPrompt("traceability", content);
    expect(suggestPrompt).toContain("Requirement ID");
    expect(suggestPrompt).toContain("DI-1");
    expect(suggestPrompt).not.toContain("|");
    expect(suggestPrompt).not.toContain('"type": "table"');
  });
});
