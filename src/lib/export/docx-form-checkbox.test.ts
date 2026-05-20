import { describe, expect, it } from "vitest";
import {
  applyInvestigationToolCheckboxes,
  formCheckboxFieldXml,
  INVESTIGATION_TOOL_CHECKBOX_NAMES,
} from "@/lib/export/docx-form-checkbox";
import PizZip from "pizzip";

describe("docx-form-checkbox", () => {
  it("emits FORMCHECKBOX field markup with default/checked state", () => {
    const unchecked = formCheckboxFieldXml(false, "toolSixM");
    expect(unchecked).toContain('w:val="toolSixM"');
    expect(unchecked).toContain("<w:default w:val=\"0\"/>");
    expect(unchecked).not.toContain("<w:checked");

    const checked = formCheckboxFieldXml(true, "toolFiveWhy");
    expect(checked).toContain("<w:default w:val=\"1\"/>");
    expect(checked).toContain("<w:checked w:val=\"1\"/>");
    expect(checked).toContain("FORMCHECKBOX");
  });

  it("updates named checkboxes in document.xml", () => {
    const para =
      `<w:p>${formCheckboxFieldXml(false, INVESTIGATION_TOOL_CHECKBOX_NAMES.sixM)}` +
      `<w:r><w:t>6M</w:t></w:r></w:p>`;
    const zip = new PizZip();
    zip.file("word/document.xml", `<w:document><w:body>${para}</w:body></w:document>`);

    applyInvestigationToolCheckboxes(zip, {
      sixM: true,
      fiveWhy: false,
      brainstorming: false,
    });

    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toContain("<w:checked w:val=\"1\"/>");
    expect(xml).toMatch(
      new RegExp(
        `<w:name w:val="${INVESTIGATION_TOOL_CHECKBOX_NAMES.sixM}"\\/>[\\s\\S]*<w:checked w:val="1"\\/>`
      )
    );
  });
});
