// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
  REVIEW_LOCATE_CLASS,
  REVIEW_LOCATE_REFRESH_META,
  createReviewLocateHighlightExtension,
  type ReviewLocatePaint,
} from "./review-locate-highlight";

describe("review locate highlight in the editor", () => {
  it("paints one yellow phrase and clears it when the needle goes away", () => {
    let target: ReviewLocatePaint | null = {
      anchor: "",
      needle: "acceptable to the R&D Engineer",
    };
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        StarterKit.configure({ heading: false }),
        createReviewLocateHighlightExtension(() => target),
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: 'TM-02 passes if readings are "acceptable to the R&D Engineer".',
              },
            ],
          },
        ],
      },
    });

    const marked = editor.view.dom.querySelector(`.${REVIEW_LOCATE_CLASS}`);
    expect(marked?.textContent).toBe("acceptable to the R&D Engineer");

    target = null;
    editor.view.dispatch(
      editor.state.tr.setMeta(REVIEW_LOCATE_REFRESH_META, true)
    );
    expect(editor.view.dom.querySelector(`.${REVIEW_LOCATE_CLASS}`)).toBeNull();
    editor.destroy();
  });
});
