import { describe, expect, it } from "vitest";
import { pageCountForContentHeight } from "./page-layout";

describe("pageCountForContentHeight", () => {
  it("is one page when empty or unmeasured", () => {
    expect(pageCountForContentHeight(0, 1056)).toBe(1);
    expect(pageCountForContentHeight(400, 0)).toBe(1);
  });

  it("stays on one page until content exceeds the page height", () => {
    expect(pageCountForContentHeight(1056, 1056)).toBe(1);
    expect(pageCountForContentHeight(1056.2, 1056)).toBe(1);
    expect(pageCountForContentHeight(1057, 1056)).toBe(2);
    expect(pageCountForContentHeight(2112, 1056)).toBe(2);
    expect(pageCountForContentHeight(2113, 1056)).toBe(3);
  });
});
