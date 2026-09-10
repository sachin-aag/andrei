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
    // Coordinate-tagged grid, not markdown pipes.
    expect(suggestPrompt).not.toContain("|");
    expect(suggestPrompt).toContain("tableIndex=0");
    expect(suggestPrompt).toContain(
      "Row 0 is the header and cannot be deleted; row 1 is the first data row"
    );
    expect(suggestPrompt).toContain("[0,0] Requirement ID");
    expect(suggestPrompt).toContain("[1,0] DI-1");
    expect(suggestPrompt).toContain("This field has 1 table (tableIndex 0)");
    expect(suggestPrompt).not.toContain('"type": "table"');
  });

  it("tagged cell coordinates resolve to the same cell the locator scopes", async () => {
    const { flattenForAnchor, resolveScopeWindow } = await import(
      "@/lib/suggestions/locator"
    );
    const doc: JSONContent = {
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
                    { type: "paragraph", content: [{ type: "text", text: "Pass" }] },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Pass" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const prompt = contextForSuggestionPrompt("traceability", { table: doc });
    // The prompt tags the second (duplicate) cell as [0,1].
    expect(prompt).toContain("[0,1] Pass");
    // …and that coordinate resolves to a real cell window in the locator.
    const index = flattenForAnchor(doc);
    const win = resolveScopeWindow(index, { kind: "cell", row: 0, col: 1 });
    expect(win).not.toBeNull();
    expect(index.text.slice(win!.start, win!.end)).toBe("Pass");
  });

  it("renders bulleted lists with 0-based item indices", () => {
    const content = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "First point" }] },
                ],
              },
              {
                type: "listItem",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Second point" }] },
                ],
              },
            ],
          },
        ],
      },
    };
    const prompt = contextForSuggestionPrompt("define", content);
    expect(prompt).toContain("[0] First point");
    expect(prompt).toContain("[1] Second point");
  });

  it("labels multiple tables with tableIndex", () => {
    const table = (a: string, b: string): JSONContent => ({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: a }] }],
            },
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: b }] }],
            },
          ],
        },
      ],
    });
    const prompt = contextForSuggestionPrompt("define", {
      narrative: { type: "doc", content: [table("One", "Two"), table("Three", "Four")] },
    });
    expect(prompt).toContain("tableIndex=0");
    expect(prompt).toContain("tableIndex=1");
    expect(prompt).toContain("[0,0] Three");
    expect(prompt).toContain("This field has 2 tables (tableIndex 0, 1)");
    expect(prompt).toContain("Do not rewrite a table as bullets");
  });

  it("serializes testers_dates as testers narrative only", () => {
    const testers = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Alex Rivera. Protocol execution: 19 February 2024 through 27 February 2024.",
            },
          ],
        },
      ],
    } satisfies JSONContent;
    const content = {
      testers,
      startDate: "2024-02-19",
      endDate: "2024-02-27",
    };
    const evalPrompt = contextForPrompt("testers_dates", content);
    const suggestPrompt = contextForSuggestionPrompt("testers_dates", content);
    expect(evalPrompt).toContain("Alex Rivera");
    expect(evalPrompt).not.toMatch(/^Start date:/m);
    expect(evalPrompt).not.toMatch(/^End date:/m);
    expect(suggestPrompt).toContain("Alex Rivera");
    expect(suggestPrompt).not.toMatch(/^Start date:/m);
    expect(suggestPrompt).not.toMatch(/^End date:/m);
  });
});
