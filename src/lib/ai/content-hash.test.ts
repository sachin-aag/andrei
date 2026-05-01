import { describe, expect, it } from "vitest";
import { hashContent } from "@/lib/ai/content-hash";

describe("hashContent", () => {
  it("is stable for object keys in different orders", () => {
    expect(hashContent({ section: "define", content: { b: 2, a: 1 } })).toBe(
      hashContent({ content: { a: 1, b: 2 }, section: "define" }),
    );
  });

  it("changes when nested content changes", () => {
    expect(hashContent({ values: ["a", "b"] })).not.toBe(
      hashContent({ values: ["b", "a"] }),
    );
  });
});
