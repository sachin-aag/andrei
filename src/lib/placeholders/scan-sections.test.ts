import { describe, expect, it } from "vitest";
import { collectPlaceholders } from "./scan-sections";
import { emptyDoc } from "@/lib/tiptap/rich-text";

describe("collectPlaceholders", () => {
  it("finds placeholders in improve correctiveActions plain text", () => {
    const text =
      "Action items are tracked under CAPA [CAPA number: <to be filled>], assigned to [Responsible person: <to be filled>], due by [Due date: <to be filled>].";

    const found = collectPlaceholders({
      improve: {
        narrative: emptyDoc(),
        correctiveActions: text,
      },
    });

    expect(found).toHaveLength(3);
    expect(found.every((p) => p.section === "improve")).toBe(true);
    expect(found.every((p) => p.contentPath === "correctiveActions")).toBe(true);
    expect(found.map((p) => p.text).sort()).toEqual(
      [
        "[CAPA number: <to be filled>]",
        "[Due date: <to be filled>]",
        "[Responsible person: <to be filled>]",
      ].sort()
    );
  });
});
