import { describe, expect, it } from "vitest";
import { PlaceholderPreservationError } from "@/lib/placeholders/preservation";
import { applyRedraftToSection } from "./apply-redraft";

const sectionContent = {
  narrative: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Deviation observed in batch [Batch number: B-2024-117].",
          },
        ],
      },
    ],
  },
};

describe("applyRedraftToSection placeholder preservation", () => {
  it("throws when a filled placeholder would be reverted to an unfilled token", () => {
    expect(() =>
      applyRedraftToSection(
        sectionContent,
        "define",
        "narrative",
        "Deviation observed in batch [Batch number: <to be filled>]."
      )
    ).toThrow(PlaceholderPreservationError);
  });

  it("applies when the filled value is kept", () => {
    const next = applyRedraftToSection(
      sectionContent,
      "define",
      "narrative",
      "Batch [Batch number: B-2024-117] failed dissolution at 68%."
    );
    const para = (next.narrative as { content: Array<{ content: Array<{ text: string }> }> })
      .content[0];
    expect(para?.content[0]?.text).toContain("B-2024-117");
  });

  it("allows an explicit drop when replace-filled was requested", () => {
    const next = applyRedraftToSection(
      sectionContent,
      "define",
      "narrative",
      "Start over with [Batch number: <to be filled>].",
      { allowDropFilledPlaceholders: true }
    );
    const para = (next.narrative as { content: Array<{ content: Array<{ text: string }> }> })
      .content[0];
    expect(para?.content[0]?.text).toContain("to be filled");
  });
});
