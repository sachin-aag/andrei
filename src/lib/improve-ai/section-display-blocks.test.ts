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
});
