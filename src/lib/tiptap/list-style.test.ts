import { describe, expect, it } from "vitest";
import { parseListLine } from "@/lib/tiptap/list-style";
import { linesToDoc } from "@/lib/tiptap/rich-text";

describe("parseListLine", () => {
  it("detects ordered, dash, and disc markers", () => {
    expect(parseListLine("1. First")).toEqual({
      kind: "ordered",
      text: "First",
    });
    expect(parseListLine("- Dash item")).toEqual({
      kind: "bullet",
      listStyle: "dash",
      text: "Dash item",
    });
    expect(parseListLine("• Circle item")).toEqual({
      kind: "bullet",
      listStyle: "disc",
      text: "Circle item",
    });
  });
});

describe("linesToDoc", () => {
  it("groups consecutive list lines into list nodes", () => {
    const doc = linesToDoc(
      "Intro paragraph\n- One\n- Two\n1. First\n2. Second\nOutro"
    );
    expect(doc.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "bulletList",
      "orderedList",
      "paragraph",
    ]);
    expect(doc.content?.[1]?.attrs?.listStyle).toBe("dash");
  });
});
