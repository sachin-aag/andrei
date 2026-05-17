import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { docxBufferToImportedReportContent, buildSectionsFromRaw } from "@/lib/import/docx-to-sections";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

const fixturePath = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation  DEV-PK-25-002.docx"
);

describe("docx import", () => {
  it("imports DEV-PK-25-002 content without template guidance in editable narratives", async () => {
    const imported = await docxBufferToImportedReportContent(fs.readFileSync(fixturePath));

    expect(imported.toolsUsed).toEqual({
      sixM: false,
      fiveWhy: true,
      brainstorming: false,
    });

    const defineText = richJsonToPlainText(imported.sections.define.narrative);
    expect(defineText).toContain("On 04/03/2026");
    expect(defineText).not.toContain("Clearly define what happens actually");

    const measureText = richJsonToPlainText(imported.sections.measure.narrative);
    expect(measureText).toContain("The Intermediate Walk-in Cold Room");
    expect(measureText).not.toContain("Does the summary provide relevant facts");

    const fiveWhy = imported.sections.analyze.fiveWhy;
    expect(fiveWhy.narrative).toContain(
      "1. Why was the temperature data not recorded/captured"
    );
    expect(fiveWhy.narrative).toContain("Ans. Communication failure occurred");
    expect(fiveWhy.conclusion).toContain("Based on the 5-Why analysis");
    expect(fiveWhy.conclusion).toContain("old version software was being used");

    const improveNarrPlain = richJsonToPlainText(imported.sections.improve.narrative);
    expect(improveNarrPlain).toBe("");
    expect(imported.sections.improve.correctiveActions).not.toContain(
      "Improve section covers the corrective actions"
    );
    expect(imported.sections.improve.correctiveActions).not.toContain(
      "Were specific corrective Actions identified"
    );
    expect(imported.sections.improve.correctiveActions).not.toContain(
      "Was Effectiveness Verification required"
    );
    expect(imported.sections.improve.correctiveActions).toContain(
      "The non-conformance is related to temperature data"
    );
    expect(imported.sections.improve.correctiveActions).toContain(
      "Work Order No. WO/PK/26-005"
    );
    expect(imported.sections.improve.correctiveActions).toMatch(
      /1\.\s*Work Order No\.\s*WO\/PK\/26-005/
    );

    const controlPrev = imported.sections.control.preventiveActions;
    expect(controlPrev).not.toContain("Control section covers the preventive actions");
    expect(controlPrev).not.toContain("Was the Preventive Action linked");
  });

  it("maps Documents Reviewed and List of attachment blocks into structured items", () => {
    const raw = [
      "1. Define",
      "Def body",
      "2. Measure",
      "Mea body",
      "3. Analyze",
      "Ana body",
      "4. Improve",
      "Imp body",
      "5. Control",
      "Prev body",
      "6. Documents Reviewed:",
      "1. First SOP",
      "2. Second SOP",
      "7. List of attachment (If applicable):",
      "Attachment No. I: Photocopy",
      "Attachment No. II: Audit Trail",
    ].join("\n");

    const sections = buildSectionsFromRaw(raw);
    expect(sections.documents_reviewed.items).toEqual(["First SOP", "Second SOP"]);
    expect(sections.attachments.items).toEqual([
      { label: "Attachment No. I", description: "Photocopy" },
      { label: "Attachment No. II", description: "Audit Trail" },
    ]);
  });
});
