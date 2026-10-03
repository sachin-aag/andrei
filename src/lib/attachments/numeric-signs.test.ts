import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  glueOcrMinusSigns,
  glueOcrUrsIds,
  NUMERIC_SIGN_LOOK_MARK,
  overlayLeadingMinuses,
  pageNeedsNumericSignLook,
  stampNumericSignLook,
  unsignedQuantityRangeCount,
} from "./numeric-signs";

const GLR_1301_URS_PAGE_6 = readFileSync(
  new URL("./fixtures/glr-1301-urs-page-6.transcript.txt", import.meta.url),
  "utf8"
);
const GLR_1301_URS_PAGE_9 = readFileSync(
  new URL("./fixtures/glr-1301-urs-page-9.transcript.txt", import.meta.url),
  "utf8"
);

describe("glueOcrMinusSigns", () => {
  it("turns a unicode minus or en-dash sign into a hyphen", () => {
    expect(glueOcrMinusSigns("−15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("–15 °C")).toBe("-15 °C");
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

  it("glues a lettered URS-34 subpart", () => {
    expect(glueOcrUrsIds("URS-34 a For solvent transfer")).toBe(
      "URS-34a For solvent transfer"
    );
    expect(glueOcrUrsIds("URS-34 b\nFor cleaning")).toBe(
      "URS-34b\nFor cleaning"
    );
    expect(glueOcrUrsIds(GLR_1301_URS_PAGE_9)).toMatch(/URS-34a/);
    expect(glueOcrUrsIds(GLR_1301_URS_PAGE_9)).toMatch(/URS-34b/);
  });
});

describe("overlayLeadingMinuses", () => {
  it("copies a leading minus onto URS-3's dropped −15 °C to 130 °C", () => {
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

  it("does not rewrite live URS-10 ~50±10 RPM when evidence hallucinates −50 RPM", () => {
    const next = overlayLeadingMinuses(
      GLR_1301_URS_PAGE_6,
      "−15 °C to 130 °C\n−50 RPM"
    );
    expect(next).toMatch(/-15 °C to 130 °C/);
    expect(next).toContain("~50±10 RPM");
    expect(next).not.toMatch(/-50±10 RPM/);
    expect(next).not.toMatch(/-50 RPM/);
  });

  it("does not invent a minus from unsigned evidence", () => {
    expect(
      overlayLeadingMinuses(
        "15 °C to 130 °C",
        "User requirement 15 °C to 130 °C"
      )
    ).toBe("15 °C to 130 °C");
  });

  it("copies a leading minus onto an en-dash Celsius range, not the high end", () => {
    expect(
      overlayLeadingMinuses("Process temperature 15–130 °C", "-15 °C to 130 °C")
    ).toBe("Process temperature -15–130 °C");
  });

  it("copies a leading minus onto compact ℃ and OCR °to ranges", () => {
    expect(overlayLeadingMinuses("15℃ to 130℃", "−15℃ to 130℃")).toBe(
      "-15℃ to 130℃"
    );
    expect(overlayLeadingMinuses("20°to 220℃", "-20 °C to 220 °C")).toBe(
      "-20°to 220℃"
    );
  });

  it("overlays the live GLR-1301 page-6 fixture without emptying RPM", () => {
    expect(GLR_1301_URS_PAGE_6).toContain("15 °C to 130 °C");
    expect(GLR_1301_URS_PAGE_6).toContain("~50±10 RPM");
    const next = overlayLeadingMinuses(GLR_1301_URS_PAGE_6, "−15 °C to 130 °C");
    expect(next).toMatch(/-15 °C to 130 °C/);
    expect(next).toContain("~50±10 RPM");
  });

  it("overlays the live GLR-1301 page-9 fixture for URS-37", () => {
    expect(GLR_1301_URS_PAGE_9).toContain("20 °C to 150");
    const next = overlayLeadingMinuses(GLR_1301_URS_PAGE_9, "−20 °C to 150 °C");
    expect(next).toMatch(/-20 °C to 150/);
  });
});

describe("pageNeedsNumericSignLook", () => {
  it("looks at unsigned Celsius ranges even with no leftover hyphen", () => {
    expect(unsignedQuantityRangeCount("15 °C to 130 °C\n15 °C to 130 °C")).toBe(
      2
    );
    expect(pageNeedsNumericSignLook("15 °C to 130 °C")).toBe(true);
    expect(pageNeedsNumericSignLook("-15 °C to 130 °C")).toBe(false);
    expect(pageNeedsNumericSignLook("slice 0 line 0 of verification evidence")).toBe(
      false
    );
  });

  it("looks at en-dash, ℃ , and OCR °to unsigned ranges", () => {
    expect(pageNeedsNumericSignLook("15–130 °C")).toBe(true);
    expect(pageNeedsNumericSignLook("15℃ to 130℃")).toBe(true);
    expect(pageNeedsNumericSignLook("20°to 220℃")).toBe(true);
    expect(pageNeedsNumericSignLook("-15–130 °C")).toBe(false);
  });

  it("skips a second look after the overlay stamp, including an empty look", () => {
    const stamped = stampNumericSignLook("", "");
    expect(stamped).toContain(NUMERIC_SIGN_LOOK_MARK);
    expect(pageNeedsNumericSignLook("15 °C to 130 °C", stamped)).toBe(false);
    expect(pageNeedsNumericSignLook("15 °C to 130 °C", "")).toBe(true);
  });
});
