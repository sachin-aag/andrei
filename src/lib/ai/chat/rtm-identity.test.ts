import { describe, expect, it } from "vitest";
import { identityFromUrsQuotes, identityRowsForChecklist } from "./rtm-identity";

const COLUMN_PAGE = {
  filename: "User Requirement Specification.PDF",
  pageNumber: 6,
  quote:
    "URS ID # Parameters User requirements URS-1 Reactor Capacity URS-2 MOC URS-3 Shell Operating temperature URS-4 Shell Operating pressure URS-12 Jacket MOC Format. No.:-QAD-SOP-FS-003-F03-00 8000 L High-quality Glass Lining and thickness should not be less than 1 mm 15 °C to 130 °C Full Vacuum to 3.5 Kg/cm²",
};

const PROSE_PAGE = {
  filename: "User Requirement Specification.PDF",
  pageNumber: 8,
  quote:
    "Vacuum gauge to measure the vacuum produced. Range 0 to 760 mmHg. URS-36 Pressure Gauge for the shell.",
};

describe("identityFromUrsQuotes", () => {
  it("copies the column-major gap label for Parameters", () => {
    const row = identityFromUrsQuotes({
      ursId: "URS-2",
      pages: [COLUMN_PAGE],
    });
    expect(row).toMatchObject({
      ursId: "URS-2",
      parameters: "MOC",
      userRequirement: "MOC",
      citation: `[${COLUMN_PAGE.filename}, p. 6]`,
    });
  });

  it("copies the prose window remainder", () => {
    const row = identityFromUrsQuotes({
      ursId: "URS-36",
      pages: [PROSE_PAGE],
    });
    expect(row?.parameters).toContain("Pressure Gauge");
    expect(row?.userRequirement).toContain("Pressure Gauge");
  });

  it("returns null when no reviewed page names the ID", () => {
    expect(
      identityFromUrsQuotes({
        ursId: "URS-99",
        pages: [COLUMN_PAGE],
      })
    ).toBeNull();
  });
});

describe("identityRowsForChecklist", () => {
  it("enumerates every ID as a row or notFound", () => {
    const result = identityRowsForChecklist({
      ursIds: ["URS-2", "URS-36", "URS-99"],
      pages: [COLUMN_PAGE, PROSE_PAGE],
    });
    expect(result.rows.map((row) => row.ursId)).toEqual(["URS-2", "URS-36"]);
    expect(result.notFound).toEqual(["URS-99"]);
  });
});
