import type PizZip from "pizzip";

const RUN_PR = "<w:rPr><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/></w:rPr>";

/** Word legacy form checkbox (FORMCHECKBOX) — matches reference-template.docx styling. */
export function formCheckboxFieldXml(checked: boolean, fieldName: string): string {
  const defaultVal = checked ? "1" : "0";
  const checkedTag = checked ? "<w:checked w:val=\"1\"/>" : "";
  const checkBoxInner = `<w:sizeAuto/><w:default w:val="${defaultVal}"/>${checkedTag}`;

  return (
    `<w:r>${RUN_PR}<w:fldChar w:fldCharType="begin"><w:ffData>` +
    `<w:name w:val="${fieldName}"/><w:enabled/><w:calcOnExit w:val="0"/>` +
    `<w:checkBox>${checkBoxInner}</w:checkBox></w:ffData></w:fldChar></w:r>` +
    `<w:r>${RUN_PR}<w:instrText xml:space="preserve"> FORMCHECKBOX </w:instrText></w:r>` +
    `<w:r>${RUN_PR}</w:r>` +
    `<w:r>${RUN_PR}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${RUN_PR}<w:fldChar w:fldCharType="end"/></w:r>`
  );
}

export const INVESTIGATION_TOOL_CHECKBOX_NAMES = {
  sixM: "toolSixM",
  fiveWhy: "toolFiveWhy",
  brainstorming: "toolBrainstorming",
} as const;

function setNamedCheckbox(xml: string, fieldName: string, checked: boolean): string {
  const re = new RegExp(
    `(<w:name w:val="${fieldName}"\\/>[\\s\\S]*?<w:checkBox>)([\\s\\S]*?)(<\\/w:checkBox>)`
  );
  const inner = checked
    ? "<w:sizeAuto/><w:default w:val=\"1\"/><w:checked w:val=\"1\"/>"
    : "<w:sizeAuto/><w:default w:val=\"0\"/>";

  return xml.replace(re, `$1${inner}$3`);
}

/** Apply checked state to investigation-tool form fields after docxtemplater render. */
export function applyInvestigationToolCheckboxes(
  zip: PizZip,
  tools: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean }
): void {
  const file = zip.file("word/document.xml");
  if (!file) return;

  let xml = file.asText();
  xml = setNamedCheckbox(xml, INVESTIGATION_TOOL_CHECKBOX_NAMES.sixM, tools.sixM);
  xml = setNamedCheckbox(xml, INVESTIGATION_TOOL_CHECKBOX_NAMES.fiveWhy, tools.fiveWhy);
  xml = setNamedCheckbox(
    xml,
    INVESTIGATION_TOOL_CHECKBOX_NAMES.brainstorming,
    tools.brainstorming
  );
  zip.file("word/document.xml", xml);
}
