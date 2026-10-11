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

  it("classifies SSR / stainless steel reactor as reactor, not Other", () => {
    expect(
      classifyCvpEquipmentType("15.2 Stainless Steel Reactor (SSR-1302)")
    ).toBe("reactor");
    expect(classifyCvpEquipmentType("SSR-1303")).toBe("reactor");
    expect(cvpHasShellWallCalc("reactor")).toBe(true);
  });

  it("leaves leaf filter as other so it does not get a typed 15.N.4 table", () => {
    expect(classifyCvpEquipmentType("15.5 Leaf Filter (LF-1301)")).toBe("other");
    expect(classifyCvpEquipmentType("ANFD-1301")).toBe("other");
    expect(classifyCvpEquipmentType("MLT-1301")).toBe("other");
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
