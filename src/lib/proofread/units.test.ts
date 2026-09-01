import { describe, expect, it } from "vitest";
import { collectProofreadUnits, shouldSkipProofreadUnit } from "./units";
import { hashProofreadText } from "./hash";

describe("proofread units", () => {
  it("skips short and empty text", () => {
    expect(shouldSkipProofreadUnit("")).toBe(true);
    expect(shouldSkipProofreadUnit("ok")).toBe(true);
    expect(shouldSkipProofreadUnit("i dont know")).toBe(false);
  });

  it("skips placeholder-heavy paragraphs", () => {
    expect(
      shouldSkipProofreadUnit("[Batch: <to be filled>] [Date: <to be filled>] [SOP: <to be filled>]")
    ).toBe(true);
  });

  it("splits paragraphs and hashes stably", () => {
    const units = collectProofreadUnits({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "i dont know what happened here" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "The assay result was within specification." }],
        },
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
                      content: [{ type: "text", text: "dont put this in a table cell" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(units.map((u) => u.id)).toEqual(["p-0", "p-1"]);
    expect(units[0]?.hash).toBe(hashProofreadText("i dont know what happened here"));
  });

  it("treats hard breaks as newlines so hashes match the editor", () => {
    const units = collectProofreadUnits({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "i dont know" },
            { type: "hardBreak" },
            { type: "text", text: "what happened here" },
          ],
        },
      ],
    });
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe("i dont know\nwhat happened here");
    expect(units[0]?.hash).toBe(
      hashProofreadText("i dont know\nwhat happened here")
    );
  });
});
