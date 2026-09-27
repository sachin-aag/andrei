import { describe, expect, it } from "vitest";
import {
  assembleDraftingGuidance,
  flattenDraftingGuidance,
  pickDraftingGuidance,
  splitMarkdownH2,
} from "./chat-drafting-guidance";

describe("splitMarkdownH2", () => {
  it("splits on ## headings", () => {
    const parts = splitMarkdownH2(`## Alpha
one

## Beta
two`);
    expect(parts).toEqual([
      { heading: "Alpha", body: "## Alpha\none" },
      { heading: "Beta", body: "## Beta\ntwo" },
    ]);
  });
});

describe("assembleDraftingGuidance", () => {
  it("routes headings to always vs bySection", () => {
    const guidance = assembleDraftingGuidance({
      markdown: `## Report shape
identity

## Purpose
purpose sample

## Scope
scope sample`,
      headingTarget: {
        "Report shape": "always",
        Purpose: "purpose",
        Scope: "scope",
      },
      extraAlways: "## Extra always\nkeep",
      extraBySection: { purpose: "purpose extra" },
    });
    expect(guidance.always).toContain("identity");
    expect(guidance.always).toContain("Extra always");
    expect(guidance.always).not.toContain("purpose sample");
    expect(guidance.bySection?.purpose).toContain("purpose sample");
    expect(guidance.bySection?.purpose).toContain("purpose extra");
    expect(guidance.bySection?.scope).toContain("scope sample");
  });

  it("throws on an unmapped heading", () => {
    expect(() =>
      assembleDraftingGuidance({
        markdown: "## Mystery\nnope",
        headingTarget: {},
      })
    ).toThrow(/Unmapped drafting heading: Mystery/);
  });
});

describe("pickDraftingGuidance", () => {
  it("loads always plus only requested sections", () => {
    const guidance = {
      always: "report-wide",
      bySection: {
        purpose: "purpose recipe",
        scope: "scope recipe",
      },
    } as const;
    expect(pickDraftingGuidance(guidance, ["purpose"])).toBe(
      "report-wide\n\npurpose recipe"
    );
    expect(pickDraftingGuidance(guidance, ["scope"])).not.toContain(
      "purpose recipe"
    );
    expect(flattenDraftingGuidance(guidance)).toContain("scope recipe");
  });
});
