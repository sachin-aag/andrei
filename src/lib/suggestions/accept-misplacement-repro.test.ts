import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  acceptSuggestionMarksById,
  injectSuggestionMarks,
  type SuggestionEdit,
} from "@/lib/tiptap/suggestion-inject";
import { applyNarrativeSuggestion } from "@/lib/suggestions/apply-narrative-suggestion";
import { applyPlainTextEdit } from "@/lib/suggestions/locate-plain-text-edit";
import { buildPlainTextSuggestionPreview } from "@/lib/suggestions/plain-text-preview";
import {
  isApplyableStatus,
  probeRichEdit,
} from "@/lib/suggestions/locator";

/**
 * Characterization + regression net for the suggestion locate/apply path.
 * Gate vs apply must agree via the shared locator.
 */

const ATTRS = {
  id: "sug-1",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

function gateSaysOk(doc: JSONContent, edit: SuggestionEdit): boolean {
  return isApplyableStatus(probeRichEdit(doc, edit));
}

describe("accept misplacement — gate ≡ apply (characterization)", () => {
  it("blockquote: cross-paragraph delete — gate and apply both locate", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Root cause is operator" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "error during the weighing step" }],
            },
          ],
        },
      ],
    };

    const edit: SuggestionEdit = {
      anchorText: "operator error",
      deleteText: "operator error",
      insertText: "operator error in the dispensing area",
    };

    const gateOk = gateSaysOk(doc, edit);
    const result = injectSuggestionMarks(doc, edit, ATTRS);

    expect(gateOk).toBe(true);
    expect(result.located).toBe(true);
    expect(result.located).toBe(gateOk);
  });

  it("blockquote: pure-insert across paragraph boundary — gate and apply both locate", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "The deviation occurred on" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "the night shift operation" }],
            },
          ],
        },
      ],
    };

    const edit: SuggestionEdit = {
      anchorText: "occurred on the night shift",
      deleteText: "",
      insertText: " (confirmed via CCTV)",
    };

    const gateOk = gateSaysOk(doc, edit);
    const result = injectSuggestionMarks(doc, edit, ATTRS);

    expect(gateOk).toBe(true);
    expect(result.located).toBe(true);
    expect(result.located).toBe(gateOk);
  });
});

describe("suggestion apply — currently-correct snapshots (characterization)", () => {
  it("rich single-paragraph replace", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation.",
            },
          ],
        },
      ],
    };
    const edit: SuggestionEdit = {
      anchorText:
        "On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation.",
      deleteText: "DD/MM/YYYY at approximately HH:MM hrs",
      insertText:
        "[detection date: <to be filled>] at approximately [time: <to be filled>] hrs",
    };

    expect(gateSaysOk(doc, edit)).toBe(true);
    const applied = applyNarrativeSuggestion(doc, "sug-char-1", edit);
    expect(applied).toMatchSnapshot();
  });

  it("rich single-paragraph pure insert", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Initial scope was limited to Line 3 filling operations.",
            },
          ],
        },
      ],
    };
    const edit: SuggestionEdit = {
      anchorText: "Initial scope was limited to Line 3 filling operations.",
      deleteText: "",
      insertText: " The investigation was later expanded to include Line 4.",
    };

    expect(gateSaysOk(doc, edit)).toBe(true);
    const applied = applyNarrativeSuggestion(doc, "sug-char-2", edit);
    expect(applied).toMatchSnapshot();
  });

  it("rich single-paragraph pure delete", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The operator likely forgot the interlock, which probably caused the deviation.",
            },
          ],
        },
      ],
    };
    const edit: SuggestionEdit = {
      anchorText:
        "The operator likely forgot the interlock, which probably caused the deviation.",
      deleteText: "likely forgot the interlock, which probably caused",
      insertText: "",
    };

    expect(gateSaysOk(doc, edit)).toBe(true);
    const applied = applyNarrativeSuggestion(doc, "sug-char-3", edit);
    expect(applied).toMatchSnapshot();
  });

  it("rich empty-anchor append (new-paragraph insert)", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Root cause analysis complete." }],
        },
      ],
    };
    const edit: SuggestionEdit = {
      anchorText: "",
      deleteText: "",
      insertText:
        "Regulatory notification was not required as there was no product impact.",
    };

    const result = injectSuggestionMarks(doc, edit, ATTRS);
    expect(result.located).toBe(true);
    const accepted = acceptSuggestionMarksById(result.doc, ATTRS.id);
    expect(accepted).toMatchSnapshot();
  });

  it("plain replace / pure insert / pure delete", () => {
    expect(
      applyPlainTextEdit(
        "hence there is no requirement of Corrective Action.",
        {
          deleteText: "hence there is no requirement of Corrective Action.",
          insertText:
            "therefore, the following specific preventive action is proposed.",
        }
      )
    ).toMatchSnapshot("plain-replace");

    expect(
      applyPlainTextEdit(
        "system is working as per its intended use therefore, the following",
        {
          anchorText: "use",
          deleteText: "",
          insertText: "regarding the root cause",
        }
      )
    ).toMatchSnapshot("plain-pure-insert");

    expect(
      applyPlainTextEdit("alpha beta gamma", {
        anchorText: "alpha beta gamma",
        deleteText: "beta ",
        insertText: "",
      })
    ).toMatchSnapshot("plain-pure-delete");
  });

  it("plain preview segments for anchored replace", () => {
    const segments = buildPlainTextSuggestionPreview(
      "hence there is no requirement of Corrective Action.",
      "hence there is no requirement of Corrective Action.",
      "therefore, the following specific preventive action is proposed."
    );
    expect(segments).toMatchSnapshot();
  });
});
