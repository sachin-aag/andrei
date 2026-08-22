import { describe, expect, it } from "vitest";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import {
  INSUFFICIENT_ANY_SECTION_MESSAGE,
  MISSING_COVER_DOCUMENT_NO_MESSAGE,
  insufficientSectionMessage,
  sectionsReadyForEvaluation,
} from "./evaluation-readiness";

function narrativeDoc(text: string) {
  return {
    narrative: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  };
}

describe("sectionsReadyForEvaluation", () => {
  it("lets a filled Convergent section run when Purpose is still empty", () => {
    const result = sectionsReadyForEvaluation({
      documentType: "design_verification",
      targets: ["purpose", "scope"],
      documentNo: "DV-1",
      contentFor: (section) =>
        section === "scope"
          ? narrativeDoc("In-scope functions include the laser control loop.")
          : { narrative: emptyDoc() },
    });

    expect(result.ready).toEqual(["scope"]);
    expect(result.error).toBeUndefined();
  });

  it("lets a filled Measure run when Define is still empty", () => {
    const result = sectionsReadyForEvaluation({
      documentType: "investigation_report",
      targets: ["define", "measure"],
      documentNo: "DEV-1",
      contentFor: (section) =>
        section === "measure"
          ? narrativeDoc("The deviation was observed during filling on line 2.")
          : { narrative: emptyDoc() },
    });

    expect(result.ready).toEqual(["measure"]);
    expect(result.error).toBeUndefined();
  });

  it("blocks a single empty target section", () => {
    const result = sectionsReadyForEvaluation({
      documentType: "investigation_report",
      targets: ["define"],
      documentNo: "DEV-1",
      contentFor: () => ({ narrative: emptyDoc() }),
    });

    expect(result.ready).toEqual([]);
    expect(result.error).toBe(insufficientSectionMessage("Define"));
  });

  it("treats one sentence as enough to run that section", () => {
    const result = sectionsReadyForEvaluation({
      documentType: "investigation_report",
      targets: ["define"],
      documentNo: "DEV-1",
      contentFor: () => narrativeDoc("The batch was rejected after visual inspection."),
    });

    expect(result.ready).toEqual(["define"]);
    expect(result.error).toBeUndefined();
  });

  it("does not require a cover-page document number to evaluate other DV sections", () => {
    const result = sectionsReadyForEvaluation({
      documentType: "design_verification",
      targets: ["cover_page", "purpose_scope"],
      documentNo: "",
      contentFor: (section) =>
        section === "purpose_scope"
          ? narrativeDoc("Verify Solea software item SI-12 against DI-4.")
          : {},
    });

    expect(result.ready).toEqual(["purpose_scope"]);
    expect(result.error).toBeUndefined();
  });

  it("requires a document number only when Cover Page is the sole target", () => {
    const result = sectionsReadyForEvaluation({
      documentType: "design_verification",
      targets: ["cover_page"],
      documentNo: "",
      contentFor: () => ({}),
    });

    expect(result.ready).toEqual([]);
    expect(result.error).toBe(MISSING_COVER_DOCUMENT_NO_MESSAGE);
  });

  it("asks to fill at least one section when a multi-section run has no content", () => {
    const result = sectionsReadyForEvaluation({
      documentType: "investigation_report",
      targets: ["define", "measure"],
      documentNo: "DEV-1",
      contentFor: () => ({ narrative: emptyDoc() }),
    });

    expect(result.ready).toEqual([]);
    expect(result.error).toBe(INSUFFICIENT_ANY_SECTION_MESSAGE);
  });
});
