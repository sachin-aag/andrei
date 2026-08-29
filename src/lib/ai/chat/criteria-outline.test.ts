import { describe, expect, it } from "vitest";
import { buildCriteriaOutline } from "./criteria-outline";

describe("buildCriteriaOutline", () => {
  it("filters to a single section when scoped", () => {
    const scoped = buildCriteriaOutline("define");
    const all = buildCriteriaOutline("all");
    expect(scoped).toContain("[define]:");
    expect(scoped).not.toContain("[measure]:");
    expect(all).toContain("[measure]:");
  });
});
