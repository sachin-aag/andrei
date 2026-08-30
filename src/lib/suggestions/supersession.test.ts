import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  findSupersededSuggestions,
  formatSupersedesBadge,
  isSupersededDismissal,
  parseSupersededById,
  resolutionReasonSupersededBy,
  stripResolutionReason,
  suggestionsSupersededBy,
  withResolutionReason,
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
    contentPath: "narrative",
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
    expect(formatSupersedesBadge(1)).toBe("Supersedes 1 pending suggestion");
    expect(formatSupersedesBadge(3)).toBe("Supersedes 3 pending suggestions");
  });
});
