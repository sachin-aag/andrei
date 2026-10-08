import { describe, expect, it } from "vitest";
import {
  cvpEquipmentSubsectionOrdinal,
  repairCvpEquipmentProseEdit,
  stripCvpEquipmentProseTables,
} from "@/lib/ai/chat/cvp-equipment-prose-edit";
import { checkProposedEdit } from "@/lib/ai/chat/propose-edit";
import {
  CVP_EQUIPMENT_DETAILS_SEED,
  cvpEquipmentSamplingSeed,
} from "@/lib/document-types/cvp/sections";
import { flattenForAnchor } from "@/lib/suggestions/locator";

const DETAILS_PROSE =
  "The equipment details, including Material of Construction (MOC) and product contact surface area, were obtained from CPDR Annexure-2 and the applicable equipment qualification documents.";

const LEFTOVER_15_6_1_DUMP = [
  "### 15.6.1 Equipment details",
  DETAILS_PROSE,
  "Table 42. Equipment Details",
  "| Parameter | Details | Reference |",
  "| --- | --- | --- |",
  "| Capacity | 1k L (1,000 L) | CPDR Annexure-2 |",
  "| MOC | CS Halar | CPDR Annexure-2 |",
].join("\n");

describe("stripCvpEquipmentProseTables", () => {
  it("drops GFM grids and Table N captions, keeping the 15.N.1 paragraph", () => {
    const stripped = stripCvpEquipmentProseTables(LEFTOVER_15_6_1_DUMP);
    expect(stripped).toContain("15.6.1 Equipment details");
    expect(stripped).toContain(DETAILS_PROSE);
    expect(stripped).not.toContain("| Capacity |");
    expect(stripped).not.toContain("Table 42.");
  });
});

describe("cvpEquipmentSubsectionOrdinal", () => {
  it("reads 15.6.1 from leftover insert wording", () => {
    expect(cvpEquipmentSubsectionOrdinal("go for 15.6.1")).toBe("15.6.1");
    expect(cvpEquipmentSubsectionOrdinal(LEFTOVER_15_6_1_DUMP)).toBe("15.6.1");
    expect(cvpEquipmentSubsectionOrdinal("make 15.6 as mlt")).toBeNull();
  });
});

describe("repairCvpEquipmentProseEdit", () => {
  it("retargets a 15.6.1 dump that includes Table 42 onto the details paragraph", () => {
    const fieldDoc = cvpEquipmentSamplingSeed(6);
    const fieldText = flattenForAnchor(fieldDoc).text;
    const repaired = repairCvpEquipmentProseEdit({
      fieldDoc,
      fieldText,
      edit: {
        anchorText: "",
        deleteText: "",
        insertText: LEFTOVER_15_6_1_DUMP,
      },
    });
    expect(repaired).not.toBeNull();
    expect(repaired?.deleteText).toBe(CVP_EQUIPMENT_DETAILS_SEED);
    expect(repaired?.insertText).toBe(DETAILS_PROSE);
    expect(repaired?.insertText).not.toContain("|");
    expect(
      checkProposedEdit(fieldText, repaired!, fieldDoc).status
    ).toBe("ok");
  });

  it("inserts 15.N.5 results prose under the seeded heading that has no paragraph", () => {
    const fieldDoc = cvpEquipmentSamplingSeed(6);
    const fieldText = flattenForAnchor(fieldDoc).text;
    const results =
      "Upon completion of cleaning, the ML tank (MLT-1303) shall undergo visual inspection under qualified illumination conditions.";
    const repaired = repairCvpEquipmentProseEdit({
      fieldDoc,
      fieldText,
      edit: {
        anchorText: "does not exist in the field",
        deleteText: "does not exist in the field",
        insertText: `### 15.6.5 Cleaning validation results summary\n\n${results}`,
      },
    });
    expect(repaired?.anchorText).toBe(
      "15.6.5 Cleaning validation results summary"
    );
    expect(repaired?.insertText).toContain(results);
    expect(
      checkProposedEdit(fieldText, repaired!, fieldDoc).status
    ).toBe("ok");
  });

  it("adds a missing 15.N.3 heading before the seeded 15.N.5 heading", () => {
    const fieldDoc = cvpEquipmentSamplingSeed(6);
    const fieldText = flattenForAnchor(fieldDoc).text;
    const repaired = repairCvpEquipmentProseEdit({
      fieldDoc,
      fieldText,
      edit: {
        anchorText: "",
        deleteText: "",
        insertText: [
          "### 15.6.3 Swab locations",
          "S-1: ML tank top dish / inlet nozzle",
        ].join("\n\n"),
      },
    });
    expect(repaired?.deleteText).toBe(
      "15.6.5 Cleaning validation results summary"
    );
    expect(repaired?.insertText).toContain("15.6.3 Swab locations");
    expect(repaired?.insertText).toContain(
      "15.6.5 Cleaning validation results summary"
    );
    expect(
      checkProposedEdit(fieldText, repaired!, fieldDoc).status
    ).toBe("ok");
  });

  it("retargets an empty-anchor 15.6.1 paragraph instead of appending at the end", () => {
    const fieldDoc = cvpEquipmentSamplingSeed(6);
    const fieldText = flattenForAnchor(fieldDoc).text;
    const repaired = repairCvpEquipmentProseEdit({
      fieldDoc,
      fieldText,
      edit: {
        anchorText: "",
        deleteText: "",
        insertText: `### 15.6.1 Equipment details\n\n${DETAILS_PROSE}`,
      },
    });
    expect(repaired?.deleteText).toBe(CVP_EQUIPMENT_DETAILS_SEED);
    expect(repaired?.insertText).toBe(DETAILS_PROSE);
    expect(
      checkProposedEdit(fieldText, repaired!, fieldDoc).status
    ).toBe("ok");
  });

  it("does not rewrite a locatable prose edit that already has no table", () => {
    const fieldDoc = cvpEquipmentSamplingSeed(6);
    const fieldText = flattenForAnchor(fieldDoc).text;
    const edit = {
      anchorText: CVP_EQUIPMENT_DETAILS_SEED,
      deleteText: "shall be taken from",
      insertText: "were obtained from",
    };
    expect(repairCvpEquipmentProseEdit({ fieldDoc, fieldText, edit })).toBeNull();
  });

  it("does not insert a 15.1.6 heading into a 15.2 box", () => {
    const fieldDoc = cvpEquipmentSamplingSeed(2);
    const fieldText = flattenForAnchor(fieldDoc).text;
    const repaired = repairCvpEquipmentProseEdit({
      fieldDoc,
      fieldText,
      edit: {
        anchorText:
          "15.1.6 Visual inspection summary\nVisual inspection shall be performed independently by the Production Chemist, Production Shift In-charge, and QA Executive under qualified light intensity (NLT 500 Lux).",
        deleteText: "under qualified light intensity (NLT 500 Lux)",
        insertText: "under qualified illumination conditions",
      },
    });
    expect(repaired).toBeNull();
    expect(fieldText).toContain("15.2.1 Equipment details");
    expect(fieldText).not.toContain("15.1.6");
  });
});
