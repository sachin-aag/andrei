import { describe, expect, it } from "vitest";
import {
  detectOverclaims,
  permanenceBounceMessage,
  permanenceClaims,
  unboundedScopeClaims,
  unboundedScopeWarning,
} from "./overclaim";

function kinds(text: string): string[] {
  return detectOverclaims(text).map((item) => item.kind);
}

describe("permanence claims", () => {
  it("catches the wording seen in shipped reports", () => {
    expect(kinds("The needle valve was permanently fixed.")).toEqual([
      "permanence",
    ]);
    expect(kinds("This is a permanent solution to the excursion.")).toEqual([
      "permanence",
    ]);
    expect(
      kinds("The revised BMR completely eliminates the possibility of recurrence.")
    ).toContain("permanence");
    expect(kinds("The deviation will not recur.")).toEqual(["permanence"]);
    expect(kinds("The event cannot recur once the valve is replaced.")).toEqual([
      "permanence",
    ]);
    expect(kinds("The control ensures that no excursion occurs.")).toEqual([
      "permanence",
    ]);
    expect(kinds("There was no product impact whatsoever.")).toEqual([
      "permanence",
    ]);
    expect(kinds("The automated valve is 100% effective.")).toEqual([
      "permanence",
    ]);
  });

  it("leaves the bounded version of the same sentence alone", () => {
    // This is what the report should say, and it must not be flagged.
    expect(kinds("The needle valve was corrected and the vacuum recovered.")).toEqual(
      []
    );
    expect(
      kinds(
        "No recurrence was observed in the 3 batches processed after the event."
      )
    ).toEqual([]);
    expect(
      kinds("The corrective action was implemented on 24/05/2026 and verified.")
    ).toEqual([]);
    expect(kinds("The excursion was resolved by manual adjustment.")).toEqual([]);
  });
});

describe("unbounded scope claims", () => {
  it("catches a universal claim over an evidence set", () => {
    // The exact shape our Historic Review draft shipped.
    expect(
      kinds(
        "All historical batches underwent release testing and met all USP and in-house specifications."
      )
    ).toContain("unbounded_scope");
    expect(kinds("Every sample was within the acceptance range.")).toContain(
      "unbounded_scope"
    );
    expect(kinds("All results were within specification.")).toContain(
      "unbounded_scope"
    );
  });

  it("does not flag a quantifier without a compliance verdict", () => {
    // Reviewing every batch is fine; claiming every batch passed is the issue.
    expect(kinds("All 24 batches were reviewed for vacuum excursions.")).toEqual(
      []
    );
    expect(kinds("Every batch trend print was attached to this report.")).toEqual(
      []
    );
  });

  it("does not flag an ordinary scoped conclusion", () => {
    // Standard regulated phrasing that is correct when the scope is stated.
    expect(
      kinds(
        "No adverse impact on product quality was identified for batch RIG25014."
      )
    ).toEqual([]);
    expect(
      kinds(
        "The 3 batches reviewed (RIG23001, RIG23008, RIG24003) met their release specifications."
      )
    ).toEqual([]);
  });
});

describe("splitting and messages", () => {
  it("separates the two kinds so one can bounce and the other warn", () => {
    const items = detectOverclaims(
      "The issue was permanently resolved. All batches met their specifications."
    );
    expect(permanenceClaims(items)).toHaveLength(1);
    expect(unboundedScopeClaims(items)).toHaveLength(1);
  });

  it("tells the model the draft was not saved and what to change", () => {
    const items = permanenceClaims(
      detectOverclaims("The issue was permanently resolved.")
    );
    const message = permanenceBounceMessage(items);
    expect(message).toContain("was not saved");
    expect(message).toContain("permanently resolved");
    expect(message).toContain("call the tool again");
  });

  it("asks for the checked set to be named", () => {
    const items = unboundedScopeClaims(
      detectOverclaims("All batches met their specifications.")
    );
    expect(unboundedScopeWarning(items)).toContain("Name the set you actually checked");
  });

  it("de-duplicates a phrase repeated through a draft", () => {
    const items = detectOverclaims(
      "It was permanently fixed. Later it was permanently fixed again."
    );
    expect(items).toHaveLength(1);
  });

  it("returns nothing for empty text", () => {
    expect(detectOverclaims("")).toEqual([]);
    expect(detectOverclaims("   ")).toEqual([]);
  });
});
