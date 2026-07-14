import { describe, expect, it } from "vitest";
import {
  checkProposedEdit,
  proposedEditHint,
  REDRAFT_COVERAGE_THRESHOLD,
} from "@/lib/ai/chat/propose-edit";

const FIELD =
  "The tablet batch failed dissolution testing at 68 percent. The batch was then quarantined pending investigation.";

describe("checkProposedEdit", () => {
  it("accepts a pure end-insert (empty anchor)", () => {
    expect(
      checkProposedEdit(FIELD, { anchorText: "", deleteText: "", insertText: "A new closing sentence." })
    ).toEqual({ status: "ok" });
  });

  it("accepts a uniquely located targeted delete+insert", () => {
    expect(
      checkProposedEdit(FIELD, {
        anchorText: "failed dissolution testing at 68 percent",
        deleteText: "68 percent",
        insertText: "68% (spec: NLT 80%)",
      })
    ).toEqual({ status: "ok" });
  });

  it("reports not_found for an anchor that is absent", () => {
    expect(
      checkProposedEdit(FIELD, {
        anchorText: "cleanroom differential pressure",
        deleteText: "pressure",
        insertText: "x",
      })
    ).toEqual({ status: "not_found" });
  });

  it("reports ambiguous when the anchor matches more than once", () => {
    const repeated = "test alpha. test beta.";
    expect(
      checkProposedEdit(repeated, { anchorText: "test", deleteText: "test", insertText: "TEST" })
    ).toEqual({ status: "ambiguous" });
  });

  it("flags a delete covering more than half the field as too_large", () => {
    const result = checkProposedEdit(FIELD, {
      anchorText: "",
      deleteText: FIELD,
      insertText: "A complete rewrite of the field.",
    });
    expect(result.status).toBe("too_large");
    if (result.status === "too_large") {
      expect(result.coverage).toBeGreaterThan(REDRAFT_COVERAGE_THRESHOLD);
    }
  });

  it("does not flag a small delete as too_large", () => {
    const result = checkProposedEdit(FIELD, {
      anchorText: "then quarantined",
      deleteText: "then ",
      insertText: "",
    });
    expect(result.status).toBe("ok");
  });
});

describe("proposedEditHint", () => {
  it("returns an empty string for ok and actionable text otherwise", () => {
    expect(proposedEditHint({ status: "ok" })).toBe("");
    expect(proposedEditHint({ status: "ambiguous" })).toMatch(/unique/i);
    expect(proposedEditHint({ status: "not_found" })).toMatch(/read_section/i);
    expect(proposedEditHint({ status: "too_large", coverage: 0.9 })).toMatch(/smaller/i);
  });
});
