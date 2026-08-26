import { describe, expect, it } from "vitest";
import { DEMO_PACK, MJ_PACK } from "@/lib/customers/packs";
import {
  editorProfileFor,
  evaluationCapabilityFor,
  getDocumentType,
  isWordImportAvailable,
  suggestionApplyModeFor,
  workspacePresentationFor,
} from "@/lib/document-types";

describe("generic document type", () => {
  it("is a continuous body with no criteria and tracked-change apply", () => {
    const def = getDocumentType("generic_document");
    expect(def.sections.map((s) => s.key)).toEqual(["body"]);
    expect(evaluationCapabilityFor(def)).toEqual({ kind: "none" });
    expect(suggestionApplyModeFor(def)).toBe("tracked_change");
    expect(editorProfileFor(def)).toBe("generic_document");
    expect(workspacePresentationFor(def)).toEqual({
      kind: "continuous_document",
      outline: true,
    });
  });

  it("allows Word import on demo even though pack wordImportEnabled is off", () => {
    expect(isWordImportAvailable("generic_document", DEMO_PACK)).toBe(true);
    expect(isWordImportAvailable("investigation_report", DEMO_PACK)).toBe(false);
    expect(isWordImportAvailable("investigation_report", MJ_PACK)).toBe(true);
    expect(isWordImportAvailable("design_verification", DEMO_PACK)).toBe(false);
  });
});
