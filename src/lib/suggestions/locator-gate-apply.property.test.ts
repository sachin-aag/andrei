import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  applyEditToPlainText,
  applyEditToRichDoc,
  probePlainEdit,
  probeRichEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";

const ATTRS = {
  id: "prop-1",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

/**
 * Permanent CI invariant: probe status === apply status for every (doc, edit).
 * This makes "enabled but can't apply" / "no-op accept" structurally impossible.
 */

const CORPUS: Array<{ name: string; doc: JSONContent; edits: SuggestionEdit[] }> = [
  {
    name: "single paragraph prose",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "On 15/05/2025 the operator observed a deviation during filling.",
            },
          ],
        },
      ],
    },
    edits: [
      {
        anchorText: "On 15/05/2025 the operator observed a deviation during filling.",
        deleteText: "15/05/2025",
        insertText: "[detection date: <to be filled>]",
      },
      {
        anchorText: "during filling.",
        deleteText: "",
        insertText: " on Line 3.",
      },
      {
        anchorText: "the operator observed a deviation",
        deleteText: "observed a deviation",
        insertText: "",
      },
      { anchorText: "", deleteText: "", insertText: "Additional context." },
      {
        anchorText: "missing text that is not here",
        deleteText: "missing",
        insertText: "x",
      },
    ],
  },
  {
    name: "blockquote cross-paragraph",
    doc: {
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
    },
    edits: [
      {
        anchorText: "operator error",
        deleteText: "operator error",
        insertText: "operator error in dispensing",
      },
      {
        anchorText: "occurred on the night shift",
        deleteText: "",
        insertText: " (CCTV)",
      },
    ],
  },
  {
    name: "bullet list",
    doc: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First finding" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second finding" }],
                },
              ],
            },
          ],
        },
      ],
    },
    edits: [
      {
        anchorText: "First finding",
        deleteText: "First",
        insertText: "Primary",
      },
      {
        anchorText: "First finding Second finding",
        deleteText: "First finding Second finding",
        insertText: "Combined",
      },
    ],
  },
  {
    name: "table cells",
    doc: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Man" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "operator not trained" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    edits: [
      {
        anchorText: "Man | operator not trained",
        deleteText: "",
        insertText: " x",
      },
      {
        anchorText: "operator not trained",
        deleteText: "",
        insertText: " on SOP",
      },
      {
        anchorText: "Man operator not trained",
        deleteText: "Man operator not trained",
        insertText: "x",
      },
    ],
  },
  {
    name: "inline equation",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "mathInline" },
            { type: "text", text: " for the assay calculation." },
          ],
        },
      ],
    },
    edits: [
      {
        anchorText: "See [equation] for",
        deleteText: "",
        insertText: " (Eq. 1)",
      },
      {
        anchorText: "See for the assay",
        deleteText: "",
        insertText: " (Eq. 1)",
      },
    ],
  },
  {
    name: "empty doc",
    doc: { type: "doc", content: [{ type: "paragraph" }] },
    edits: [
      { anchorText: "", deleteText: "", insertText: "New paragraph." },
      {
        anchorText: "anything",
        deleteText: "",
        insertText: "x",
      },
    ],
  },
];

const PLAIN_CORPUS: Array<{
  name: string;
  text: string;
  edits: SuggestionEdit[];
}> = [
  {
    name: "plain prose",
    text: "system is working as per its intended use therefore, the following",
    edits: [
      {
        anchorText: "use",
        deleteText: "",
        insertText: "regarding the root cause",
      },
      {
        anchorText: "use",
        deleteText: "use",
        insertText: "purpose",
      },
    ],
  },
  {
    name: "ambiguous anchor",
    text: "use the tool and use the spare",
    edits: [
      { anchorText: "use", deleteText: "", insertText: " carefully" },
      {
        anchorText: "use the tool",
        deleteText: "",
        insertText: " carefully",
      },
    ],
  },
];

describe("gate ≡ apply property (permanent)", () => {
  for (const fixture of CORPUS) {
    it(`rich: ${fixture.name}`, () => {
      for (const edit of fixture.edits) {
        const probe = probeRichEdit(fixture.doc, edit);
        const apply = applyEditToRichDoc(fixture.doc, edit, ATTRS).status;
        expect(probe, JSON.stringify(edit)).toBe(apply);
      }
    });
  }

  for (const fixture of PLAIN_CORPUS) {
    it(`plain: ${fixture.name}`, () => {
      for (const edit of fixture.edits) {
        const probe = probePlainEdit(fixture.text, edit);
        const apply = applyEditToPlainText(fixture.text, edit).status;
        expect(probe, JSON.stringify(edit)).toBe(apply);
      }
    });
  }
});
