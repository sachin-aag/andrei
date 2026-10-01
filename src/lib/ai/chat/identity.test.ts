import { describe, expect, it } from "vitest";
import { getCustomerPack } from "@/lib/customers/packs";
import {
  CHAT_IDENTITY_SECTION,
  allIdentityMetadataKeys,
  buildIdentityUpdate,
  chatIdentityFields,
  hasChatIdentity,
  identityNeedsDraft,
  identityRemainingRequired,
  identitySnapshotFields,
  readIdentityValue,
  attachIdentityCapacityUnits,
  sanitizeIdentityScalar,
} from "./identity";

const emptyQsr = {
  documentNo: "",
  date: "2026-01-01",
  metadata: {},
};

describe("hasChatIdentity", () => {
  it("is on for QSR, FIR, ELR, QRA, and demo DV", () => {
    expect(hasChatIdentity("qualification_summary_report")).toBe(true);
    expect(hasChatIdentity("failure_investigation_report")).toBe(true);
    expect(hasChatIdentity("equipment_lifecycle_report")).toBe(true);
    expect(hasChatIdentity("quality_risk_assessment")).toBe(true);
    expect(hasChatIdentity("design_verification")).toBe(
      getCustomerPack().id === "demo"
    );
  });

  it("marks QSR capacity as keepUnits", () => {
    expect(
      chatIdentityFields("qualification_summary_report").find(
        (field) => field.key === "capacity"
      )?.keepUnits
    ).toBe(true);
  });

  it("is off for investigation, Convergent mechanical, VQ, and generic", () => {
    expect(hasChatIdentity("investigation_report")).toBe(false);
    expect(hasChatIdentity("mechanical_design_verification")).toBe(false);
    expect(hasChatIdentity("vendor_qualification")).toBe(false);
    expect(hasChatIdentity("generic_document")).toBe(false);
  });
});

describe("identityNeedsDraft", () => {
  it("is true while any required QSR scalar is blank", () => {
    expect(identityNeedsDraft("qualification_summary_report", emptyQsr)).toBe(
      true
    );
    expect(
      identityRemainingRequired("qualification_summary_report", emptyQsr)
    ).toEqual(
      expect.arrayContaining([
        "documentNo",
        "equipmentName",
        "equipmentCode",
        "capacity",
        "plantSection",
      ])
    );
  });

  it("treats a create-preload document number as unset", () => {
    expect(
      identityNeedsDraft("qualification_summary_report", {
        documentNo: "__preload_abc",
        date: "2026-01-01",
        metadata: {
          equipmentName: "Glass Lined Reactor",
          equipmentCode: "GLR-1301",
          capacity: "8 KL",
          plantSection: "Production Block-2",
        },
      })
    ).toBe(true);
  });

  it("is complete when required QSR fields are set even if revision is blank", () => {
    const filled = {
      documentNo: "QSR/GLR-1301",
      date: "2026-01-01",
      metadata: {
        equipmentName: "Glass Lined Reactor",
        equipmentCode: "GLR-1301",
        capacity: "8 KL",
        plantSection: "Production Block-2",
      },
    };
    expect(identityNeedsDraft("qualification_summary_report", filled)).toBe(
      false
    );
    expect(identityRemainingRequired("qualification_summary_report", filled)).toEqual(
      []
    );
  });

  it("treats FIR date as empty unless dateOfNonConformance is set", () => {
    expect(
      identityNeedsDraft("failure_investigation_report", {
        documentNo: "ERF/26/022",
        date: "2026-01-15",
        metadata: {
          sourceDocumentNo: "ERF/26/022",
          productName: "r-Insulin Glargine",
          batchNo: "RIG25014",
        },
      })
    ).toBe(true);
    expect(
      readIdentityValue(
        chatIdentityFields("failure_investigation_report").find(
          (field) => field.key === "date"
        )!,
        {
          documentNo: "ERF/26/022",
          date: "2026-01-15",
          metadata: { dateOfNonConformance: "2026-01-15" },
        }
      )
    ).toBe("2026-01-15");
  });
});

