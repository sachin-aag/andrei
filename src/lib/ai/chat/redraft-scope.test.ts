import { describe, expect, it } from "vitest";
import {
  classifyRedraftScope,
  docHasTable,
  redraftDeleteCoverage,
  redraftTableStructureHint,
  redraftTooSmallHint,
} from "./redraft-scope";

const PURPOSE =
  "The purpose of this revision of this report is to present the testing results obtained following the partial execution of the Solea Model 3 System Design Verification Protocol (825-00024 Rev. G), which is used to test the Solea Software Application version 4.8.0.1164 (825-00104 Rev. B), for Full Market Release. This build was designed to support the Perioguide feature introduction. " +
  "Due to the fact that not all requirements were tested during this partial execution of the test protocol, this test report contains the results from the most recent full execution of the test protocol (documented in Rev. F of the Solea Model 3 test report) for the release of Solea Software Application version 4.7.0. " +
  "Note that Convergent Dental's software version control system (VCS) has four components that uniquely identify the release: mm.nn.ff.bb, where: " +
  "mm: represents major release number (01, 02, etc.) " +
  "nn: represents minor release number (01, 02, etc.) " +
  "ff: represents fix release number (01, 02, etc.) " +
  "bb: represents build number (01, 02, etc.) " +
  "The build number is considered an internal identifier and may not be displayed to the customer. In cases where the build number is omitted, the fix release number defines the release. There is only one combination of major, minor, and fix number for each release.";

/**
 * What the model actually proposed for "remove the versioning details in the
 * purpose section": two version strings dropped, every other span kept —
 * including the mm.nn.ff.bb block. 4% of the field.
 */
const PURPOSE_WITHOUT_VERSIONS =
  "The purpose of this revision of this report is to present the testing results obtained following the partial execution of the Solea Model 3 System Design Verification Protocol (825-00024 Rev. G), which is used to test the Solea Software Application for Full Market Release. This build was designed to support the Perioguide feature introduction. " +
  "Due to the fact that not all requirements were tested during this partial execution of the test protocol, this test report contains the results from the most recent full execution of the test protocol (documented in Rev. F of the Solea Model 3 test report) for the release of Solea Software Application. " +
  "Note that Convergent Dental's software version control system (VCS) has four components that uniquely identify the release: mm.nn.ff.bb, where: " +
  "mm: represents major release number (01, 02, etc.) " +
  "nn: represents minor release number (01, 02, etc.) " +
  "ff: represents fix release number (01, 02, etc.) " +
  "bb: represents build number (01, 02, etc.) " +
  "The build number is considered an internal identifier and may not be displayed to the customer. In cases where the build number is omitted, the fix release number defines the release. There is only one combination of major, minor, and fix number for each release.";

describe("redraftDeleteCoverage", () => {
  it("is zero when nothing changed", () => {
    expect(redraftDeleteCoverage(PURPOSE, PURPOSE)).toBe(0);
  });

  it("is one when the field is replaced wholesale", () => {
    const coverage = redraftDeleteCoverage(
      PURPOSE,
      "An entirely different purpose statement for a different device."
    );
    expect(coverage).toBeGreaterThan(0.9);
  });

  it("ignores whitespace-only reflow", () => {
    expect(redraftDeleteCoverage("one two three", "one  two\nthree")).toBe(0);
  });
});

describe("classifyRedraftScope", () => {
  const base = { currentHasTable: false, nextHasTable: false };

  it("classifies the Purpose versioning removal as a targeted edit", () => {
    const scope = classifyRedraftScope({
      ...base,
      currentText: PURPOSE,
      nextText: PURPOSE_WITHOUT_VERSIONS,
    });
    expect(scope.kind).toBe("targeted_edit");
    if (scope.kind === "targeted_edit") {
      expect(scope.coverage).toBeLessThan(0.1);
    }
  });

  it("classifies an append as a targeted edit", () => {
    const scope = classifyRedraftScope({
      ...base,
      currentText: PURPOSE,
      nextText: `${PURPOSE} One more sentence about partial execution.`,
    });
    expect(scope).toEqual({ kind: "targeted_edit", coverage: 0 });
  });

  it("classifies a genuine full rewrite as a rewrite", () => {
    const scope = classifyRedraftScope({
      ...base,
      currentText: PURPOSE,
      nextText:
        "This report documents mechanical verification of the handpiece assembly against 731-00008, covering drop, vibration, and thermal cycling with pass criteria drawn from the design inputs.",
    });
    expect(scope.kind).toBe("rewrite");
  });

  it("sends adding a table while keeping the prose back to create_table", () => {
    const scope = classifyRedraftScope({
      currentText: PURPOSE,
      nextText: PURPOSE,
      currentHasTable: false,
      nextHasTable: true,
    });
    expect(scope).toEqual({ kind: "table_structure", adding: true });
  });

  it("sends removing a table while keeping the prose back to delete_table", () => {
    const scope = classifyRedraftScope({
      currentText: PURPOSE,
      nextText: PURPOSE,
      currentHasTable: true,
      nextHasTable: false,
    });
    expect(scope).toEqual({ kind: "table_structure", adding: false });
  });

  it("still classifies a wholesale rewrite that adds a table as a rewrite", () => {
    const scope = classifyRedraftScope({
      currentText: PURPOSE,
      nextText:
        "This report documents mechanical verification of the handpiece assembly.\n\n| Check | Result |\n| --- | --- |\n| Drop | Pass |",
      currentHasTable: false,
      nextHasTable: true,
    });
    expect(scope.kind).toBe("rewrite");
  });

  it("treats an empty field as a rewrite", () => {
    const scope = classifyRedraftScope({
      ...base,
      currentText: "",
      nextText: PURPOSE,
    });
    expect(scope.kind).toBe("rewrite");
  });
});

describe("docHasTable", () => {
  it("finds a nested table", () => {
    expect(
      docHasTable({
        type: "doc",
        content: [{ type: "paragraph" }, { type: "table", content: [] }],
      })
    ).toBe(true);
  });

  it("is false for prose", () => {
    expect(
      docHasTable({ type: "doc", content: [{ type: "paragraph" }] })
    ).toBe(false);
    expect(docHasTable(null)).toBe(false);
  });
});

describe("redraftTooSmallHint", () => {
  it("names propose_edit and how much of the field survives", () => {
    const hint = redraftTooSmallHint(0.37);
    expect(hint).toContain("63%");
    expect(hint).toContain("propose_edit");
    expect(hint).toContain("Nearby wording in the same field belongs in one call");
  });
});

describe("redraftTableStructureHint", () => {
  it("routes an added table to create_table", () => {
    const hint = redraftTableStructureHint(true);
    expect(hint).toMatch(/create_table/);
    expect(hint).not.toMatch(/draft_field would/);
  });

  it("routes a removed table to delete_table", () => {
    expect(redraftTableStructureHint(false)).toMatch(/delete_table/);
  });
});
