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

function docWithImage(text: string, image = IMAGE): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text },
          {
            type: "imageInline",
            attrs: {
              src: image.src,
              alt: image.alt,
              width: image.width,
              mediaId: image.mediaId,
            },
          },
        ],
      },
    ],
  };
}

function walkImage(node: JSONContent): JSONContent | null {
  if (node.type === "imageInline") return node;
  for (const child of node.content ?? []) {
    const hit = walkImage(child);
    if (hit) return hit;
  }
  return null;
}

describe("locator — removeImage", () => {
  const removal = { ...IMAGE, index: 1 };

  it("marks the existing figure for deletion", () => {
    const doc = docWithImage("See the chromatogram.");
    const result = applyEditToRichDoc(
      doc,
      {
        anchorText: "",
        deleteText: "",
        insertText: "",
        removeImage: removal,
      },
      ATTRS
    );
    expect(result.status).toBe("located");
    expect(probeRichEdit(doc, {
      anchorText: "",
      deleteText: "",
      insertText: "",
      removeImage: removal,
    })).toBe("located");
    const image = walkImage(result.doc);
    expect(image?.attrs?.suggestionId).toBe("sug-img");
    expect(image?.attrs?.suggestionKind).toBe("delete");
    expect(listInlineImagesInDoc(result.doc)).toHaveLength(1);
  });

  it("accept drops the figure and an empty leftover paragraph", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: {
                src: PNG,
                alt: "HPLC trace",
                width: 400,
                mediaId: null,
              },
            },
          ],
        },
      ],
    } satisfies JSONContent;
    const accepted = applyAndAcceptRichEdit(
      doc,
      "sug-img",
      {
        anchorText: "",
        deleteText: "",
        insertText: "",
        removeImage: removal,
      },
      ATTRS
    );
    expect(accepted.status).toBe("located");
    expect(listInlineImagesInDoc(accepted.doc)).toHaveLength(0);
    expect(accepted.doc.content).toHaveLength(1);
    expect(accepted.doc.content?.[0]?.type).toBe("paragraph");
    expect(walkImage(accepted.doc)).toBeNull();
  });

  it("dismiss keeps the figure and strips pending attrs", () => {
    const doc = docWithImage("See below.");
    const preview = applyEditToRichDoc(
      doc,
      {
        anchorText: "",
        deleteText: "",
        insertText: "",
        removeImage: removal,
      },
      ATTRS
    );
    const stripped = stripSuggestionMarksById(preview.doc, ATTRS.id);
    const images = listInlineImagesInDoc(stripped);
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toBe(PNG);
    const image = walkImage(stripped);
    expect(image?.attrs?.suggestionId).toBeUndefined();
    expect(image?.attrs?.suggestionKind).toBeUndefined();
  });

  it("falls back to a unique src when the stored index is stale", () => {
    const otherSrc =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: otherSrc, alt: "other", width: 100, mediaId: null },
            },
            {
              type: "imageInline",
              attrs: { src: PNG, alt: "HPLC trace", width: 400, mediaId: null },
            },
          ],
        },
      ],
    };
    const result = applyEditToRichDoc(
      doc,
      {
        anchorText: "",
        deleteText: "",
        insertText: "",
        removeImage: { ...IMAGE, index: 1 },
      },
      ATTRS
    );
    expect(result.status).toBe("located");
    const pendingNode = (function findPending(node: JSONContent): JSONContent | null {
      if (
        node.type === "imageInline" &&
        node.attrs?.src === PNG &&
        node.attrs?.suggestionKind === "delete"
      ) {
        return node;
      }
      for (const child of node.content ?? []) {
        const hit = findPending(child);
        if (hit) return hit;
      }
      return null;
    })(result.doc);
    const otherNode = (function findOther(node: JSONContent): JSONContent | null {
      if (node.type === "imageInline" && node.attrs?.src === otherSrc) {
        return node;
      }
      for (const child of node.content ?? []) {
        const hit = findOther(child);
        if (hit) return hit;
      }
      return null;
    })(result.doc);
    expect(pendingNode).not.toBeNull();
    expect(otherNode?.attrs?.suggestionKind).toBeUndefined();
  });

  it("is ambiguous when the same src appears twice and the index does not match", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: PNG, alt: "a", width: 100, mediaId: null },
            },
            {
              type: "imageInline",
              attrs: { src: PNG, alt: "b", width: 200, mediaId: null },
            },
          ],
        },
      ],
    };
    expect(
      probeRichEdit(doc, {
        anchorText: "",
        deleteText: "",
        insertText: "",
        removeImage: { ...IMAGE, index: 3 },
      })
    ).toBe("ambiguous");
  });
});
