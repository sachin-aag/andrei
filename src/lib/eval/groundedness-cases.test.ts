import { describe, expect, it } from "vitest";
import { GROUNDEDNESS_GOLD_CASES } from "@/lib/eval/groundedness-cases";

describe("groundedness gold cases", () => {
  it("replays the media-fill Purpose/Scope incident as a block case", () => {
    const incident = GROUNDEDNESS_GOLD_CASES.find(
      (row) => row.id === "elr-media-fill-purpose-scope-miscite"
    );
    expect(incident).toMatchObject({
      policy: "block",
      expectBlocked: true,
      expectUnsourced: expect.arrayContaining(["MF-25-VIAL-01"]),
      expectVerified: expect.arrayContaining(["E/PR/070"]),
    });
  });
});
