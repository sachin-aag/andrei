import { describe, expect, it } from "vitest";
import {
  createSameTurnImageOps,
  findImageOpForMove,
  findImageOpForRemove,
  isPositionedImageOp,
  recordImageOp,
  type TurnImageOp,
} from "./same-turn-image-move";

const PNG = "data:image/png;base64,aaa";

function op(partial: Partial<TurnImageOp> & Pick<TurnImageOp, "suggestionId">): TurnImageOp {
  return {
    section: "define",
    targetField: "narrative",
    payload: { deleteText: "", insertText: "", reasoning: "seed" },
    anchorText: "",
    src: PNG,
    ...partial,
  };
}

describe("same-turn image move coalescing", () => {
  it("matches a prior remove of the same live index for a later insert", () => {
    const store = createSameTurnImageOps();
    recordImageOp(
      store,
      op({
        suggestionId: "remove-1",
        removeIndex: 1,
        payload: {
          deleteText: "",
          insertText: "",
          reasoning: "drop",
          removeImage: {
            src: PNG,
            alt: "Torque",
            width: 400,
            mediaId: null,
            index: 1,
          },
        },
      })
    );
    expect(
      findImageOpForMove(store, {
        section: "define",
        targetField: "narrative",
        src: PNG,
        removeIndex: 1,
      })?.suggestionId
    ).toBe("remove-1");
  });

  it("matches a positioned insert of the same src for a later remove", () => {
    const store = createSameTurnImageOps();
    recordImageOp(
      store,
      op({
        suggestionId: "insert-1",
        anchorText: "First paragraph.",
        payload: {
          deleteText: "",
          insertText: "",
          reasoning: "place",
          insertImage: { src: PNG, alt: "Torque", width: 400, mediaId: null },
        },
      })
    );
    expect(isPositionedImageOp(store.ops[0]!)).toBe(true);
    expect(
      findImageOpForRemove(store, {
        section: "define",
        targetField: "narrative",
        src: PNG,
        removeIndex: 1,
      })?.suggestionId
    ).toBe("insert-1");
  });

  it("does not fold a remove into an empty-anchor copy", () => {
    const store = createSameTurnImageOps();
    recordImageOp(
      store,
      op({
        suggestionId: "copy-1",
        payload: {
          deleteText: "",
          insertText: "",
          reasoning: "copy",
          insertImage: { src: PNG, alt: "Torque", width: 400, mediaId: null },
        },
      })
    );
    expect(
      findImageOpForRemove(store, {
        section: "define",
        targetField: "narrative",
        src: PNG,
        removeIndex: 1,
      })
    ).toBeUndefined();
  });

  it("updates a recorded op in place when the same suggestion is patched", () => {
    const store = createSameTurnImageOps();
    recordImageOp(store, op({ suggestionId: "a", removeIndex: 1 }));
    recordImageOp(
      store,
      op({
        suggestionId: "a",
        anchorText: "First paragraph.",
        removeIndex: 1,
      })
    );
    expect(store.ops).toHaveLength(1);
    expect(store.ops[0]?.anchorText).toBe("First paragraph.");
  });
});
