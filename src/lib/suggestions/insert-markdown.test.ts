import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  classifyMarkdownInsert,
  insertMarkdownBlocks,
} from "@/lib/suggestions/insert-markdown";
import { suggestionInsertMarkName } from "@/lib/tiptap/suggestion-marks";

const ATTRS = {
  id: "sug-1",
  authorId: "ai",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix",
};

function paragraphDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined,
      },
    ],
  };
}

function listDoc(items: string[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: items.map((item) => ({
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: item }] },
          ],
        })),
      },
    ],
  };
}

describe("classifyMarkdownInsert", () => {
  it("keeps a mid-sentence bold splice inline", () => {
    expect(classifyMarkdownInsert("**critical**")).toEqual({
      kind: "inline",
      text: "**critical**",
    });
  });

  it("classifies a bullet list as blocks", () => {
    const classified = classifyMarkdownInsert("- first\n- second");
    expect(classified.kind).toBe("blocks");
    if (classified.kind !== "blocks") return;
    expect(classified.content.map((n) => n.type)).toEqual(["bulletList"]);
  });

  it("classifies an ordered list as blocks", () => {
    const classified = classifyMarkdownInsert("1. first\n2. second");
    expect(classified.kind).toBe("blocks");
    if (classified.kind !== "blocks") return;
    expect(classified.content.map((n) => n.type)).toEqual(["orderedList"]);
  });

  it("classifies an ATX heading as a block even when it renders as a paragraph", () => {
    const classified = classifyMarkdownInsert("## Methods");
    expect(classified.kind).toBe("blocks");
    if (classified.kind !== "blocks") return;
    expect(classified.content).toHaveLength(1);
    expect(classified.content[0]?.type).toBe("paragraph");
    expect(classified.content[0]?.content?.[0]?.marks?.some((m) => m.type === "bold")).toBe(
      true
    );
  });

  it("emits a heading node when headingNodes is on", () => {
    const classified = classifyMarkdownInsert("## Methods", { headingNodes: true });
    expect(classified.kind).toBe("blocks");
    if (classified.kind !== "blocks") return;
    expect(classified.content[0]?.type).toBe("heading");
  });

  it("refuses a GFM table", () => {
    expect(
      classifyMarkdownInsert("| A | B |\n| --- | --- |\n| 1 | 2 |")
    ).toEqual({ kind: "table" });
  });
});

describe("insertMarkdownBlocks", () => {
  it("appends a list onto an empty field instead of leaving a spacer paragraph", () => {
    const doc = paragraphDoc("");
    const classified = classifyMarkdownInsert("- first");
    expect(classified.kind).toBe("blocks");
    if (classified.kind !== "blocks") return;
    insertMarkdownBlocks(doc, null, classified.content, ATTRS);
    expect(doc.content?.map((n) => n.type)).toEqual(["bulletList"]);
    expect(JSON.stringify(doc)).toContain(suggestionInsertMarkName);
  });

  it("appends list items onto an existing list of the same kind", () => {
    const doc = listDoc(["First"]);
    const firstText = doc.content![0]!.content![0]!.content![0]!.content![0]!;
    const classified = classifyMarkdownInsert("- Second");
    expect(classified.kind).toBe("blocks");
    if (classified.kind !== "blocks") return;
    insertMarkdownBlocks(doc, firstText, classified.content, ATTRS);
    expect(doc.content).toHaveLength(1);
    expect(doc.content![0]!.type).toBe("bulletList");
    expect(doc.content![0]!.content).toHaveLength(2);
  });
});
