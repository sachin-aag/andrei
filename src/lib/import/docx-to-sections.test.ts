import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";

// Mock the vision-LLM extractor so DOCX import tests stay offline. The mock
// returns a deterministic LaTeX/MathML pair for any WMF/EMF input, simulating
// a successful Gemini call.
vi.mock("@/lib/import/extract-math-from-image", () => ({
  extractMathFromImage: vi.fn(async () => ({
    latex: "x^2 + y^2",
    mathml: "<math><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><msup><mi>y</mi><mn>2</mn></msup></mrow></math>",
  })),
}));

import {
  docxBufferToImportedReportContent,
  buildSectionsFromRaw,
  parseReportHeaderFromRaw,
  parseAnalyzeOtherToolsForTest,
  mammothMarkdownToImportPlain,
} from "@/lib/import/docx-to-sections";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { formatCalendarDate } from "@/lib/utils";

const fixturePath = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation  DEV-PK-25-002.docx"
);
const multiLineTableHeaderFixturePath = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation DEV-PR-24-016.docx"
);
const legacyEquationFixturePath = path.join(
  process.cwd(),
  "docs",
  "Draft Investigation (DEV-QC-26-001).docx"
);
const devPr25008FixturePath = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation DEV-PR-25-008.docx"
);
const devQc25002FixturePath = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation DEV-QC-25-002.docx"
);

function collectNodesByType(doc: JSONContent, type: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  function walk(node: JSONContent) {
    if (node.type === type) nodes.push(node);
    for (const child of node.content ?? []) walk(child);
  }
  walk(doc);
  return nodes;
}

