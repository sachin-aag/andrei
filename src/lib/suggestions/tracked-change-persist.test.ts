import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import { applySuggestionToContent } from "@/lib/suggestions/accept-suggestion";

const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const heading = (text: string): JSONContent => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
const cell = (text: string, header = false): JSONContent => ({
  type: header ? "tableHeader" : "tableCell",
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [text ? para(text) : { type: "paragraph" }],
});
const table = (rows: string[][]): JSONContent => ({
  type: "table",
  content: rows.map((r, i) => ({ type: "tableRow", content: r.map((c) => cell(c, i === 0)) })),
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

function suggestion(id: string, base: JSONContent, intent: JSONContent): CommentRecord {
  return {
    id,
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "body",
    authorId: "ai",
    content: JSON.stringify({
      deleteText: "",
      insertText: "",
      reasoning: "test",
      suggestionBase: base,
      suggestionIntent: intent,
    }),
    anchorText: "",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "ai",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  } as CommentRecord;
}

/** Characters carrying each kind of tracked mark. */
function markedChars(node: JSONContent): { deleted: number; inserted: number; plain: number } {
  const out = { deleted: 0, inserted: 0, plain: 0 };
  const walk = (n: JSONContent) => {
    if (n.type === "text") {
      const names = (n.marks ?? []).map((m) => m.type);
      const len = (n.text ?? "").length;
      if (names.includes("suggestionDelete")) out.deleted += len;
      else if (names.includes("suggestionInsert")) out.inserted += len;
      else out.plain += len;
    }
    n.content?.forEach(walk);
  };
  walk(node);
  return out;
}

function apply(current: JSONContent, comment: CommentRecord): JSONContent {
  const result = applySuggestionToContent({
    section: "body",
    comment,
    sectionContent: { narrative: current },
    applyMode: "tracked_change",
  });
  if (!result.ok) throw new Error(`apply failed: ${result.reason}`);
  return result.nextSection.narrative as JSONContent;
}

const template = doc(
  heading("1. Purpose"),
  para("Record the executed IQ, OQ, and PQ for this equipment."),
  heading("2. Scope"),
  para("The equipment and the process it performs."),
  heading("4. Equipment identification"),
  table([["Attribute", "Value"], ["Equipment ID", ""], ["Serial number", ""]])
);

describe("tracked_change persistence of merged suggestions", () => {
  it("records only the edited paragraph, not the whole field", () => {
    const intent = doc(
      heading("1. Purpose"),
      para("Record the executed IQ, OQ, and PQ for hot bar system HB-02."),
      heading("2. Scope"),
      para("The equipment and the process it performs."),
      heading("4. Equipment identification"),
      table([["Attribute", "Value"], ["Equipment ID", ""], ["Serial number", ""]])
    );
    const next = apply(template, suggestion("c1", template, intent));
    const chars = markedChars(next);
    // Untouched headings, the Scope paragraph and the table stay plain text.
    expect(chars.plain).toBeGreaterThan(100);
    expect(chars.deleted).toBeLessThan(40);
    expect(JSON.stringify(next)).toContain("HB-02");
    expect(JSON.stringify(next)).toContain('"status":"accepted"');
  });

  it("records a filled table cell as an insertion in that cell only", () => {
    const intent = doc(
      ...template.content!.slice(0, 5),
      table([["Attribute", "Value"], ["Equipment ID", "HB-02"], ["Serial number", ""]])
    );
    const next = apply(template, suggestion("c1", template, intent));
    expect(markedChars(next)).toMatchObject({ deleted: 0, inserted: "HB-02".length });
    const t = next.content!.find((n) => n.type === "table")!;
    expect(t.content).toHaveLength(3);
  });

  it("keeps earlier accepted revisions when a later edit touches another block", () => {
    const first = doc(
      heading("1. Purpose"),
      para("Record the executed IQ, OQ, and PQ for hot bar system HB-02."),
      ...template.content!.slice(2)
    );
    const afterFirst = apply(template, suggestion("c1", template, first));
    const second = structuredClone(afterFirst);
    second.content![3] = para("Hot bar soldering of the FPC to the main PCBA.");
    const afterSecond = apply(afterFirst, suggestion("c2", afterFirst, second));
    const json = JSON.stringify(afterSecond);
    expect(json).toContain("\"id\":\"c1\"");
    expect(json).toContain("\"id\":\"c2\"");
    expect(markedChars(afterSecond).deleted).toBeLessThan(80);
  });

  it("does not keep a dead copy of the field per applied suggestion", () => {
    const fillId = doc(
      ...template.content!.slice(0, 5),
      table([["Attribute", "Value"], ["Equipment ID", "HB-02"], ["Serial number", ""]])
    );
    let current = apply(template, suggestion("c1", template, fillId));
    const before = (current.content ?? []).length;
    for (let i = 2; i <= 4; i++) {
      const intent = structuredClone(current);
      // A later edit to the Scope paragraph only.
      intent.content![3] = para(`The equipment and the process it performs (rev ${i}).`);
      current = apply(current, suggestion(`c${i}`, current, intent));
    }
    const headings = (current.content ?? []).filter((n) => n.type === "heading").length;
    expect(headings).toBe(3);
    expect((current.content ?? []).length).toBeLessThanOrEqual(before + 3);
  });
});
