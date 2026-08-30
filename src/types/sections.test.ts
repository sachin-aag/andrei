import { describe, expect, it } from "vitest";
import {
  displaySectionLabel,
  humanizeSectionKey,
  SECTION_LABELS,
} from "./sections";

describe("displaySectionLabel", () => {
  it("uses workspace titles instead of snake_case keys", () => {
    expect(displaySectionLabel("purpose_scope")).toBe("Purpose & Scope");
    expect(displaySectionLabel("revision_history")).toBe("Revision History");
    expect(displaySectionLabel("qra_revision_history")).toBe("Revision History");
    expect(displaySectionLabel("testers_dates")).toBe("Testers/Dates");
    expect(displaySectionLabel("executed_protocol")).toBe("Executed Protocol");
    expect(displaySectionLabel("documents_reviewed")).toBe("Documents Reviewed");
  });

  it("title-cases unknown keys instead of showing underscores", () => {
    expect(humanizeSectionKey("some_new_section")).toBe("Some New Section");
    expect(displaySectionLabel("some_new_section")).toBe("Some New Section");
    expect(displaySectionLabel("qra_brand_new_block")).toBe("Brand New Block");
  });

  it("never returns an underscore for mapped section keys", () => {
    for (const key of Object.keys(SECTION_LABELS)) {
      expect(displaySectionLabel(key), key).not.toContain("_");
    }
  });
});
