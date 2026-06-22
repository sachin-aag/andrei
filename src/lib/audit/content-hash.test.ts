import { describe, expect, it } from "vitest";
import { hashSectionContent } from "./content-hash";

describe("hashSectionContent", () => {
  it("returns stable hash for same content", () => {
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    expect(hashSectionContent(content)).toBe(hashSectionContent(content));
  });

  it("returns different hash when content changes", () => {
    const a = { field: "hello" };
    const b = { field: "world" };
    expect(hashSectionContent(a)).not.toBe(hashSectionContent(b));
  });

  it("treats key order consistently via JSON serialization", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 2, x: 1 };
    expect(hashSectionContent(a)).toBe(hashSectionContent(b));
  });
});
