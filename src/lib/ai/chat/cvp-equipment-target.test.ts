import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { cvpEquipmentSamplingSeed } from "@/lib/document-types/cvp/sections";
import {
  cvpEquipmentItemIndexFromTarget,
  insertBlankCvpEquipmentItem,
} from "@/lib/document-types/cvp/equipment-sampling";
import {
  bindCvpEquipmentWrite,
  routeCvpEquipmentWriteField,
} from "@/lib/ai/chat/cvp-equipment-target";
import { fieldFillState, sectionFillState } from "@/lib/ai/chat/fields";

function withFilledNote(doc: JSONContent): JSONContent {
  return {
    ...doc,
    content: [
      ...(doc.content ?? []),
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Equipment identity filled from IQ report for MV-1304 mixed vessel.",
          },
        ],
      },
    ],
  };
}

describe("cvpEquipmentItemIndexFromTarget", () => {
  it("maps items.N and 15.N onto the same 0-based index", () => {
    expect(cvpEquipmentItemIndexFromTarget("items.0")).toBe(0);
    expect(cvpEquipmentItemIndexFromTarget("items.1")).toBe(1);
    expect(cvpEquipmentItemIndexFromTarget("15.2")).toBe(1);
    expect(cvpEquipmentItemIndexFromTarget("15.2 MIXED VESSEL (MV-1305)")).toBe(
      1
    );
    expect(cvpEquipmentItemIndexFromTarget("15.2.3")).toBe(1);
    expect(cvpEquipmentItemIndexFromTarget("narrative")).toBeNull();
  });
});

describe("routeCvpEquipmentWriteField", () => {
  it("writes generic targets into an existing empty 15.2 box", () => {
    const content = {
      items: insertBlankCvpEquipmentItem([withFilledNote(cvpEquipmentSamplingSeed(1))], 0),
    };
    expect(fieldFillState(content, "cvp_equipment_sampling", "items.0")).not.toBe(
      "empty"
    );
    expect(fieldFillState(content, "cvp_equipment_sampling", "items.1")).toBe(
      "empty"
    );

    const routed = routeCvpEquipmentWriteField({
      requestedField: "narrative",
      resolvedField: "items.0",
      content,
    });
    expect(routed.targetField).toBe("items.1");
    expect(routed.content.items).toHaveLength(2);
  });

  it("appends a 15.2 seed when 15.1 is filled and no empty box exists", () => {
    const content = { items: [withFilledNote(cvpEquipmentSamplingSeed(1))] };
    const routed = routeCvpEquipmentWriteField({
      requestedField: "table",
      resolvedField: "items.0",
      content,
    });
    expect(routed.targetField).toBe("items.1");
    expect(routed.content.items).toHaveLength(2);
    expect(fieldFillState(routed.content, "cvp_equipment_sampling", "items.1")).toBe(
      "empty"
    );
  });

  it("keeps an explicit items.0 write on 15.1", () => {
    const content = {
      items: insertBlankCvpEquipmentItem([withFilledNote(cvpEquipmentSamplingSeed(1))], 0),
    };
    const routed = routeCvpEquipmentWriteField({
      requestedField: "items.0",
      resolvedField: "items.0",
      content,
    });
    expect(routed.targetField).toBe("items.0");
  });

  it("honors a tagged 15.2 box over the first empty item", () => {
    const content = {
      items: insertBlankCvpEquipmentItem([cvpEquipmentSamplingSeed(1)], 0),
    };
    const tagged = bindCvpEquipmentWrite(
      "cvp_equipment_sampling",
      "narrative",
      "items.0",
      content,
      { taggedItemField: "items.1" }
    );
    expect(tagged.targetField).toBe("items.1");
  });

  it("creates items.1 when asked for 15.2 and only 15.1 exists", () => {
    const content = { items: [withFilledNote(cvpEquipmentSamplingSeed(1))] };
    const routed = routeCvpEquipmentWriteField({
      requestedField: "15.2",
      resolvedField: "items.1",
      content,
    });
    expect(routed.targetField).toBe("items.1");
    expect(routed.content.items).toHaveLength(2);
  });
});

describe("cvp_equipment_sampling sectionFillState", () => {
  it("stays partial while a later empty 15.N box exists", () => {
    const content = {
      items: insertBlankCvpEquipmentItem([withFilledNote(cvpEquipmentSamplingSeed(1))], 0),
    };
    expect(sectionFillState(content, "cvp_equipment_sampling")).toBe("partial");
  });

  it("treats a lone unused seed as empty", () => {
    const content = { items: [cvpEquipmentSamplingSeed(1)] };
    expect(fieldFillState(content, "cvp_equipment_sampling", "items.0")).toBe(
      "empty"
    );
    expect(sectionFillState(content, "cvp_equipment_sampling")).toBe("empty");
  });
});
