import { describe, expect, it } from "vitest";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import {
  foldLeftoverTestersDates,
  convergentDesignVerificationDefinition,
} from "./convergent-design-verification";

function testersDoc(text: string) {
  return {
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

describe("foldLeftoverTestersDates", () => {
  it("appends a date range when testers prose has no dates", () => {
    const folded = foldLeftoverTestersDates(
      testersDoc("Alex Rivera, independent test engineer."),
      "2026-03-01",
      "2026-03-04"
    );
    const text = JSON.stringify(folded);
    expect(text).toContain("Alex Rivera, independent test engineer.");
    expect(text).toContain("Test dates: 2026-03-01 through 2026-03-04.");
  });

  it("does not duplicate dates already in the testers narrative", () => {
    const original = testersDoc(
      "Alex Rivera. Test dates: 2026-03-01 through 2026-03-04."
    );
    const folded = foldLeftoverTestersDates(original, "2026-03-01", "2026-03-04");
    expect(folded).toEqual(original);
  });

  it("leaves testers unchanged when leftover dates are empty", () => {
    const original = testersDoc("Alex Rivera.");
    expect(foldLeftoverTestersDates(original, "", "")).toEqual(original);
    expect(foldLeftoverTestersDates(original, undefined, undefined)).toEqual(
      original
    );
  });
});

describe("merge testers_dates", () => {
  it("returns testers only and folds leftover date fields", () => {
    const merged = convergentDesignVerificationDefinition.mergeSection(
      "testers_dates",
      {
        testers: testersDoc("Alex Rivera."),
        startDate: "2026-03-01",
        endDate: "2026-03-04",
      }
    ) as { testers: unknown; startDate?: unknown; endDate?: unknown };
    expect(merged.startDate).toBeUndefined();
    expect(merged.endDate).toBeUndefined();
    expect(JSON.stringify(merged.testers)).toContain(
      "Test dates: 2026-03-01 through 2026-03-04."
    );
  });

  it("uses an empty testers doc when content is missing", () => {
    const merged = convergentDesignVerificationDefinition.mergeSection(
      "testers_dates",
      null
    ) as { testers: unknown };
    expect(merged.testers).toEqual(emptyDoc());
  });
});
