import { describe, expect, it } from "vitest";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import {
  buildSectionDisplayBlocks,
  sectionDisplayBlocksHaveContent,
} from "@/lib/improve-ai/section-display-blocks";

describe("buildSectionDisplayBlocks", () => {
  it("includes rich narrative blocks with tables and equations", () => {
    const blocks = buildSectionDisplayBlocks("measure", {
      narrative: {
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
                    content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
                  },
                ],
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "mathInline",
                attrs: { mathml: "<math><mi>x</mi></math>", latex: "x" },
              },
            ],
          },
        ],
      },
    });

    expect(sectionDisplayBlocksHaveContent(blocks)).toBe(true);
    const rich = blocks.filter((b) => b.kind === "rich");
    expect(rich).toHaveLength(1);
    expect(rich[0]?.label).toBe("Narrative");
  });

  it("returns empty when section has no meaningful content", () => {
    const blocks = buildSectionDisplayBlocks("define", { narrative: emptyDoc() });
    expect(sectionDisplayBlocksHaveContent(blocks)).toBe(false);
  });

  it("renders Convergent DV narrative, testers, and table fields", () => {
    const narrative = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Purpose of this verification." }],
        },
      ],
    };
    const testers = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Jane Tester, 12 Jan 2026" }],
        },
      ],
    };
    const table = {
      type: "doc" as const,
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
                      content: [{ type: "text", text: "Equipment" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const purpose = buildSectionDisplayBlocks("purpose", { narrative });
    expect(sectionDisplayBlocksHaveContent(purpose)).toBe(true);
    expect(purpose[0]).toMatchObject({ kind: "rich", label: "Narrative" });

    const testersDates = buildSectionDisplayBlocks("testers_dates", { testers });
    expect(sectionDisplayBlocksHaveContent(testersDates)).toBe(true);
    expect(testersDates[0]).toMatchObject({ kind: "rich", label: "Testers" });

    const equipment = buildSectionDisplayBlocks("test_equipment", { table });
    expect(sectionDisplayBlocksHaveContent(equipment)).toBe(true);
    expect(equipment[0]).toMatchObject({ kind: "rich", label: "Table" });

    const results = buildSectionDisplayBlocks("results_and_discussions", {
      narrative,
      table,
    });
    expect(results.map((block) => block.label)).toEqual(["Narrative", "Table"]);
  });
});
