import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
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

    const controlText = richJsonToPlainText(imported.sections.control.narrative);
    expect(controlText).not.toContain("Control section covers the preventive actions");
    expect(controlText).not.toContain("Was the Preventive Action linked");
  });
});
