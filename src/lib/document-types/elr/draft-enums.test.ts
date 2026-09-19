import { describe, expect, it } from "vitest";
import { coerceElrEnumDraft } from "./draft-enums";

describe("coerceElrEnumDraft", () => {
  it("maps risk-grade labels onto low|medium|high", () => {
    expect(
      coerceElrEnumDraft("elr_risk_actions", "overallGrade", "Low")
    ).toEqual({ ok: true, value: "low" });
    expect(
      coerceElrEnumDraft("elr_risk_actions", "overallGrade", "Medium risk")
    ).toEqual({ ok: true, value: "medium" });
    expect(
      coerceElrEnumDraft("elr_risk_actions", "overallGrade", "HIGH")
    ).toEqual({ ok: true, value: "high" });
  });

  it("maps conclusion recommendation labels onto the stored enum", () => {
    expect(
      coerceElrEnumDraft(
        "elr_conclusion",
        "recommendation",
        "Continue Routine Manufacturing"
      )
    ).toEqual({ ok: true, value: "continue" });
    expect(
      coerceElrEnumDraft(
        "elr_conclusion",
        "recommendation",
        "Early re-qualification required"
      )
    ).toEqual({ ok: true, value: "early_requalification" });
    expect(
      coerceElrEnumDraft("elr_conclusion", "recommendation", "CAPA required")
    ).toEqual({ ok: true, value: "capa" });
  });

  it("rejects free text that is not an alias", () => {
    expect(
      coerceElrEnumDraft(
        "elr_conclusion",
        "recommendation",
        "Remain in qualified state; no further action this cycle."
      )
    ).toMatchObject({ ok: false });
    expect(
      coerceElrEnumDraft("elr_risk_actions", "overallGrade", "moderate")
    ).toMatchObject({ ok: false });
  });

  it("ignores fields that are not ELR enums", () => {
    expect(coerceElrEnumDraft("elr_conclusion", "narrative", "Low")).toBeNull();
    expect(
      coerceElrEnumDraft("define", "narrative", "Continue routine use")
    ).toBeNull();
  });
});
