import { describe, expect, it } from "vitest";
import {
  isPageNumberQuestion,
  rejectPageNumberAskUserQuestions,
} from "./page-number-ask";

describe("isPageNumberQuestion", () => {
  it("matches the questions Quick asked on the mechanical test PDF", () => {
    expect(isPageNumberQuestion("Which page is M3-SYS-FN-037 on?")).toBe(true);
    expect(isPageNumberQuestion("What page should I read?")).toBe(true);
    expect(isPageNumberQuestion("Which pages have mist volume?")).toBe(true);
    expect(isPageNumberQuestion("What is the LSL / USL?")).toBe(false);
    expect(isPageNumberQuestion("Which assay should I extract?")).toBe(false);
  });
});

describe("rejectPageNumberAskUserQuestions", () => {
  it("drops page-number questions and keeps assay / spec questions", () => {
    const { kept, rejected } = rejectPageNumberAskUserQuestions([
      { question: "Which page is M3-SYS-FN-037 on?" },
      { question: "Which assay should I extract?" },
    ]);
    expect(rejected).toHaveLength(1);
    expect(kept.map((item) => item.question)).toEqual([
      "Which assay should I extract?",
    ]);
  });
});
