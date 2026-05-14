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

  it("changes when salt changes even if content is identical", () => {
    const content = { section: "define", values: ["a", "b"] };
    expect(hashContent(content, "v1")).not.toBe(hashContent(content, "v2"));
  });

  it("is stable for the same content + salt", () => {
    const content = { section: "define", values: ["a", "b"] };
    expect(hashContent(content, "v1")).toBe(hashContent(content, "v1"));
  });

  it("is unaffected when salt is omitted versus supplied as undefined", () => {
    const content = { section: "define", values: ["a"] };
    expect(hashContent(content)).toBe(hashContent(content, undefined));
  });
});
