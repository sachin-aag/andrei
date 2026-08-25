import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  applyAndAcceptRichEdit,
  applyEditToRichDoc,
  probeRichEdit,
  stripSuggestionMarksById,
} from "@/lib/suggestions/locator";
import {
  listInlineImagesInDoc,
  parseSuggestionImageInsert,
} from "@/lib/suggestions/image-insert";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${TINY_PNG}`;

const ATTRS = {
  id: "sug-img",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

const IMAGE = { src: PNG, alt: "HPLC trace", width: 400, mediaId: null };

function para(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

describe("locator — insertImage", () => {
  it("appends a pending image when anchorText is empty", () => {
    const doc = para("See the chromatogram.");
    const result = applyEditToRichDoc(
      doc,
      {
        anchorText: "",
        deleteText: "",
        insertText: "",
        insertImage: IMAGE,
      },
      ATTRS
    );
    expect(result.status).toBe("append");
    const images = listInlineImagesInDoc(result.doc);
    expect(images).toHaveLength(1);
    expect(images[0]!.alt).toBe("HPLC trace");
    const pending = result.doc.content?.[1] ?? result.doc.content?.[0];
    const node = pending?.content?.find((c) => c.type === "imageInline");
    expect(node?.attrs?.suggestionId).toBe("sug-img");
  });

  it("inserts after a unique anchor and accept strips the pending attr", () => {
    const doc = para("Batch 17 failed the assay. Next steps follow.");
    const accepted = applyAndAcceptRichEdit(
      doc,
      "sug-img",
      {
        anchorText: "Batch 17 failed the assay.",
        deleteText: "",
        insertText: "",
        insertImage: IMAGE,
      },
      ATTRS
    );
    expect(accepted.status).toBe("located");
    const images = listInlineImagesInDoc(accepted.doc);
    expect(images).toHaveLength(1);
    const walk = (node: JSONContent): JSONContent | null => {
      if (node.type === "imageInline") return node;
      for (const child of node.content ?? []) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };
    const image = walk(accepted.doc);
    expect(image?.attrs?.suggestionId).toBeUndefined();
    expect(image?.attrs?.src).toBe(PNG);
  });

  it("dismiss drops the pending image", () => {
    const doc = para("See below.");
    const preview = applyEditToRichDoc(
      doc,
      {
        anchorText: "See below.",
        deleteText: "",
        insertText: "",
        insertImage: IMAGE,
      },
      ATTRS
    );
    expect(probeRichEdit(doc, {
      anchorText: "See below.",
      deleteText: "",
      insertText: "",
      insertImage: IMAGE,
    })).toBe("located");
    const stripped = stripSuggestionMarksById(preview.doc, ATTRS.id);
    expect(listInlineImagesInDoc(stripped)).toHaveLength(0);
    expect(stripped.content).toHaveLength(1);
    expect(stripped.content?.[0]?.content).toEqual([
      { type: "text", text: "See below." },
    ]);
  });

  it("dismiss drops an appended paragraph that only held the figure", () => {
    const doc = para("See the chromatogram.");
    const preview = applyEditToRichDoc(
      doc,
      {
        anchorText: "",
        deleteText: "",
        insertText: "",
        insertImage: IMAGE,
      },
      ATTRS
    );
    expect(preview.status).toBe("append");
    expect(preview.doc.content).toHaveLength(2);
    const stripped = stripSuggestionMarksById(preview.doc, ATTRS.id);
    expect(listInlineImagesInDoc(stripped)).toHaveLength(0);
    expect(stripped.content).toHaveLength(1);
    expect(stripped.content?.[0]?.content).toEqual([
      { type: "text", text: "See the chromatogram." },
    ]);
  });

  it("rejects invalid image payloads", () => {
    expect(parseSuggestionImageInsert({ src: "https://evil.example/x.png" })).toBeUndefined();
    expect(parseSuggestionImageInsert({ src: PNG, alt: "ok" })?.src).toBe(PNG);
  });
});
