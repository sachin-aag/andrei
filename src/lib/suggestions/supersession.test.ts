import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  findSupersededSuggestions,
  formatReplacedOlderSuggestionsNote,
  formatSupersedesBadge,
  isSupersededDismissal,
  parseSupersededById,
  resolutionReasonSupersededBy,
  stripResolutionReason,
  supersededSuggestionIdsFromContent,
  suggestionsSupersededBy,
  withResolutionReason,
  withSupersededSuggestionIds,
} from "./supersession";

function comment(
  id: string,
  opts: {
    deleteText?: string;
    insertText?: string;
    anchor: string;
    createdAt: string;
    kind?: CommentRecord["kind"];
    markdown?: string;
    tableOperation?: unknown;
    contentPath?: string;
  }
): CommentRecord {
  const content =
    opts.kind === "ai_redraft"
      ? JSON.stringify({ markdown: opts.markdown ?? "replacement", reasoning: "draft" })
      : JSON.stringify({
          deleteText: opts.deleteText ?? "",
          insertText: opts.insertText ?? "",
          reasoning: "seed",
          ...(opts.tableOperation ? { tableOperation: opts.tableOperation } : {}),
        });
  return {
    id,
    reportId: "report-1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    content,
    anchorText: opts.anchor,
    contentPath: opts.contentPath ?? "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: opts.kind ?? "ai_fix",
    source: "ai",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: opts.createdAt,
  };
}

const sectionContent = {
  narrative: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "On 01/01/2026 a deviation was observed. The result exceeded limits.",
          },
        ],
      },
    ],
  },
};

describe("findSupersededSuggestions", () => {
  it("does not supersede disjoint inserts", () => {
    const a = comment("a", {
      insertText: " (shift A)",
      anchor: "On 01/01/2026",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const b = comment("b", {
      insertText: " by 12%",
      anchor: "The result exceeded limits",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [a, b],
        sectionContent,
      })
    ).toEqual([]);
  });

  it("does not supersede an equal-range refinement of the same saved span", () => {
    const older = comment("old", {
      deleteText: "deviation was observed",
      insertText: "issue was seen",
      anchor: "a deviation was observed",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = comment("new", {
      deleteText: "deviation was observed",
      insertText: "issue was logged",
      anchor: "a deviation was observed",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [older, newer],
        sectionContent,
      })
    ).toEqual([]);
  });

  it("keeps a disjoint sibling open when a later edit refines another span", () => {
    const disjoint = comment("line", {
      insertText: " (shift A)",
      anchor: "On 01/01/2026",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const firstShrink = comment("shrink-1", {
      deleteText: "deviation was observed",
      insertText: "issue was seen",
      anchor: "a deviation was observed",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    const secondShrink = comment("shrink-2", {
      deleteText: "deviation was observed",
      insertText: "issue was logged",
      anchor: "a deviation was observed",
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [disjoint, firstShrink, secondShrink],
        sectionContent,
      })
    ).toEqual([]);
  });

  it("supersedes an older span fully covered by a newer span", () => {
    const older = comment("old", {
      deleteText: "deviation was observed",
      insertText: "issue was seen",
      anchor: "a deviation was observed",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = comment("new", {
      deleteText: "a deviation was observed. The result",
      insertText: "the issue was logged. The result",
      anchor: "a deviation was observed. The result",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [older, newer],
        sectionContent,
      })
    ).toEqual([{ supersededId: "old", supersededBy: "new" }]);
  });

  it("treats a newer redraft as covering every older suggestion on the field", () => {
    const fix = comment("fix", {
      insertText: " (shift A)",
      anchor: "On 01/01/2026",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const draft = comment("draft", {
      kind: "ai_redraft",
      markdown: "On 01/01/2026 a deviation was observed during shift A.",
      anchor: "",
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [fix, draft],
        sectionContent,
      })
    ).toEqual([{ supersededId: "fix", supersededBy: "draft" }]);
    expect(
      suggestionsSupersededBy(draft, {
        section: "define",
        comments: [fix, draft],
        sectionContent,
      }).map((c) => c.id)
    ).toEqual(["fix"]);
  });

  it("does not let an incremental table op supersede a prose fix", () => {
    const fix = comment("fix", {
      insertText: " (shift A)",
      anchor: "On 01/01/2026",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const table = comment("table", {
      tableOperation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 0, expectedText: "a", insertText: "b" },
        ],
      },
      anchor: "edit cells",
      createdAt: "2026-01-01T00:03:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [fix, table],
        sectionContent,
      })
    ).toEqual([]);
  });

  it("supersedes an older table op on the same table with a later table op", () => {
    const older = comment("edit-cells", {
      tableOperation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 1, expectedText: "a", insertText: "example A" }],
      },
      anchor: "edit cells",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = comment("insert-col", {
      tableOperation: {
        kind: "insert_column",
        tableIndex: 0,
        afterCol: 1,
        header: "Example",
        values: ["example A"],
      },
      anchor: "insert column",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [older, newer],
        sectionContent,
      })
    ).toEqual([{ supersededId: "edit-cells", supersededBy: "insert-col" }]);
  });

  it("does not supersede table ops on different tableIndex values", () => {
    const table0 = comment("t0", {
      tableOperation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, expectedText: "a", insertText: "b" }],
      },
      anchor: "edit cells",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const table1 = comment("t1", {
      tableOperation: {
        kind: "insert_column",
        tableIndex: 1,
        afterCol: 0,
        header: "Example",
      },
      anchor: "insert column",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [table0, table1],
        sectionContent,
      })
    ).toEqual([]);
  });

  it("does not let create_table supersede edits to an existing table", () => {
    const edit = comment("edit", {
      tableOperation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, expectedText: "a", insertText: "b" }],
      },
      anchor: "edit cells",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const create = comment("create", {
      tableOperation: {
        kind: "create_table",
        headers: ["VCS", "Meaning"],
        rows: [["1", "Design"]],
      },
      anchor: "create table",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [edit, create],
        sectionContent,
      })
    ).toEqual([]);
  });

  it("supersedes an older create_table with a later create_table on the same field", () => {
    const older = comment("create-1", {
      tableOperation: {
        kind: "create_table",
        headers: ["A"],
        rows: [["1"]],
      },
      anchor: "create table",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = comment("create-2", {
      tableOperation: {
        kind: "create_table",
        headers: ["A", "B"],
        rows: [["1", "2"]],
      },
      anchor: "create table",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [older, newer],
        sectionContent,
      })
    ).toEqual([{ supersededId: "create-1", supersededBy: "create-2" }]);
  });

  it("does not supersede table ops on different fields", () => {
    const narrative = comment("n", {
      tableOperation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, expectedText: "a", insertText: "b" }],
      },
      anchor: "edit cells",
      createdAt: "2026-01-01T00:00:00.000Z",
      contentPath: "narrative",
    });
    const other = comment("o", {
      tableOperation: {
        kind: "insert_column",
        tableIndex: 0,
        afterCol: 0,
        header: "Example",
      },
      anchor: "insert column",
      createdAt: "2026-01-01T00:01:00.000Z",
      contentPath: "rootCause.narrative",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [narrative, other],
        sectionContent,
      })
    ).toEqual([]);
  });

  it("lets the newest same-table op supersede every older table op", () => {
    const first = comment("a", {
      tableOperation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 1, expectedText: "a", insertText: "in cell" }],
      },
      anchor: "edit cells",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = comment("b", {
      tableOperation: {
        kind: "insert_column",
        tableIndex: 0,
        afterCol: 1,
        header: "Example",
      },
      anchor: "insert column",
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    const third = comment("c", {
      tableOperation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 2, expectedText: "", insertText: "example A" }],
      },
      anchor: "edit cells",
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    expect(
      findSupersededSuggestions({
        section: "define",
        comments: [first, second, third],
        sectionContent,
      })
    ).toEqual(
      expect.arrayContaining([
        { supersededId: "a", supersededBy: "c" },
        { supersededId: "b", supersededBy: "c" },
      ])
    );
  });
});

