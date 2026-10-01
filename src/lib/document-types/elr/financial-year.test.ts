import { describe, expect, it } from "vitest";
import {
  canonicalElrPeriod,
  ELR_FY_PERIOD_RULE,
  fyStartYearFromDocumentNumber,
  indianFyStartYearContaining,
  parseElrIdentityDate,
} from "./financial-year";

describe("parseElrIdentityDate", () => {
  it("reads ISO, numeric, and 01-Apr-2025 title-page forms", () => {
    expect(parseElrIdentityDate("2025-04-01")).toEqual({
      year: 2025,
      month: 4,
      day: 1,
    });
    expect(parseElrIdentityDate("01-Apr-2025")).toEqual({
      year: 2025,
      month: 4,
      day: 1,
    });
    expect(parseElrIdentityDate("31/03/2026")).toEqual({
      year: 2026,
      month: 3,
      day: 31,
    });
  });
});

describe("indianFyStartYearContaining", () => {
  it("starts 1 April and puts Jan–Mar in the prior FY", () => {
    expect(indianFyStartYearContaining(2025, 4)).toBe(2025);
    expect(indianFyStartYearContaining(2026, 3)).toBe(2025);
    expect(indianFyStartYearContaining(2025, 6)).toBe(2025);
  });
});

describe("canonicalElrPeriod", () => {
  it("keeps a title page that is already 1 April–31 March", () => {
    expect(
      canonicalElrPeriod({
        periodFrom: "01-Apr-2025",
        periodTo: "31-Mar-2026",
      })
    ).toEqual({
      startYear: 2025,
      fromLabel: "01-Apr-2025",
      toLabel: "31-Mar-2026",
    });
  });

  it("rewrites a Jun–Jul rolling window from periodFrom's FY", () => {
    expect(
      canonicalElrPeriod({
        periodFrom: "2024-06-29",
        periodTo: "2025-07-23",
      })
    ).toEqual({
      startYear: 2024,
      fromLabel: "01-Apr-2024",
      toLabel: "31-Mar-2025",
    });
  });

  it("does not copy a 3-month alarm-trend quarter", () => {
    expect(
      canonicalElrPeriod({
        periodFrom: "01/04/2025",
        periodTo: "30/06/2025",
      })
    ).toEqual({
      startYear: 2025,
      fromLabel: "01-Apr-2025",
      toLabel: "31-Mar-2026",
    });
  });

  it("falls back to last PRQ date then PRQR FY digits", () => {
    expect(
      canonicalElrPeriod({ lastPrqDate: "2025-07-23" })
    ).toEqual({
      startYear: 2025,
      fromLabel: "01-Apr-2025",
      toLabel: "31-Mar-2026",
    });
    expect(fyStartYearFromDocumentNumber("PRQR-25-PR-005")).toBe(2025);
    expect(
      canonicalElrPeriod({ lastPrqNo: "PRQR-25-PR-005" })
    ).toEqual({
      startYear: 2025,
      fromLabel: "01-Apr-2025",
      toLabel: "31-Mar-2026",
    });
  });
});

describe("ELR_FY_PERIOD_RULE", () => {
  it("names both 1 April and 31 March without a named-year label", () => {
    expect(ELR_FY_PERIOD_RULE).toContain("start 1 April");
    expect(ELR_FY_PERIOD_RULE).toContain("end 31 March of the following year");
    expect(ELR_FY_PERIOD_RULE).toContain("both calendar dates");
    expect(ELR_FY_PERIOD_RULE).not.toMatch(/Indian/i);
  });
});
