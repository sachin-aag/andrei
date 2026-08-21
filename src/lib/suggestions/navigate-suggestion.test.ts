import { describe, expect, it } from "vitest";
import {
  newestGeneratedSuggestionSection,
  packGutterAnchors,
  rectIntersectsViewport,
  SUGGESTION_FIELD_CENTER_MAX_PX,
  suggestionAnchorY,
  suggestionFieldGutterLayout,
  suggestionGutterAnchorId,
} from "@/lib/suggestions/navigate-suggestion";
import type { CommentRecord } from "@/types/report";

describe("rectIntersectsViewport", () => {
  it("returns true when the rect overlaps the visible band", () => {
    expect(
      rectIntersectsViewport({ top: 100, bottom: 200 }, 800, 80)
    ).toBe(true);
  });

  it("returns false when the rect is fully above the margin", () => {
    expect(
      rectIntersectsViewport({ top: -200, bottom: 40 }, 800, 80)
    ).toBe(false);
  });

  it("returns false when the rect is fully below the margin", () => {
    expect(
      rectIntersectsViewport({ top: 780, bottom: 900 }, 800, 80)
    ).toBe(false);
  });

  it("treats a tall rect spanning the viewport as in view", () => {
    expect(
      rectIntersectsViewport({ top: -100, bottom: 1000 }, 800, 80)
    ).toBe(true);
  });
});

describe("suggestionGutterAnchorId", () => {
  it("matches margin-gutter packing ids", () => {
    expect(suggestionGutterAnchorId("define")).toBe("suggestion:define");
  });
});

describe("suggestionFieldGutterLayout", () => {
  it("centers a compact field on the card", () => {
    expect(
      suggestionFieldGutterLayout({ top: 400, height: 48 }, 100)
    ).toEqual({ desiredTop: 324, valignCenter: true });
  });

  it("pins a tall redraft field to its first line, not the midpoint", () => {
    const field = { top: 400, height: 2400 };
    expect(field.height).toBeGreaterThan(SUGGESTION_FIELD_CENTER_MAX_PX);
    expect(suggestionFieldGutterLayout(field, 100)).toEqual({
      desiredTop: suggestionAnchorY(400, 100),
      valignCenter: false,
    });
  });
});

describe("packGutterAnchors", () => {
  it("does not let an earlier section's tall card push a later section off its field", () => {
    const packed = packGutterAnchors(
      [
        { id: "suggestion:purpose_scope", section: "purpose_scope", desiredTop: 100 },
        { id: "suggestion:deviations", section: "deviations", desiredTop: 800 },
      ],
      {
        "suggestion:purpose_scope": 500,
        "suggestion:deviations": 400,
      }
    );
    const deviations = packed.find((a) => a.id === "suggestion:deviations");
    expect(deviations?.top).toBe(800);
  });

  it("still stacks overlapping cards inside the same section", () => {
    const packed = packGutterAnchors(
      [
        { id: "composer:deviations", section: "deviations", desiredTop: 800 },
        { id: "suggestion:deviations", section: "deviations", desiredTop: 820 },
      ],
      {
        "composer:deviations": 80,
        "suggestion:deviations": 400,
      },
      8
    );
    const suggestion = packed.find((a) => a.id === "suggestion:deviations");
    expect(suggestion?.top).toBe(800 + 80 + 8);
  });
});

function suggestionComment(
  overrides: Partial<CommentRecord> & Pick<CommentRecord, "id">
): CommentRecord {
  return {
    reportId: "r1",
    parentId: null,
    sectionId: "sec",
    section: "define",
    authorId: "ai",
    content: "{}",
    anchorText: "",
    contentPath: "narrative",
    fromPos: 0,
    toPos: 1,
    status: "open",
    kind: "ai_fix",
    source: "app",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("newestGeneratedSuggestionSection", () => {
  it("returns null when every open suggestion was already known", () => {
    const existing = suggestionComment({ id: "c1" });
    expect(
      newestGeneratedSuggestionSection(new Set(["c1"]), [existing])
    ).toBeNull();
  });

  it("returns the section of the newest newly generated card", () => {
    const comments = [
      suggestionComment({
        id: "old",
        section: "define",
        createdAt: "2026-01-01T00:00:00Z",
      }),
      suggestionComment({
        id: "new-measure",
        section: "measure",
        createdAt: "2026-01-02T00:00:00Z",
      }),
      suggestionComment({
        id: "newer-improve",
        section: "improve",
        createdAt: "2026-01-03T00:00:00Z",
      }),
    ];
    expect(
      newestGeneratedSuggestionSection(new Set(["old"]), comments)
    ).toBe("improve");
  });

  it("ignores resolved cards, replies, and human comments", () => {
    const comments = [
      suggestionComment({
        id: "resolved",
        status: "resolved",
        createdAt: "2026-01-04T00:00:00Z",
      }),
      suggestionComment({
        id: "reply",
        parentId: "old",
        createdAt: "2026-01-04T00:00:00Z",
      }),
      suggestionComment({
        id: "human",
        kind: "human",
        authorId: "u1",
        createdAt: "2026-01-04T00:00:00Z",
      }),
    ];
    expect(newestGeneratedSuggestionSection(new Set(), comments)).toBeNull();
  });

  it("treats a new redraft as a generated card", () => {
    expect(
      newestGeneratedSuggestionSection(new Set(), [
        suggestionComment({
          id: "draft",
          kind: "ai_redraft",
          section: "purpose_scope",
        }),
      ])
    ).toBe("purpose_scope");
  });
});
