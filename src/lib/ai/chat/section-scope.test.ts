import { describe, expect, it } from "vitest";
import { buildCriteriaOutline } from "./criteria-outline";
import { parseChatSectionScope } from "./fields";

describe("parseChatSectionScope", () => {
  it("defaults unknown values to all", () => {
    expect(parseChatSectionScope(undefined)).toBe("all");
    expect(parseChatSectionScope("bogus")).toBe("all");
  });

  it("accepts all and editable section ids", () => {
    expect(parseChatSectionScope("all")).toBe("all");
    expect(parseChatSectionScope("analyze")).toBe("analyze");
  });
});

describe("buildCriteriaOutline scope", () => {
  it("filters to a single section when scoped", () => {
    const scoped = buildCriteriaOutline("define");
    const all = buildCriteriaOutline("all");
    expect(scoped).toContain("[define]:");
    expect(scoped).not.toContain("[measure]:");
    expect(all).toContain("[measure]:");
  });
});
