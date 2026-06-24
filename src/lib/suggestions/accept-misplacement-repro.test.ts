import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import {
  canLocateEditInPlainText,
  injectSuggestionMarks,
  type SuggestionEdit,
} from "@/lib/tiptap/suggestion-inject";

/**
 * Repro for "accepting a suggestion put the text in the wrong place / had to
 * accept several times before it showed up".
 *
 * Hypothesis: the Apply button is gated by `validateSuggestionLocate`, which uses
 * `richJsonToPlainText` (separators between nested blocks). The actual injection
 * uses `collectTextRefs` inside `injectSuggestionMarks`, which inserts NO separator
 * between children of listItem / blockquote / tableRow. So an anchor that spans a
 * nested-block boundary validates as locatable (button enabled) but the injector
 * can't find it -> `anchored: false` -> the insert is appended at the END of the
 * field instead of at the anchor.
 */

// #region agent log
function logDivergence(hypothesisId: string, message: string, data: unknown) {
  try {
    appendFileSync(
      "/Users/sachinagrawal/andrei/andrei/.cursor/debug-fa6fae.log",
      JSON.stringify({
        sessionId: "fa6fae",
        runId: "repro",
        hypothesisId,
        location: "accept-misplacement-repro.test.ts",
        message,
        data,
        timestamp: Date.now(),
      }) + "\n"
    );
  } catch {
    /* ignore */
  }
}
// #endregion

const ATTRS = {
  id: "sug-1",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

describe("accept misplacement — validator vs injector flattener divergence", () => {
  it("blockquote: anchor spans two paragraphs (validator ok, injector appends at end)", () => {
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

    const plain = richJsonToPlainText(doc, { tableFormat: "markdown" });
    const validatorOk = canLocateEditInPlainText(plain, edit).ok;

    const result = injectSuggestionMarks(doc, edit, ATTRS);

    logDivergence("A", "blockquote anchor across paragraphs", {
      plain,
      validatorOk,
      injectorAnchored: result.anchored,
    });

    // Button is enabled (validator can locate it)...
    expect(validatorOk).toBe(true);
    // ...and after the fix the injector locates it too (no longer appended at end).
    expect(result.anchored).toBe(true);
  });

  it("blockquote: pure-insert anchor spans a paragraph boundary (validator ok, injector now locates)", () => {
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

    // Pure insert (no delete) after an anchor that crosses the paragraph break.
    const edit: SuggestionEdit = {
      anchorText: "occurred on the night shift",
      deleteText: "",
      insertText: " (confirmed via CCTV)",
    };

    const plain = richJsonToPlainText(doc, { tableFormat: "markdown" });
    const validatorOk = canLocateEditInPlainText(plain, edit).ok;
    const result = injectSuggestionMarks(doc, edit, ATTRS);

    logDivergence("B", "blockquote pure-insert across paragraphs", {
      plain,
      validatorOk,
      injectorAnchored: result.anchored,
    });

    expect(validatorOk).toBe(true);
    expect(result.anchored).toBe(true);
  });
});
