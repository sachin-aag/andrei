import { describe, expect, it } from "vitest";
import {
  classifyCvpEquipmentType,
  cvpHasRefluxSampleRow,
  cvpHasShellWallCalc,
  cvpResidueHeadingTitle,
  cvpResidueSampleRows,
} from "./equipment-types";

describe("CVP equipment type recipes", () => {
  it("classifies RCVD as rvd without printing that label", () => {
    expect(classifyCvpEquipmentType("15.4 Roto Cone Vacuum Drier (RCVD-1201)")).toBe(
      "rvd"
    );
    expect(classifyCvpEquipmentType("RVD-1201")).toBe("rvd");
  });

  it("gives sparkler the reflux title without a reflux sample row", () => {
    expect(cvpResidueHeadingTitle("sparkler", 2)).toContain("Reflux, Swab & Rinse");
    expect(cvpHasRefluxSampleRow("sparkler")).toBe(false);
    expect(cvpHasShellWallCalc("sparkler")).toBe(false);
    expect(
      cvpResidueSampleRows("sparkler").some((row) => /reflux/i.test(row[0] ?? ""))
    ).toBe(false);
  });

  it("keeps reflux rows on reactors only", () => {
    expect(cvpHasRefluxSampleRow("reactor")).toBe(true);
    expect(cvpHasShellWallCalc("reactor")).toBe(true);
    expect(cvpResidueSampleRows("reactor")[0]?.[0]).toMatch(/Reflux/i);
  });

  it("gives the centrifuge a second MLT rinse row", () => {
    const rows = cvpResidueSampleRows("centrifuge");
    expect(rows.some((row) => /MLT/i.test(row[0] ?? ""))).toBe(true);
    expect(rows.some((row) => /\bCF\b/i.test(row[0] ?? ""))).toBe(true);
  });
});