describe("resolutionReason helpers", () => {
  it("round-trips superseded_by payload without dropping other fields", () => {
    const original = JSON.stringify({
      deleteText: "a",
      insertText: "b",
      reasoning: "seed",
    });
    const stamped = withResolutionReason(
      original,
      resolutionReasonSupersededBy("draft-1")
    );
    expect(JSON.parse(stamped)).toMatchObject({
      deleteText: "a",
      insertText: "b",
      resolutionReason: "superseded_by:draft-1",
    });
    expect(parseSupersededById("superseded_by:draft-1")).toBe("draft-1");
    expect(JSON.parse(stripResolutionReason(stamped))).toEqual({
      deleteText: "a",
      insertText: "b",
      reasoning: "seed",
    });
  });

  it("detects superseded dismissals", () => {
    expect(
      isSupersededDismissal({
        status: "dismissed",
        content: withResolutionReason("{}", resolutionReasonSupersededBy("x")),
      })
    ).toBe(true);
    expect(
      isSupersededDismissal({ status: "dismissed", content: "{}" })
    ).toBe(false);
    expect(
      isSupersededDismissal({
        status: "open",
        content: withResolutionReason("{}", resolutionReasonSupersededBy("x")),
      })
    ).toBe(false);
  });

  it("formats the card badge", () => {
    expect(formatSupersedesBadge(0)).toBe("");
    expect(formatSupersedesBadge(1)).toBe("This replaced 1 older suggestion");
    expect(formatSupersedesBadge(3)).toBe("This replaced 3 older suggestions");
  });

  it("formats the chat rewrite note", () => {
    expect(formatReplacedOlderSuggestionsNote(0)).toBe("");
    expect(formatReplacedOlderSuggestionsNote(1)).toBe(
      " It replaced an older suggestion."
    );
    expect(formatReplacedOlderSuggestionsNote(2)).toBe(
      " It replaced 2 older suggestions."
    );
  });

  it("stamps replaced suggestion ids onto the newer payload", () => {
    const original = JSON.stringify({
      deleteText: "",
      insertText: "",
      reasoning: "Add an Example column",
      tableOperation: { kind: "insert_column", tableIndex: 0, afterCol: 1, header: "Example" },
    });
    const stamped = withSupersededSuggestionIds(original, ["edit-cells"]);
    expect(JSON.parse(stamped).supersededSuggestionIds).toEqual(["edit-cells"]);
    expect(supersededSuggestionIdsFromContent(stamped)).toEqual(["edit-cells"]);
  });
});
