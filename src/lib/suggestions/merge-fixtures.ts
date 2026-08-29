import type { JSONContent } from "@tiptap/core";
import type { FieldContent } from "@/lib/suggestions/diff-plan";

export function para(text: string, extra?: JSONContent[]): JSONContent {
  return {
    type: "paragraph",
    content: [
      ...(text ? [{ type: "text", text }] : []),
      ...(extra ?? []),
    ],
  };
}

export function doc(...blocks: JSONContent[]): JSONContent {
  return { type: "doc", content: blocks };
}

export function cell(text: string): JSONContent {
  return {
    type: "tableCell",
    content: [para(text)],
  };
}

export function header(text: string): JSONContent {
  return {
    type: "tableHeader",
    content: [para(text)],
  };
}

export function table(rows: JSONContent[][]): JSONContent {
  return {
    type: "table",
    content: rows.map((row) => ({ type: "tableRow", content: row })),
  };
}

export function listItem(...blocks: JSONContent[]): JSONContent {
  return { type: "listItem", content: blocks };
}

export function bulletList(...items: JSONContent[]): JSONContent {
  return { type: "bulletList", content: items };
}

export const FIXTURES: Record<string, FieldContent> = {
  prose: doc(
    para(
      "On 15 January 2026 a dissolution failure was observed for batch B-2024-117 at 68 percent versus the 80 percent specification."
    ),
    para("The investigation proceeded under SOP/DP/QA/008.")
  ),
  table: doc(
    table([
      [header("Requirement"), header("Result")],
      [cell("SYS-FN-037 assay"), cell("Fail at 68 percent")],
    ])
  ),
  imageAndEquation: doc(
    para("Measured value ", [
      { type: "mathInline", attrs: { latex: "x=1" } },
      { type: "text", text: " as shown." },
      {
        type: "imageInline",
        attrs: { src: "data:image/png;base64,aaa", alt: "chromatogram" },
      },
    ])
  ),
  placeholders: doc(
    para("Deviation observed in batch [Batch number: B-2024-117] on [Date: 15/01/2026].")
  ),
  nestedList: doc(
    bulletList(
      listItem(para("Man: operator shift A")),
      listItem(
        para("Machine"),
        bulletList(listItem(para("HPLC column lot C19")), listItem(para("pump seal")))
      )
    )
  ),
  marksAtBoundary: doc({
    type: "paragraph",
    content: [
      { type: "text", text: "The result " },
      {
        type: "text",
        text: "exceeded",
        marks: [
          {
            type: "suggestionInsert",
            attrs: {
              id: "ai-rev-1",
              authorId: "ai",
              status: "accepted",
              createdAt: "2026-01-01T00:00:00.000Z",
              kind: "fix",
            },
          },
        ],
      },
      { type: "text", text: " the specification limit." },
    ],
  }),
  genericAcceptedMarks: doc({
    type: "paragraph",
    content: [
      { type: "text", text: "Purpose: " },
      {
        type: "text",
        text: "verify Solea output power",
        marks: [
          {
            type: "suggestionInsert",
            attrs: {
              id: "gen-1",
              authorId: "ai",
              status: "accepted",
              createdAt: "2026-01-01T00:00:00.000Z",
              kind: "fix",
            },
          },
        ],
      },
      { type: "text", text: "." },
    ],
  }),
  genericPendingMarks: doc({
    type: "paragraph",
    content: [
      { type: "text", text: "Purpose: verify output." },
      {
        type: "text",
        text: " Extra pending clause.",
        marks: [
          {
            type: "suggestionInsert",
            attrs: {
              id: "pending-1",
              authorId: "ai",
              status: "pending",
              createdAt: "2026-01-01T00:00:00.000Z",
              kind: "fix",
            },
          },
        ],
      },
    ],
  }),
  plainField: "Man: operator on shift A was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014.",
  citations: doc(
    para("Assay failed at 68 percent [protocol.pdf, p. 4]."),
    para(""),
    para("Citations:"),
    para("1. [protocol.pdf, p. 4]")
  ),
};
