import { describe, expect, it } from "vitest";
import {
  coerceLegacyFix,
  EMPTY_SUGGESTED_FIX,
  hasFixContent,
  modelSuggestedFixSchema,
  suggestedFixSchema,
} from "@/lib/ai/suggested-fix";

describe("suggestedFixSchema", () => {
  it("accepts kind none, patch, and fields", () => {
    expect(suggestedFixSchema.parse({ kind: "none" })).toEqual({ kind: "none" });
    expect(
      suggestedFixSchema.parse({
        kind: "patch",
        anchorText: "a",
        replacementText: "b",
      })
    ).toEqual({ kind: "patch", anchorText: "a", replacementText: "b" });
    expect(
      suggestedFixSchema.parse({
        kind: "fields",
        ops: [{ op: "set", path: "sixM.man", value: "x" }],
      })
    ).toEqual({
      kind: "fields",
      ops: [{ op: "set", path: "sixM.man", value: "x" }],
    });
  });

  it("rejects append op without op discriminator shape", () => {
    const bad = { kind: "fields", ops: [{ path: "x", value: {} }] };
    expect(() => suggestedFixSchema.parse(bad)).toThrow();
  });
});

describe("modelSuggestedFixSchema", () => {
  it("accepts model fix shapes so they can be coerced after parsing", () => {
    expect(
      modelSuggestedFixSchema.parse({
        anchorText: "old",
        replacementText: "new",
      })
    ).toEqual({ anchorText: "old", replacementText: "new" });
  });

  it("accepts stringified field ops returned by the model", () => {
    const parsed = modelSuggestedFixSchema.parse({
        kind: "fields",
        ops: [
          JSON.stringify({
            op: "set",
            path: "fiveWhy.conclusion",
            value: "Conclusion text.",
          }),
        ],
      });

    expect(parsed).toEqual({
      kind: "fields",
      ops: [
        JSON.stringify({
          op: "set",
          path: "fiveWhy.conclusion",
          value: "Conclusion text.",
        }),
      ],
    });
    expect(coerceLegacyFix(parsed)).toEqual({
      kind: "fields",
      ops: [
        {
          op: "set",
          path: "fiveWhy.conclusion",
          value: "Conclusion text.",
        },
      ],
    });
  });

  it("keeps the model boundary shallow while runtime coercion stays strict", () => {
    expect(() => modelSuggestedFixSchema.parse(null)).toThrow();
    expect(modelSuggestedFixSchema.parse({ kind: "fields", ops: [null] })).toEqual({
      kind: "fields",
      ops: [null],
    });
    expect(coerceLegacyFix({ kind: "fields", ops: [null] })).toEqual(
      EMPTY_SUGGESTED_FIX
    );
  });
});

describe("coerceLegacyFix", () => {
  it("maps anchorText/replacementText without kind to patch", () => {
    expect(
      coerceLegacyFix({ anchorText: "old", replacementText: "new" })
    ).toEqual({
      kind: "patch",
      anchorText: "old",
      replacementText: "new",
    });
  });

  it("passes through objects that already declare a valid kind", () => {
    const fields = {
      kind: "fields",
      ops: [{ op: "set", path: "a.b", value: "v" }],
    };
    expect(coerceLegacyFix(fields)).toEqual(fields);
  });

  it("normalizes stringified field ops on already-kind-tagged fixes", () => {
    expect(
      coerceLegacyFix({
        kind: "fields",
        ops: [
          JSON.stringify({
            op: "set",
            path: "rootCause.narrative",
            value: "Root cause text.",
          }),
        ],
      })
    ).toEqual({
      kind: "fields",
      ops: [
        {
          op: "set",
          path: "rootCause.narrative",
          value: "Root cause text.",
        },
      ],
    });
  });

  it("collapses null and unknown shapes to none", () => {
    expect(coerceLegacyFix(null)).toEqual(EMPTY_SUGGESTED_FIX);
    expect(coerceLegacyFix(undefined)).toEqual(EMPTY_SUGGESTED_FIX);
    expect(coerceLegacyFix({ foo: 1 })).toEqual(EMPTY_SUGGESTED_FIX);
  });
});

describe("hasFixContent", () => {
  it("is false for none and empty patch", () => {
    expect(hasFixContent({ kind: "none" })).toBe(false);
    expect(
      hasFixContent({ kind: "patch", anchorText: "", replacementText: "   " })
    ).toBe(false);
  });

  it("is true for non-whitespace patch replacement", () => {
    expect(
      hasFixContent({
        kind: "patch",
        anchorText: "",
        replacementText: " prose ",
      })
    ).toBe(true);
  });

  it("is true when fields has at least one op", () => {
    expect(
      hasFixContent({
        kind: "fields",
        ops: [{ op: "set", path: "x", value: "y" }],
      })
    ).toBe(true);
  });
});