describe("buildIdentityUpdate", () => {
  it("writes QSR equipment scalars onto metadata and documentNo", () => {
    const update = buildIdentityUpdate({
      documentType: "qualification_summary_report",
      current: emptyQsr,
      fields: [
        { key: "documentNo", value: "QSR/GLR-1301" },
        { key: "equipmentName", value: "Glass Lined Reactor" },
        { key: "equipmentCode", value: "GLR-1301" },
        { key: "capacity", value: "8 KL" },
        { key: "plantSection", value: "Production Block-2" },
        { key: "revision", value: "00" },
      ],
    });
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.documentNo).toBe("QSR/GLR-1301");
    expect(update.metadata).toMatchObject({
      equipmentName: "Glass Lined Reactor",
      equipmentCode: "GLR-1301",
      capacity: "8 KL",
      plantSection: "Production Block-2",
      revision: "00",
    });
    expect(update.applied).toContain("equipmentName");
  });

  it("mirrors FIR documentNo onto sourceDocumentNo", () => {
    const update = buildIdentityUpdate({
      documentType: "failure_investigation_report",
      current: { documentNo: "", date: "2026-01-01", metadata: {} },
      fields: [{ key: "documentNo", value: "ERF/26/022" }],
    });
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.documentNo).toBe("ERF/26/022");
    expect(update.metadata).toMatchObject({ sourceDocumentNo: "ERF/26/022" });
  });

  it("keeps ELR period dates as written free text", () => {
    const update = buildIdentityUpdate({
      documentType: "equipment_lifecycle_report",
      current: { documentNo: "ELR-25-001", date: "2026-01-01", metadata: {} },
      fields: [
        { key: "periodFrom", value: "01-Apr-2025" },
        { key: "periodTo", value: "31-Mar-2026" },
        { key: "nextPrqDate", value: "01-Apr-2026" },
      ],
    });
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.metadata).toMatchObject({
      periodFrom: "01-Apr-2025",
      periodTo: "31-Mar-2026",
      nextPrqDate: "01-Apr-2026",
    });
  });

  it("parses FIR month-name dates onto reports.date", () => {
    const update = buildIdentityUpdate({
      documentType: "failure_investigation_report",
      current: { documentNo: "ERF/26/022", date: "2026-01-01", metadata: {} },
      fields: [{ key: "date", value: "15-Jan-2026" }],
    });
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.date?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(update.metadata).toMatchObject({
      dateOfNonConformance: "2026-01-15",
    });
  });

  it("rejects unknown keys", () => {
    const update = buildIdentityUpdate({
      documentType: "qualification_summary_report",
      current: emptyQsr,
      fields: [{ key: "narrative", value: "nope" }],
    });
    expect(update).toMatchObject({ ok: false, status: "unknown_key" });
  });

  it("strips citation brackets from scalars", () => {
    expect(sanitizeIdentityScalar("GLR-1301 [1]")).toBe("GLR-1301");
    expect(
      sanitizeIdentityScalar(
        "Glass Lined Reactor [protocol.pdf, p. 1]\n\nCitations:\n1. [protocol.pdf, p. 1]"
      )
    ).toBe("Glass Lined Reactor");
    expect(sanitizeIdentityScalar("[protocol.pdf, p. 1]")).toBe("");
  });
});

describe("attachIdentityCapacityUnits", () => {
  const ursCover =
    "Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301 Page 1 of 12";
  const iqHeader =
    "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 1 of 60";

  it("copies L from a Capacity label next to the same figure", () => {
    expect(attachIdentityCapacityUnits("8000", [ursCover])).toBe("8000 L");
    expect(attachIdentityCapacityUnits("8000", [iqHeader])).toBe("8000 L");
  });

  it("keeps a unit the model already wrote", () => {
    expect(attachIdentityCapacityUnits("8000 L", [ursCover])).toBe("8000 L");
    expect(attachIdentityCapacityUnits("3.0 KL", ["Capacity 3.0 KL"])).toBe(
      "3.0 KL"
    );
  });

  it("copies KL from 3.0 KL as printed", () => {
    expect(attachIdentityCapacityUnits("3.0", ["Capacity / Size: 3.0 KL"])).toBe(
      "3.0 KL"
    );
  });

  it("does not steal a jacket volume with a different number", () => {
    expect(
      attachIdentityCapacityUnits("8000", [
        "Jacket volume 773 L",
        "Capacity 8000 L",
      ])
    ).toBe("8000 L");
  });

  it("does not convert 8000 L into 8 KL", () => {
    expect(attachIdentityCapacityUnits("8000", ["Working volume 8 KL"])).toBe(
      "8000"
    );
  });

  it("leaves a bare number when unlabeled units conflict", () => {
    expect(
      attachIdentityCapacityUnits("8000", ["volume 8000 L", "mass 8000 kg"])
    ).toBe("8000");
  });

  it("prefers a labeled Capacity/Size unit over an unlabeled conflict", () => {
    expect(
      attachIdentityCapacityUnits("8000", [
        "Capacity/Size 8000 L",
        "mass 8000 kg",
      ])
    ).toBe("8000 L");
  });

  it("matches comma-grouped source figures", () => {
    expect(attachIdentityCapacityUnits("8000", ["Capacity 8,000 L"])).toBe(
      "8000 L"
    );
  });

  it("accepts a missing space after the number", () => {
    expect(attachIdentityCapacityUnits("8000", ["Capacity 8000L"])).toBe(
      "8000 L"
    );
  });

  it("leaves non-numeric identity values alone", () => {
    expect(
      attachIdentityCapacityUnits("Glass Lined Reactor", [ursCover])
    ).toBe("Glass Lined Reactor");
  });

  it("leaves a bare number when quotes are empty", () => {
    expect(attachIdentityCapacityUnits("8000", [])).toBe("8000");
  });
});

describe("identitySnapshotFields", () => {
  it("uses the synthetic identity section key", () => {
    expect(CHAT_IDENTITY_SECTION).toBe("identity");
    const snapshot = identitySnapshotFields(
      "qualification_summary_report",
      emptyQsr
    );
    expect(snapshot.every((field) => field.isEmpty)).toBe(true);
    expect(snapshot.map((field) => field.targetField)).toContain("equipmentName");
  });
});

describe("allIdentityMetadataKeys", () => {
  it("includes QSR equipment keys used by citation exemption", () => {
    const keys = allIdentityMetadataKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        "equipmentName",
        "equipmentCode",
        "capacity",
        "plantSection",
        "formatScope",
        "batchNo",
      ])
    );
  });
});
