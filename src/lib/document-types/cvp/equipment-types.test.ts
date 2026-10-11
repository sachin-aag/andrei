import { describe, expect, it } from "vitest";
import {
  classifyCvpEquipmentType,
  cvpHasRefluxSampleRow,
  cvpHasShellWallCalc,
  cvpResidueHeadingTitle,
  cvpResidueSampleRows,
  cvpSwabLocations,
  cvpSwabRationaleRows,
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

  it("classifies Stage-4 specialty equipment from the protocol", () => {
    expect(classifyCvpEquipmentType("15.1 Mixed Vessel (MV-1304)")).toBe(
      "vessel"
    );
    expect(classifyCvpEquipmentType("15.3 Plug Flow Reactor (PFR-1301)")).toBe(
      "pfr"
    );
    expect(
      classifyCvpEquipmentType("15.8 Agitated Nutsche Filter (ANF-1301)")
    ).toBe("anf");
    expect(
      classifyCvpEquipmentType(
        "15.10 Agitated Nutsche Filter Cum Drier (ANFD-1301)"
      )
    ).toBe("anfd");
    expect(classifyCvpEquipmentType("15.5 Leaf Filter (LF-1301)")).toBe(
      "leaf_filter"
    );
    expect(classifyCvpEquipmentType("MLT-1301")).toBe("other");
    expect(cvpHasShellWallCalc("vessel")).toBe(true);
    expect(cvpHasShellWallCalc("anf")).toBe(false);
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

  it("seeds named swab location rows on the reactor residue table", () => {
    const rows = cvpResidueSampleRows("reactor");
    expect(rows.some((row) => row[0] === "Reactor top dish near manhole")).toBe(
      true
    );
    expect(rows.some((row) => row[0] === "Bottom discharge valve")).toBe(true);
    expect(rows.some((row) => row[1] === "S-1")).toBe(true);
    expect(rows.some((row) => row[1] === "S-4a")).toBe(true);
    expect(rows.filter((row) => row[2] === "NMT 2 ppm").length).toBeGreaterThanOrEqual(
      7
    );
  });

  it("seeds report swab IDs and descriptions for shared equipment types", () => {
    const sparkler = cvpSwabLocations("sparkler");
    expect(sparkler.map((row) => row.id)).toEqual([
      "S-1",
      "S-2",
      "S-3",
      "S-4a",
      "S-4b",
    ]);
    expect(sparkler[0]?.description).toBe(
      "Sparkler filter bottom inner side surface"
    );
    expect(cvpSwabRationaleRows("sparkler").some((row) => row.id === "S-4a & S-4b")).toBe(
      true
    );
    expect(cvpSwabLocations("centrifuge").some((row) => row.id === "S-4")).toBe(
      true
    );
    expect(cvpSwabLocations("rvd")[0]?.description).toMatch(/^RVD inner wall/);
    expect(cvpSwabLocations("pfr")).toEqual([]);
    expect(cvpSwabLocations("leaf_filter")[0]?.id).toBe("S-1");
    expect(cvpResidueSampleRows("rvd")[0]?.[0]).toMatch(/Heated acetone/i);
  });

  it("gives the centrifuge a second MLT rinse row", () => {
    const rows = cvpResidueSampleRows("centrifuge");
    expect(rows.some((row) => /MLT/i.test(row[0] ?? ""))).toBe(true);
    expect(rows.some((row) => /\bCF\b/i.test(row[0] ?? ""))).toBe(true);
  });
});
