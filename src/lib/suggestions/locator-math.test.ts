import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  acceptSuggestionMarksById,
  applyAndAcceptRichEdit,
  applyEditToRichDoc,
  flattenForAnchor,
  probeRichEdit,
} from "@/lib/suggestions/locator";
import { flattenDocForChat } from "@/lib/ai/chat/section-images";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

const ATTRS = {
  id: "sug-math",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

function mathInline(latex?: string): JSONContent {
  return latex
    ? { type: "mathInline", attrs: { latex } }
    : { type: "mathInline" };
}

function mathBlock(latex: string): JSONContent {
  return { type: "mathBlock", attrs: { latex } };
}

function prose(...inline: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: inline }],
  };
}

function walk(
  doc: JSONContent,
  visit: (node: JSONContent) => void
): void {
  visit(doc);
  for (const child of doc.content ?? []) walk(child, visit);
}

describe("locator — math atoms", () => {
  it("registers $latex$ as a locatable slice in flatten and chat reads", () => {
    const latex = String.raw`\frac{MACO}{A}`;
    const doc = prose(
      { type: "text", text: "See " },
      mathInline(latex),
      { type: "text", text: " for the limit." }
    );
    const index = flattenForAnchor(doc);
    expect(index.text).toBe(String.raw`See $\frac{MACO}{A}$ for the limit.`);
    expect(index.text).not.toContain("[equation]");

    const start = index.text.indexOf(String.raw`$\frac{MACO}{A}$`);
    const slices = index.resolveRange(
      start,
      start + String.raw`$\frac{MACO}{A}$`.length
    );
    expect(slices).toHaveLength(1);
    expect(slices[0]?.node.type).toBe("mathInline");

    const chat = flattenDocForChat(doc, {
      targetField: "narrative",
      imageIndexStart: 1,
      collected: [],
    });
    expect(chat.text).toBe(index.text);
    expect(chat.readingText).toBe(index.text);
  });

  it("deletes an inline equation when the span covers its $latex$ token", () => {
    const oldLatex = String.raw`\frac{2500}{201.76}`;
    const doc = prose(
      { type: "text", text: "Limit " },
      mathInline(oldLatex),
      { type: "text", text: " mg/m²." }
    );
    const edit = {
      anchorText: String.raw`Limit $\frac{2500}{201.76}$ mg/m².`,
      deleteText: String.raw`Limit $\frac{2500}{201.76}$ mg/m².`,
      insertText: String.raw`Limit $\frac{MACO}{A}=12.39$ mg/m².`,
    };
    expect(probeRichEdit(doc, edit)).toBe("located");

    const preview = applyEditToRichDoc(doc, edit, ATTRS);
    expect(preview.status).toBe("located");
    const deleted: JSONContent[] = [];
    const inserted: JSONContent[] = [];
    walk(preview.doc, (node) => {
      if (node.type !== "mathInline") return;
      if (node.marks?.some((m) => m.type === suggestionDeleteMarkName)) {
        deleted.push(node);
      }
      if (node.marks?.some((m) => m.type === suggestionInsertMarkName)) {
        inserted.push(node);
      }
    });
    expect(deleted).toHaveLength(1);
    expect(inserted.length).toBeGreaterThanOrEqual(1);

    const accepted = acceptSuggestionMarksById(preview.doc, ATTRS.id);
    expect(flattenForAnchor(accepted).text).toBe(
      String.raw`Limit $\frac{MACO}{A}=12.39$ mg/m².`
    );
    let leftoverOld = false;
    walk(accepted, (node) => {
      if (
        node.type === "mathInline" &&
        node.attrs?.latex === oldLatex
      ) {
        leftoverOld = true;
      }
    });
    expect(leftoverOld).toBe(false);
  });

  it("drops a leftover block equation when rewriting surrounding paragraphs", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Old carryover heading." }],
        },
        mathBlock(String.raw`\frac{2500}{201.76}=12.39`),
        {
          type: "paragraph",
          content: [{ type: "text", text: "Old swab limit." }],
        },
      ],
    };
    const edit = {
      anchorText: String.raw`Old carryover heading.
$\frac{2500}{201.76}=12.39$
Old swab limit.`,
      deleteText: String.raw`Old carryover heading.
$\frac{2500}{201.76}=12.39$
Old swab limit.`,
      insertText: String.raw`New carryover heading.

$\frac{MACO}{A}=12.39$

New swab limit.`,
    };
    expect(flattenForAnchor(doc).text).toContain(
      String.raw`$\frac{2500}{201.76}=12.39$`
    );
    expect(probeRichEdit(doc, edit)).toBe("located");

    const accepted = applyAndAcceptRichEdit(doc, ATTRS.id, edit, ATTRS);
    expect(accepted.status).toBe("located");
    let leftoverBlock = false;
    walk(accepted.doc, (node) => {
      if (
        node.type === "mathBlock" &&
        String(node.attrs?.latex ?? "").includes("2500")
      ) {
        leftoverBlock = true;
      }
    });
    expect(leftoverBlock).toBe(false);
    expect(flattenForAnchor(accepted.doc).text).toContain(
      String.raw`$\frac{MACO}{A}=12.39$`
    );
    expect(flattenForAnchor(accepted.doc).text).toContain("New swab limit.");
  });

  it("paints the whole equation when delete overlaps only part of $latex$", () => {
    const latex = String.raw`\frac{MACO}{A}`;
    const doc = prose(
      { type: "text", text: "Limit " },
      mathInline(latex),
      { type: "text", text: " mg/m²." }
    );
    const preview = applyEditToRichDoc(
      doc,
      {
        anchorText: String.raw`$\frac{MACO}{A}$`,
        deleteText: String.raw`\frac{MACO}`,
        insertText: "",
      },
      ATTRS
    );
    expect(preview.status).toBe("located");
    let deleted = false;
    walk(preview.doc, (node) => {
      if (
        node.type === "mathInline" &&
        node.marks?.some((m) => m.type === suggestionDeleteMarkName)
      ) {
        deleted = true;
      }
    });
    expect(deleted).toBe(true);
  });

  it("paints a latex-less equation when the unique $equation$ span is deleted", () => {
    const doc = prose(
      { type: "text", text: "See " },
      mathInline(),
      { type: "text", text: " for the assay." }
    );
    const edit = {
      anchorText: "See $equation$ for the assay.",
      deleteText: "See $equation$ for the assay.",
      insertText: "See the calculation for the assay.",
    };
    expect(probeRichEdit(doc, edit)).toBe("located");
    const accepted = applyAndAcceptRichEdit(doc, ATTRS.id, edit, ATTRS);
    expect(accepted.status).toBe("located");
    let leftover = false;
    walk(accepted.doc, (node) => {
      if (node.type === "mathInline") leftover = true;
    });
    expect(leftover).toBe(false);
    expect(flattenForAnchor(accepted.doc).text).toBe(
      "See the calculation for the assay."
    );
  });
});
