import { afterEach, describe, expect, it } from "vitest";
import {
  resetProofreadRateLimitForTests,
  takeProofreadRateSlot,
} from "./rate-limit";
import { stubProofreadIssues } from "./stub";
import { mapProofreadModelIssuesForTests } from "./proofread";
import { hashProofreadText } from "@/lib/proofread/hash";

describe("proofread rate limit", () => {
  afterEach(() => {
    resetProofreadRateLimitForTests();
  });

  it("allows a burst then rejects", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) {
      expect(takeProofreadRateSlot("u1", now)).toBe(true);
    }
    expect(takeProofreadRateSlot("u1", now)).toBe(false);
    expect(takeProofreadRateSlot("u2", now)).toBe(true);
    expect(takeProofreadRateSlot("u1", now + 60_001)).toBe(true);
  });
});

describe("proofread stub", () => {
  it("flags dont without an apostrophe", () => {
    const issues = stubProofreadIssues([
      { id: "p-0", text: "i dont know what happened here" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.deleteText).toBe("dont");
    expect(issues[0]?.insertText).toBe("don't");
    expect(issues[0]?.severity).toBe("grammar");
  });

  it("returns nothing when the text is clean", () => {
    expect(
      stubProofreadIssues([{ id: "p-0", text: "The result was within specification." }])
    ).toEqual([]);
  });

  it("does not re-flag an already-fixed don't", () => {
    expect(
      stubProofreadIssues([{ id: "p-0", text: "i don't know what happened here" }])
    ).toEqual([]);
  });
});

describe("proofread model mapping", () => {
  it("keeps locatable issues and drops the rest", () => {
    const unit = { id: "p-0", text: "i dont know what happened here" };
    const issues = mapProofreadModelIssuesForTests([unit], [
      {
        unitId: "p-0",
        severity: "grammar",
        deleteText: "dont",
        insertText: "don't",
        label: "don't",
      },
      {
        unitId: "p-0",
        severity: "tone",
        deleteText: "missing",
        insertText: "gone",
        label: "gone",
      },
      {
        unitId: "p-9",
        severity: "grammar",
        deleteText: "dont",
        insertText: "don't",
        label: "don't",
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.unitHash).toBe(hashProofreadText(unit.text));
    expect(issues[0]?.anchorText).toContain("dont");
  });
});
