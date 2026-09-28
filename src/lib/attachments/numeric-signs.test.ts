import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  glueImmediateMinusSigns,
  glueOcrMinusSigns,
  glueOcrUrsIds,
  hasAmbiguousNumericDash,
  overlayLeadingMinuses,
  pageNeedsNumericSignLook,
  pageNeedsOcrSignLook,
  unsignedQuantityRangeCount,
} from "./numeric-signs";

/** Stored text layer from preview ingest `agcf0hgdaian9opdv807rg12` (v9). */
const GLR_1301_URS_PAGE_6 = readFileSync(
  path.join(
    process.cwd(),
    "src/lib/attachments/fixtures/glr-1301-urs-page-6.transcript.txt"
  ),
  "utf8"
).trim();
const GLR_1301_URS_PAGE_9 = readFileSync(
  path.join(
    process.cwd(),
    "src/lib/attachments/fixtures/glr-1301-urs-page-9.transcript.txt"
  ),
  "utf8"
).trim();

describe("glueOcrMinusSigns", () => {
  it("turns a figure dash, em dash, or fullwidth minus into a hyphen", () => {
    expect(glueOcrMinusSigns("‒15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("—15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("－15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("‐ 15 °C")).toBe("-15 °C");
  });

  it("glues an OCR-split minus from the URS temperature cell", () => {
    expect(glueOcrMinusSigns("- 15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("− 15 °C to 130 °C")).toBe("-15 °C to 130 °C");
    expect(glueOcrMinusSigns("- 20 °C to 150 °C")).toBe("-20 °C to 150 °C");
  });

  it("keeps an en-dash range separator between digits", () => {
    expect(glueOcrMinusSigns("15–130 °C")).toBe("15–130 °C");
    expect(glueOcrMinusSigns("-15–130 °C")).toBe("-15–130 °C");
  });
});

describe("glueImmediateMinusSigns", () => {
  it("converts an immediate unicode minus before a digit", () => {
    expect(glueImmediateMinusSigns("−15 °C")).toBe("-15 °C");
  });

  it("leaves a dash one space before a number for sign-vs-bullet overlay", () => {
    expect(glueImmediateMinusSigns("− 15 °C to 130 °C")).toBe(
      "− 15 °C to 130 °C"
    );
    expect(glueImmediateMinusSigns("– 15 samples")).toBe("– 15 samples");
    expect(glueImmediateMinusSigns("- 50 RPM")).toBe("- 50 RPM");
  });

  it("keeps an en-dash range between digits", () => {
    expect(glueImmediateMinusSigns("15–130 °C")).toBe("15–130 °C");
  });
});

describe("overlayLeadingMinuses", () => {
  it("copies a leading minus onto unsigned N °C when evidence has -N °C", () => {
    expect(
      overlayLeadingMinuses(
        "than 1 mm\n15 °C to 130 °C\nFull Vacuum",
        "Shell Operating temperature −15 °C to 130 °C"
      )
    ).toBe("than 1 mm\n-15 °C to 130 °C\nFull Vacuum");
  });

  it("copies a leading minus onto URS-37's dropped −20 °C to 150 °C", () => {
    expect(
      overlayLeadingMinuses(
        "URS-37 Temperature\n20 °C to 150\n°C\n0.1°C",
        "To measure the temperature - 20 °C to 150 °C"
      )
    ).toBe("URS-37 Temperature\n-20 °C to 150\n°C\n0.1°C");
  });

  it("copies a leading minus onto an RPM quantity", () => {
    expect(overlayLeadingMinuses("Setpoint 50 RPM", "Signed −50 RPM")).toBe(
      "Setpoint -50 RPM"
    );
  });

  it("glues a dash-then-space quantity once evidence shows a sign", () => {
    expect(
      overlayLeadingMinuses("– 15 °C to 130 °C", "−15 °C to 130 °C")
    ).toBe("-15 °C to 130 °C");
  });

  it("does not invent a minus when evidence has none", () => {
    expect(
      overlayLeadingMinuses(
        "15 °C to 130 °C",
        "User requirement 15 °C to 130 °C"
      )
    ).toBe("15 °C to 130 °C");
  });

  it("does not treat a bullet leftover as a sign when evidence is empty", () => {
    expect(overlayLeadingMinuses("– 15 samples were taken", "")).toBe(
      "– 15 samples were taken"
    );
  });

  it("does not turn an en-dash process range into a signed temperature", () => {
    expect(
      overlayLeadingMinuses("Process temperature 15–130 °C", "-15 °C to 130 °C")
    ).toBe("Process temperature 15–130 °C");
  });
});

describe("unsignedQuantityRangeCount", () => {
  it("counts unsigned unit ranges and ignores signed or en-dash ranges", () => {
    expect(unsignedQuantityRangeCount("15 °C to 130 °C\n15 °C to 130 °C")).toBe(
      2
    );
    expect(unsignedQuantityRangeCount("3 to 5 Kg/cm²")).toBe(1);
    expect(unsignedQuantityRangeCount("-15 °C to 130 °C")).toBe(0);
    expect(unsignedQuantityRangeCount("15–130 °C")).toBe(0);
    expect(unsignedQuantityRangeCount("3 to 5 samples")).toBe(0);
  });
});

describe("pageNeedsOcrSignLook", () => {
  it("OCRs leftover hyphens and unmapped glyphs, not unsigned ranges", () => {
    expect(
      pageNeedsOcrSignLook(
        "URS-3 Shell Operating temperature – 15 °C to 130 °C"
      )
    ).toBe(true);
    expect(pageNeedsOcrSignLook("15 °C to 130 °C", ["15"])).toBe(true);
    expect(pageNeedsOcrSignLook("15 °C to 130 °C")).toBe(false);
    expect(pageNeedsOcrSignLook("-15 °C to 130 °C")).toBe(false);
  });
});

describe("hasAmbiguousNumericDash", () => {
  it("detects a hyphen one space before a number", () => {
    expect(hasAmbiguousNumericDash("– 15 °C to 130 °C")).toBe(true);
    expect(hasAmbiguousNumericDash("- 50 RPM")).toBe(true);
    expect(
      hasAmbiguousNumericDash(
        "URS-3 Shell Operating temperature – 15 °C to 130 °C"
      )
    ).toBe(true);
    expect(hasAmbiguousNumericDash("-15 °C to 130 °C")).toBe(false);
    expect(hasAmbiguousNumericDash("15–130 °C")).toBe(false);
    expect(hasAmbiguousNumericDash("15 – 130 °C")).toBe(false);
    expect(hasAmbiguousNumericDash("URS-3 Shell")).toBe(false);
    expect(hasAmbiguousNumericDash("URS- 3 Shell")).toBe(false);
  });
});

describe("pageNeedsNumericSignLook", () => {
  it("looks at unsigned magnitudes from unmapped glyphs", () => {
    expect(pageNeedsNumericSignLook("15 °C to 130 °C", ["15"])).toBe(true);
    expect(pageNeedsNumericSignLook("-15 °C to 130 °C", ["15"])).toBe(false);
    expect(pageNeedsNumericSignLook("Process temperature 15–130 °C", ["15"])).toBe(
      false
    );
  });

  it("looks at a leftover dash that may be a minus or a bullet", () => {
    expect(
      pageNeedsNumericSignLook(
        "URS-3 Shell Operating temperature – 15 °C to 130 °C"
      )
    ).toBe(true);
    expect(pageNeedsNumericSignLook("– 15 samples were taken")).toBe(true);
    expect(pageNeedsNumericSignLook("Setpoint - 50 RPM")).toBe(true);
  });

  it("looks at an unsigned quantity range with no leftover hyphen", () => {
    expect(pageNeedsNumericSignLook("than 1 mm\n15 °C to 130 °C")).toBe(true);
    expect(pageNeedsNumericSignLook("20 °C to 150\n°C")).toBe(true);
    expect(pageNeedsNumericSignLook("3 to 5 Kg/cm²")).toBe(true);
    expect(pageNeedsNumericSignLook("-15 °C to 130 °C")).toBe(false);
    expect(pageNeedsNumericSignLook("Process temperature 15–130 °C")).toBe(
      false
    );
    expect(
      pageNeedsNumericSignLook("slice 0 line 0 of verification evidence")
    ).toBe(false);
  });

  it("looks at the live GLR-1301 URS pages that stored unsigned 15 / 20 °C", () => {
    expect(GLR_1301_URS_PAGE_6).toContain("15 °C to 130 °C");
    expect(GLR_1301_URS_PAGE_6).not.toMatch(/-15 °C to 130 °C/);
    expect(hasAmbiguousNumericDash(GLR_1301_URS_PAGE_6)).toBe(false);
    expect(pageNeedsOcrSignLook(GLR_1301_URS_PAGE_6)).toBe(false);
    expect(pageNeedsNumericSignLook(GLR_1301_URS_PAGE_6)).toBe(true);
    expect(unsignedQuantityRangeCount(GLR_1301_URS_PAGE_6)).toBeGreaterThan(0);

    expect(GLR_1301_URS_PAGE_9).toContain("20 °C to 150");
    expect(GLR_1301_URS_PAGE_9).not.toMatch(/-20 °C/);
    expect(hasAmbiguousNumericDash(GLR_1301_URS_PAGE_9)).toBe(false);
    expect(pageNeedsOcrSignLook(GLR_1301_URS_PAGE_9)).toBe(false);
    expect(pageNeedsNumericSignLook(GLR_1301_URS_PAGE_9)).toBe(true);
    expect(unsignedQuantityRangeCount(GLR_1301_URS_PAGE_9)).toBeGreaterThan(0);
  });

  it("copies −15 / −20 onto those live URS pages only when evidence has the sign", () => {
    expect(
      overlayLeadingMinuses(GLR_1301_URS_PAGE_6, "−15 °C to 130 °C")
    ).toMatch(/-15 °C to 130 °C/);
    expect(
      overlayLeadingMinuses(GLR_1301_URS_PAGE_6, "15 °C to 130 °C")
    ).not.toMatch(/-15 °C to 130 °C/);
    expect(
      overlayLeadingMinuses(GLR_1301_URS_PAGE_9, "−20 °C to 150 °C")
    ).toMatch(/-20 °C to 150/);
    expect(
      overlayLeadingMinuses(GLR_1301_URS_PAGE_9, "20 °C to 150 °C")
    ).not.toMatch(/-20 °C/);
  });
});

describe("glueOcrUrsIds", () => {
  it("glues a table/footer wrap of URS-33", () => {
    expect(glueOcrUrsIds("URS- 33 Stage and location")).toBe(
      "URS-33 Stage and location"
    );
    expect(glueOcrUrsIds("URS-\n33 Stage and location")).toBe(
      "URS-33 Stage and location"
    );
    expect(glueOcrUrsIds("URS - 33 Stage and location")).toBe(
      "URS-33 Stage and location"
    );
  });

  it("is a no-op on a clean URS ID and does not turn URS-1 into URS-13", () => {
    expect(glueOcrUrsIds("URS-13 Jacket Type")).toBe("URS-13 Jacket Type");
    expect(glueOcrUrsIds("URS-1 Reactor Capacity URS-13 Jacket Type")).toBe(
      "URS-1 Reactor Capacity URS-13 Jacket Type"
    );
  });
});