describe("docx import", () => {
  it("normalizes mammoth data URI images before creating narrative text", () => {
    const markdown = [
      "Calculated the TOC of blank water as per formula.",
      "",
      "![](data:image/x-wmf;base64,AQIDBA==)",
    ].join("\n");

    expect(mammothMarkdownToImportPlain(markdown)).toBe(
      [
        "Calculated the TOC of blank water as per formula.",
        "",
        "[image]",
      ].join("\n")
    );
  });

  it("imports draft DEV-QC-26-001 with full improve and control checkpoint lists", async () => {
    if (!fs.existsSync(legacyEquationFixturePath)) return;

    const imported = await docxBufferToImportedReportContent(
      fs.readFileSync(legacyEquationFixturePath)
    );

    const improve = richJsonToPlainText(imported.sections.improve.correctiveActions);
    const control = richJsonToPlainText(imported.sections.control.preventiveActions);

    expect(improve).toMatch(
      /4\.\s*Are the identified corrective actions achievable/i
    );
    expect(improve).toContain("Corrective action assigned a unique number");
    expect(improve).toContain("DMAIC methodology");

    expect(control).toMatch(
      /12\.\s*Are the identified preventive actions achievable/i
    );
    expect(control).toContain("Preventive Action linked");
    expect(control).toContain("Procedure Error");

    const impact = richJsonToPlainText(imported.sections.analyze.impactAssessment);
    expect(impact).toContain("Performed the detail impact assessment");
    expect(impact).toContain("System:");
    expect(impact).toContain("Patient safety/Past Batches");
    expect(impact).not.toMatch(/^\/\s*Past\s+Batches/i);

    const sig = imported.sections.signature_approvals;
    expect(sig.table?.content?.[0]?.content).toHaveLength(5);
    const headerText = (sig.table?.content?.[0]?.content ?? [])
      .map((cell) => richJsonToPlainText({ type: "doc", content: cell.content ?? [] }))
      .join(" ");
    expect(headerText).toMatch(/Prepared By QC/i);
    expect(headerText).toMatch(/Approved By QA/i);
  });

  it("keeps red Refer Attachment I on the analyst workbench paragraph in DEV-QC-26-001", async () => {
    if (!fs.existsSync(legacyEquationFixturePath)) return;

    const imported = await docxBufferToImportedReportContent(
      fs.readFileSync(legacyEquationFixturePath)
    );

    const workbenchParas =
      imported.sections.measure.narrative.content?.filter((node) => {
        if (node.type !== "paragraph") return false;
        const plain = richJsonToPlainText({ type: "doc", content: [node] });
        return plain.includes("analyst workbench");
      }) ?? [];

    expect(workbenchParas).toHaveLength(1);

    const plain = richJsonToPlainText({
      type: "doc",
      content: [workbenchParas[0]!],
    });
    expect(plain).toContain("Refer Attachment I");

    const referNodes: JSONContent[] = [];
    function walk(node: JSONContent) {
      if (node.type === "text" && /Refer Attachment/.test(node.text ?? "")) {
        referNodes.push(node);
      }
      for (const child of node.content ?? []) walk(child);
    }
    walk(workbenchParas[0]!);
    expect(
      referNodes.some((n) =>
        n.marks?.some(
          (m) => m.type === "textStyle" && m.attrs?.color === "#ee0000"
        )
      )
    ).toBe(true);
  });

  it("preserves CPH subscript from DEV-QC-26-001 narratives", async () => {
    if (!fs.existsSync(legacyEquationFixturePath)) return;

    const imported = await docxBufferToImportedReportContent(
      fs.readFileSync(legacyEquationFixturePath)
    );

    function collectCphTextNodes(doc: JSONContent): JSONContent[] {
      const nodes: JSONContent[] = [];
      function walk(node: JSONContent) {
        if (node.type === "text" && node.text === "CPH") nodes.push(node);
        for (const child of node.content ?? []) walk(child);
      }
      walk(doc);
      return nodes;
    }

    const defineCph = collectCphTextNodes(imported.sections.define.narrative);
    expect(defineCph.some((n) => n.marks?.some((m) => m.type === "subscript"))).toBe(
      true
    );

    const measurePlain = richJsonToPlainText(imported.sections.measure.narrative);
    expect(measurePlain).toContain("TOC-L CPH");
  });

  it("imports legacy Equation Editor WMF previews as editable math nodes", async () => {
    if (!fs.existsSync(legacyEquationFixturePath)) return;

    const imported = await docxBufferToImportedReportContent(
      fs.readFileSync(legacyEquationFixturePath)
    );

    const mathNodes = collectNodesByType(imported.sections.measure.narrative, "mathInline");
    expect(mathNodes.length).toBeGreaterThan(0);
    expect(mathNodes[0]?.attrs?.mathml).toEqual(expect.stringContaining("<math"));
    expect(mathNodes[0]?.attrs?.latex).toEqual(expect.any(String));
    expect(mathNodes[0]?.attrs?.ommlDirty).toBe(true);

    // Legacy WMF previews must NOT survive as imageInline nodes anymore.
    const wmfImages = collectNodesByType(
      imported.sections.measure.narrative,
      "imageInline"
    ).filter((n) => /^data:image\/(x-)?wmf/i.test(String(n.attrs?.src ?? "")));
    expect(wmfImages).toHaveLength(0);

    expect(JSON.stringify(imported.sections.measure.narrative)).not.toContain("[image]");
  });

  it("imports DEV-PK-25-002 content with template guidance preserved in editable narratives", async () => {
    const imported = await docxBufferToImportedReportContent(fs.readFileSync(fixturePath));

    expect(imported.toolsUsed).toEqual({
      sixM: false,
      fiveWhy: true,
      brainstorming: false,
    });

    expect(formatCalendarDate(imported.header.date)).toBe("09/04/2026");
    expect(imported.header.deviationNo).toBe("DEV/PK/25/002");
    expect(imported.header.otherTools).toBe("Not applicable");
    expect(imported.sections.analyze.otherTools).toBe("Not Applicable");

    const defineText = richJsonToPlainText(imported.sections.define.narrative);
    expect(defineText).toContain("On 04/03/2026");
    expect(defineText).toContain("Clearly define what happens actually");

    const measureText = richJsonToPlainText(imported.sections.measure.narrative);
    expect(measureText).toContain("The Intermediate Walk-in Cold Room");
    expect(measureText).toMatch(/Does the summary provide relevant facts/i);

    const fiveWhy = imported.sections.analyze.fiveWhy;
    const fiveWhyText = richJsonToPlainText(fiveWhy.narrative);
    expect(fiveWhyText).toContain(
      "1. Why was the temperature data not recorded/captured"
    );
    expect(fiveWhyText).toContain("Ans. Communication failure occurred");
    expect(fiveWhyText).toContain("Based on the 5-Why analysis");
    expect(fiveWhyText).toContain("old version software was being used");
    expect(fiveWhy.conclusion).toBe("");

    const improveNarrPlain = richJsonToPlainText(imported.sections.improve.narrative);
    expect(improveNarrPlain).toBe("");
    const improveCorrective = richJsonToPlainText(imported.sections.improve.correctiveActions);
    expect(improveCorrective).toMatch(
      /Were specific corrective Actions identified|Improve section covers the corrective actions/i
    );
    expect(improveCorrective).toContain("Corrective Action:");
    expect(improveCorrective).toContain(
      "The non-conformance is related to temperature data"
    );
    expect(improveCorrective).toContain(
      "Work Order No. WO/PK/26-005"
    );
    expect(improveCorrective).toMatch(
      /1\.\s*Work Order No\.\s*WO\/PK\/26-005/
    );

    const controlPrev = richJsonToPlainText(imported.sections.control.preventiveActions);
    expect(controlPrev).toMatch(
      /Control section covers the preventive actions|Was the Preventive Action linked/i
    );
    expect(controlPrev).toContain("Preventive Action:");

    const rootCauseNarrative = richJsonToPlainText(imported.sections.analyze.rootCause.narrative);
    expect(rootCauseNarrative).toContain("Primary Root Cause Level 1");
    expect(rootCauseNarrative).toContain("Equipment / Instrument");
    expect(imported.sections.analyze.rootCause).not.toHaveProperty("primaryLevel1");

    const sig = imported.sections.signature_approvals;
    expect(sig.table?.type).toBe("table");
    expect(sig.table?.content?.[0]?.content?.length).toBe(8);
    expect(sig.headerRowXml).toMatch(/<w:tr\b/);
    expect(sig.dataRowXml).toMatch(/<w:tr\b/);
  });

  it("imports the full impact assessment block as one field", () => {
    const analyzeBody = [
      "Impact Assessment (System/ Document/ Product/ Equipment/Patient safety/Past batches):",
      "",
      "System: System impact text.",
      "",
      "Product: Product impact text.",
      "",
      "Instrument: Instrument impact text.",
      "",
      "Patient safety/Past Batches:",
      "",
      "Performed the detail impact assessment for patient safety and past batches.",
      "",
      "Improve:",
      "Improve section covers the corrective actions",
    ].join("\n");

    const raw = ["Define:", "Def", "Analyze:", analyzeBody].join("\n");
    const sections = buildSectionsFromRaw(raw);

    const impact = richJsonToPlainText(sections.analyze.impactAssessment);
    expect(impact).toContain("System impact text.");
    expect(impact).toContain("Product impact text.");
    expect(impact).toContain("Instrument impact text.");
    expect(impact).toContain("Performed the detail impact assessment");
    expect(impact).not.toMatch(/^\/\s*Past\s+Batches/i);
  });

  it("reads analyze other tools from the last duplicate label row", () => {
    const body = [
      "Brainstorming:",
      "Not Applicable",
      "Other Tool if Any:\tFirst row value",
      "Other Tool if Any:",
      "Second row value",
      "Investigation Outcome:",
      "Outcome text",
    ].join("\n");

    expect(parseAnalyzeOtherToolsForTest(body)).toBe("Second row value");
  });

  it("reads header metadata when values are on the line after the label", () => {
    const raw = [
      "Date:",
      "",
      "25/11/2025",
      "",
      "Deviation No.",
      "",
      "DEV/PR/25/008",
      "",
      "Investigation tool used: 6M  5 Why  Brainstorming",
      "",
      "Other Tools (If any):",
      "",
      "Fishbone diagram",
      "",
      "Define:",
      "Body text",
    ].join("\n");

    expect(parseReportHeaderFromRaw(raw)).toEqual({
      date: new Date(Date.UTC(2025, 10, 25)),
      deviationNo: "DEV/PR/25/008",
      otherTools: "Fishbone diagram",
    });
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

  it("keeps full improve/control checklists when action labels appear inside questions", () => {
    const improveQ3 =
      "3. Is the Corrective action assigned a unique number, responsible person and due date so it can be tracked?";
    const improveQ4 =
      "4. Are the identified corrective actions achievable based on the information provided?";
    const controlQ2 =
      "2. Is the Preventive Action linked the classification of the root cause and explanation given for how it will prevent occurrence?";
    const raw = [
      "4. Improve",
      "Improve section covers the corrective actions",
      "1. First corrective checkpoint?",
      "2. Second corrective checkpoint?",
      improveQ3,
      improveQ4,
      "",
      "Corrective Action:",
      "Corrective narrative paragraph.",
      "5. Control",
      "Control section covers the preventive actions",
      "1. First preventive checkpoint?",
      controlQ2,
      "12. Are the identified preventive actions achievable based on the information provided?",
      "",
      "Preventive Action:",
      "Preventive narrative paragraph.",
    ].join("\n");

    const sections = buildSectionsFromRaw(raw);
    const improve = richJsonToPlainText(sections.improve.correctiveActions);
    const control = richJsonToPlainText(sections.control.preventiveActions);

    expect(improve).toContain(improveQ3);
    expect(improve).toContain(improveQ4);
    expect(improve).toContain("Corrective narrative paragraph.");
    expect(control).toContain(controlQ2);
    expect(control).toContain(
      "Are the identified preventive actions achievable based on the information provided"
    );
    expect(control).toContain("Preventive narrative paragraph.");
  });

  it("keeps leading Measure criteria line in narrative", () => {
    const raw = [
      "1. Define",
      "Def body",
      "2. Measure",
      "1. Does the summary provide relevant facts and data/information that was reviewed including: environment, process/product history, personnel info (title and job title), controls/control limits, etc.",
      "Based on review of BMS audit trail and EMS trend logs, temperature remained within limits except the recorded gap on 12/05/2026.",
      "3. Analyze",
      "Ana body",
    ].join("\n");

    const sections = buildSectionsFromRaw(raw);
    const measureText = richJsonToPlainText(sections.measure.narrative);

    expect(measureText).toContain(
      "Does the summary provide relevant facts and data/information that was reviewed including"
    );
    expect(measureText).toContain(
      "Based on review of BMS audit trail and EMS trend logs, temperature remained within limits"
    );
  });

  it("imports DEV-PR-25-008 measure tables without leaving flattened calibration rows", async () => {
    if (!fs.existsSync(devPr25008FixturePath)) return;

    const imported = await docxBufferToImportedReportContent(
      fs.readFileSync(devPr25008FixturePath)
    );
    const measureContent = imported.sections.measure.narrative.content ?? [];
    const tableNodes = measureContent.filter((node) => node.type === "table");
    expect(tableNodes.length).toBeGreaterThanOrEqual(2);

    const flatParagraphs = measureContent
      .filter((node) => node.type === "paragraph")
      .map((node) => richJsonToPlainText(node).trim())
      .filter(Boolean);

    // Calibration parameter grid (Description / Unit / Value) must become a table, not flat lines.
    expect(flatParagraphs).not.toContain("Description");
    expect(flatParagraphs).not.toContain("Unit");
    expect(flatParagraphs.some((t) => /^Value$/i.test(t))).toBe(false);

    const joinedTables = tableNodes
      .map((tbl) => richJsonToPlainText({ type: "doc", content: [tbl] }))
      .join("\n");
    expect(joinedTables).toMatch(/Description/);
    expect(joinedTables).toMatch(/DF11|DF 32/);

    for (const tbl of tableNodes) {
      const row0 = tbl.content?.[0];
      expect(row0?.content?.length).toBeGreaterThan(0);
      for (const cell of row0?.content ?? []) {
        expect(cell.content?.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not leave flattened table text after tables with multi-line header cells", async () => {
    const imported = await docxBufferToImportedReportContent(
      fs.readFileSync(multiLineTableHeaderFixturePath)
    );
    const measureContent = imported.sections.measure.narrative.content ?? [];
    const firstTableIndex = measureContent.findIndex((node) => node.type === "table");

    expect(firstTableIndex).toBeGreaterThan(-1);

    const firstTextAfterTable = measureContent
      .slice(firstTableIndex + 1)
      .map((node) => richJsonToPlainText(node).trim())
      .find(Boolean);
    const nonTableParagraphs = measureContent
      .filter((node) => node.type !== "table")
      .map((node) => richJsonToPlainText(node).trim())
      .filter(Boolean);

    expect(firstTextAfterTable).not.toBe("Display Copy");
    expect(firstTextAfterTable).toContain("Based on above details");
    expect(nonTableParagraphs).not.toContain("Display Copy");
    expect(nonTableParagraphs).not.toContain(
      "Available/Not Available/ Not Applicable"
    );
  });

  it("preserves interview detail/signature tables without turning personal interview questions into a table", async () => {
    const imported = await docxBufferToImportedReportContent(
      fs.readFileSync(devQc25002FixturePath)
    );
    const fiveWhyContent = imported.sections.analyze.fiveWhy.narrative.content ?? [];
    const tableTexts = fiveWhyContent
      .filter((node) => node.type === "table")
      .map((table) => richJsonToPlainText({ type: "doc", content: [table] }));
    const personalInterviewTable = tableTexts.find((text) =>
      /Personal Interview/i.test(text)
    );

    expect(tableTexts.some((text) => text.includes("Pravin Kolkand"))).toBe(true);
    expect(tableTexts.some((text) => text.includes("Interview Person Details"))).toBe(
      true
    );
    expect(tableTexts.some((text) => text.includes("Sign/Date | NA"))).toBe(true);
    expect(personalInterviewTable).toBeUndefined();
    expect(richJsonToPlainText(imported.sections.analyze.fiveWhy.narrative)).toContain(
      "Personal Interview (If Applicable):"
    );
  });

});
