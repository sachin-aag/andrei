import { describe, expect, it } from "vitest";
import {
  canGenerateReviewSuggestion,
  commentReleasedToQueue,
  heldReviewSuggestionIds,
  proposedEditFromMetadata,
  withReleasedToQueue,
  withoutHeldReviewSuggestions,
} from "./proposed-edit";

describe("proposed review edits", () => {
  it("reads a locatable proposed replacement from finding metadata", () => {
    expect(
      proposedEditFromMetadata({
        proposedEdit: {
          kind: "ai_grammar",
          anchorText: "BN100",
          deleteText: "BN100",
          insertText: "BN-100",
        },
      })
    ).toEqual({
      kind: "ai_grammar",
      anchorText: "BN100",
      deleteText: "BN100",
      insertText: "BN-100",
    });
  });

  it("holds an open finding comment until it is released to the queue", () => {
    const comments = [
      { id: "c1", status: "open", content: '{"insertText":"x"}' },
      {
        id: "c2",
        status: "open",
        content: withReleasedToQueue('{"insertText":"y"}', true),
      },
    ];
    const held = heldReviewSuggestionIds(
      [{ commentId: "c1" }, { commentId: "c2" }, { commentId: null }],
      comments
    );
    expect([...held]).toEqual(["c1"]);
    expect(withoutHeldReviewSuggestions(comments, held).map((row) => row.id)).toEqual(
      ["c2"]
    );
  });

  it("leaves AI Check comments with an evaluationId in the document queue", () => {
    const comments = [
      {
        id: "eval-1",
        status: "open",
        content: '{"insertText":"x"}',
        evaluationId: "e1",
      },
    ];
    expect(
      [...heldReviewSuggestionIds([{ commentId: "eval-1" }], comments)]
    ).toEqual([]);
  });

  it("round-trips releasedToQueue on comment JSON", () => {
    const next = withReleasedToQueue('{"insertText":"BN-100"}', true);
    expect(commentReleasedToQueue(next)).toBe(true);
    expect(commentReleasedToQueue('{"insertText":"BN-100"}')).toBe(false);
  });

  it("treats a criterion finding as generatable when an evaluation exists", () => {
    expect(
      canGenerateReviewSuggestion({
        section: "measure",
        metadata: { criterionKey: "TM-02", evaluationId: "e1" },
      })
    ).toBe(true);
    expect(
      canGenerateReviewSuggestion({
        section: "measure",
        metadata: { criterionKey: "TM-02" },
      })
    ).toBe(false);
    expect(
      canGenerateReviewSuggestion({
        section: "define",
        metadata: {},
      })
    ).toBe(false);
  });
});
