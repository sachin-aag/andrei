import { describe, expect, it } from "vitest";
import {
  firstGeneratedSuggestion,
  GUTTER_BRIDGE_VIEWPORT_MARGIN_PX,
  packGutterAnchors,
  rectIntersectsViewport,
  sectionOverflowPx,
  stickyGutterCardTop,
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

describe("stickyGutterCardTop", () => {
  const cardHeight = 120;
  const parkCenterY = 400;
  const parkTop = parkCenterY - cardHeight / 2;

  it("keeps the parked top when the card is already in the scrollport", () => {
    expect(
      stickyGutterCardTop({
        parkCenterY,
        cardHeight,
        containerTop: 0,
        viewportTop: 0,
        viewportBottom: 800,
      })
    ).toBe(parkTop);
  });

  it("pins to the top of the scrollport after the user scrolls the park away", () => {
    // Container has scrolled up 500px; park would sit above the viewport.
    expect(
      stickyGutterCardTop({
        parkCenterY,
        cardHeight,
        containerTop: -500,
        viewportTop: 0,
        viewportBottom: 800,
      })
    ).toBe(GUTTER_BRIDGE_VIEWPORT_MARGIN_PX - -500);
  });

  it("pins to the bottom of the scrollport when the park is below the view", () => {
    expect(
      stickyGutterCardTop({
        parkCenterY,
        cardHeight,
        containerTop: 0,
        viewportTop: 0,
        viewportBottom: 200,
      })
    ).toBe(200 - GUTTER_BRIDGE_VIEWPORT_MARGIN_PX - cardHeight);
  });

  it("pins to the top when the card is taller than the scrollport", () => {
    expect(
      stickyGutterCardTop({
        parkCenterY,
        cardHeight: 900,
        containerTop: 0,
        viewportTop: 0,
        viewportBottom: 400,
      })
    ).toBe(GUTTER_BRIDGE_VIEWPORT_MARGIN_PX);
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

describe("sectionOverflowPx", () => {
  it("reports the gap when a card hangs below an unpadded section", () => {
    expect(
      sectionOverflowPx({
        sectionBottom: 1000,
        appliedPaddingPx: 0,
        maxCardBottom: 1050,
      })
    ).toBe(50);
  });

  it("returns zero when the cards fit inside the section", () => {
    expect(
      sectionOverflowPx({
        sectionBottom: 1000,
        appliedPaddingPx: 0,
        maxCardBottom: 900,
      })
    ).toBe(0);
  });

  it("holds steady once the padding it asked for is applied", () => {
    // Re-measuring a padded section must return the same answer. Reading the
    // padded rect as the section's own height reported zero overflow, which
    // dropped the padding and started the flicker.
    const naturalBottom = 1000;
    const maxCardBottom = 1050;

    const first = sectionOverflowPx({
      sectionBottom: naturalBottom,
      appliedPaddingPx: 0,
      maxCardBottom,
    });
    const second = sectionOverflowPx({
      sectionBottom: naturalBottom + first,
      appliedPaddingPx: first,
      maxCardBottom,
    });

    expect(second).toBe(first);
  });

  it("shrinks the padding when the card shrinks", () => {
    expect(
      sectionOverflowPx({
        sectionBottom: 1050,
        appliedPaddingPx: 50,
        maxCardBottom: 1010,
      })
    ).toBe(10);
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

const INVESTIGATION_SECTION_ORDER = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "conclusion",
] as const;

describe("firstGeneratedSuggestion", () => {
  it("returns null when every open suggestion was already known", () => {
    expect(
      firstGeneratedSuggestion(
        new Set(["c1"]),
        [suggestionComment({ id: "c1" })],
        INVESTIGATION_SECTION_ORDER
      )
    ).toBeNull();
  });

  it("picks the first new card, not the first already-open suggestion", () => {
    const comments = [
      suggestionComment({
        id: "old-define",
        section: "define",
        createdAt: "2026-01-01T00:00:00Z",
      }),
      suggestionComment({
        id: "new-define-later",
        section: "define",
        createdAt: "2026-01-03T00:00:00Z",
      }),
      suggestionComment({
        id: "new-define",
        section: "define",
        createdAt: "2026-01-02T00:00:00Z",
      }),
    ];
    expect(
      firstGeneratedSuggestion(
        new Set(["old-define"]),
        comments,
        INVESTIGATION_SECTION_ORDER
      )?.id
    ).toBe("new-define");
  });

  it("picks the topmost new section even when comments arrive out of order", () => {
    const comments = [
      suggestionComment({
        id: "old",
        section: "define",
        createdAt: "2026-01-01T00:00:00Z",
      }),
      suggestionComment({
        id: "new-improve",
        section: "improve",
        createdAt: "2026-01-03T00:00:00Z",
      }),
      suggestionComment({
        id: "new-measure",
        kind: "ai_redraft",
        section: "measure",
        createdAt: "2026-01-02T00:00:00Z",
      }),
    ];
    expect(
      firstGeneratedSuggestion(
        new Set(["old"]),
        comments.toReversed(),
        INVESTIGATION_SECTION_ORDER
      )?.id
    ).toBe("new-measure");
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
    expect(
      firstGeneratedSuggestion(
        new Set(),
        comments,
        INVESTIGATION_SECTION_ORDER
      )
    ).toBeNull();
  });
});
