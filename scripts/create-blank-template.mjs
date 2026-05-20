/**
 * Creates a blank docxtemplater template from reference-template.docx.
 * Rebuilds entire rows while keeping row and cell properties.
 */
import fs from "fs";
import path from "path";
import PizZip from "pizzip";

const REFERENCE = path.join(process.cwd(), "reference-template.docx");
const OUTPUT_DIR = path.join(process.cwd(), "templates");
const OUTPUT = path.join(OUTPUT_DIR, "investigation-report-template.docx");

const content = fs.readFileSync(REFERENCE);
const zip = new PizZip(content);
let xml = zip.file("word/document.xml").asText();

// ─── Helpers ───

function makePara(text, { bold = false, fontSize = 24 } = {}) {
  const bTag = bold ? "<w:b/>" : "<w:bCs/>";
  return `<w:p><w:pPr><w:spacing w:before="60" w:line="276" w:lineRule="auto"/><w:jc w:val="left"/><w:rPr>${bTag}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr></w:pPr><w:r><w:rPr>${bTag}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function makeParas(lines, opts = {}) {
  return lines.map(l => makePara(l, opts)).join("");
}

// Keep in sync with src/lib/export/docx-form-checkbox.ts
const RUN_PR = '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';

function formCheckboxFieldXml(checked, fieldName) {
  const defaultVal = checked ? "1" : "0";
  const checkedTag = checked ? '<w:checked w:val="1"/>' : "";
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

function makeInvestigationToolsParagraph() {
  const textRun = (text, bold = true) => {
    const bTag = bold ? "<w:b/>" : "<w:bCs/>";
    return `<w:r><w:rPr>${bTag}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
  };
  return (
    "<w:p><w:pPr><w:spacing w:before=\"60\" w:line=\"276\" w:lineRule=\"auto\"/>" +
    "<w:jc w:val=\"left\"/><w:rPr><w:b/><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/></w:rPr></w:pPr>" +
    textRun("Investigation tool used:  ") +
    formCheckboxFieldXml(false, "toolSixM") +
    textRun(" 6M     ") +
    formCheckboxFieldXml(false, "toolFiveWhy") +
    textRun(" 5 Why     ") +
    formCheckboxFieldXml(false, "toolBrainstorming") +
    textRun(" Brainstorming") +
    "</w:p>"
  );
}

// ─── Parse rows with simple regex (handles siblings correctly) ───

const rowRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
const rows = [];
let rowMatch;
while ((rowMatch = rowRegex.exec(xml)) !== null) {
  const texts = [];
  const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let tm;
  while ((tm = tRe.exec(rowMatch[0])) !== null) texts.push(tm[1]);
  rows.push({
    start: rowMatch.index,
    end: rowMatch.index + rowMatch[0].length,
    xml: rowMatch[0],
    text: texts.join(""),
  });
}

console.log(`Found ${rows.length} table rows`);
rows.forEach((r, i) => {
  console.log(`  Row ${i}: "${r.text.replace(/\s+/g, " ").substring(0, 80)}"`);
});

// ─── Row rebuilders ───

// Rebuild a spanning row: extract trPr and first tcPr, replace content
function rebuildRow(rowXml, newParagraphs) {
  const trPrMatch = rowXml.match(/<w:trPr>[\s\S]*?<\/w:trPr>/);
  const trPr = trPrMatch ? trPrMatch[0] : "";
  const tcPrMatch = rowXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const tcPr = tcPrMatch ? tcPrMatch[0] : "";
  return `<w:tr>${trPr}<w:tc>${tcPr}${newParagraphs}</w:tc></w:tr>`;
}

// Replace specific cells in a multi-cell row
function rebuildMultiCellRow(rowXml, cellContents) {
  const trPrMatch = rowXml.match(/<w:trPr>[\s\S]*?<\/w:trPr>/);
  const trPr = trPrMatch ? trPrMatch[0] : "";

  // Extract all cells
  const cellRegex = /<w:tc>([\s\S]*?)<\/w:tc>/g;
  const cells = [];
  let cm;
  while ((cm = cellRegex.exec(rowXml)) !== null) {
    cells.push(cm[0]);
  }

  const newCells = cells.map((cell, i) => {
    if (cellContents[i] === undefined) return cell; // keep original
    const tcPrMatch = cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
    const tcPr = tcPrMatch ? tcPrMatch[0] : "";
    return `<w:tc>${tcPr}${cellContents[i]}</w:tc>`;
  });

  return `<w:tr>${trPr}${newCells.join("")}</w:tr>`;
}

// ─── Define all replacements based on actual row content ───
// Row text mapping (from debug output):
//  0: Date/DevNo  1: Tool used  2: Other Tools label  3: Other Tools value
//  4: Define label  5: Define content  6: Details Investigation label
//  7: Measure (label+checklist+content combined)  8: Analyze label
//  9: 6M content  10: 6M Note  11: 5 Why  12: Brainstorming
//  13: Other Tool #1  14: Other Tool #2 (duplicate)
//  15: Investigation Outcome label  16: Investigation Outcome content
//  17: Root Cause label  18: Root Cause content
//  19: Impact Assessment label  20: Impact Assessment content
//  21: Improve (label+checklist)  22: Corrective Action label
//  23: Corrective Action content
//  24: Control (label+checklist)  25: Preventive Action label
//  26: Preventive Action content
//  27: Document Reviewed label  28: Document Reviewed content
//  29: List of attachment label  30: Attachment content
//  31: Signature header  32: Signature empty

const R = new Map();

// Row 0: Date | value | Deviation No. | value
R.set(0, rebuildMultiCellRow(rows[0].xml, {
  1: makePara("{date}"),
  3: makePara("{deviationNo}"),
}));

// Row 1: Investigation tool used (Word form checkboxes — state set at export via docx-form-checkbox)
R.set(1, rebuildRow(rows[1].xml, makeInvestigationToolsParagraph()));

// Row 2: Other Tools label + value
R.set(2, rebuildRow(rows[2].xml,
  makePara("Other Tools (If any): {otherToolsDisplay}", { bold: true })
));

// Row 3: Other Tools old value → empty
R.set(3, rebuildRow(rows[3].xml, makePara(" ")));

// Row 4: "Define:" label → keep

// Row 5: Define content (checklist + narrative)
R.set(5, rebuildRow(rows[5].xml, makeParas([
  'Following checks shall be considered while writing the \u201CDefine\u201D section.',
  '1. Clearly define what happens actually.',
  '2. Explain what is different than expected.',
  '3. Mention the location where the deviation has occurred.',
  '4. Date/time of deviation occurrence and date/time of detection.',
  '5. Mention the name of personnel who is involved in the deviation.',
  '6. Mention initial scope of deviation (impacted product/Material/Equipment/System/Batches/etc.)',
  '',
  '{@defineNarrativeXml}',
])));

// Row 6: "Details Investigation:" label → keep

// Row 7: Measure (COMBINED: label + checklist + narrative content)
R.set(7, rebuildRow(rows[7].xml, makeParas([
  'Measure:',
  'Following checks shall be considered while writing the \u201CMeasure\u201D section.',
  '1. Does the summary provide relevant facts and data/information reviewed?',
  '2. Is a summary of the analysis of the factors and data provided?',
  '3. Is a conclusion statement of the analysis and review provided?',
  '4. If there were Regulatory Notification, were details provided?',
  '5. Is the report written in a logical flow and easily understood by the reader?',
  '',
  '{@measureNarrativeXml}',
])));

// Row 8: "Analyze:" label → keep

// Row 9: 6M Method content
R.set(9, rebuildRow(rows[9].xml, makeParas([
  '6 M Method (If Applicable):',
  'Man: {sixMMan}',
  'Machine: {sixMMachine}',
  'Measurement: {sixMMeasurement}',
  'Material: {sixMMaterial}',
  'Method: {sixMMethod}',
  'Milieu (Environment): {sixMMilieu}',
  'Conclusion: {sixMConclusion}',
])));

// Row 10: 6M Note → keep

// Row 11: 5 Why content (chain + conclusion live in one narrative field)
R.set(11, rebuildRow(rows[11].xml, makeParas([
  '5 Why Approach (If Applicable):',
  '{@fiveWhyNarrativeXml}',
])));

// Row 12: Brainstorming
R.set(12, rebuildRow(rows[12].xml, makeParas([
  'Brainstorming:',
  '{@brainstormingXml}',
])));

// Row 13: Other Tool #1
R.set(13, rebuildRow(rows[13].xml, makeParas([
  'Other Tool if Any:',
  '{@analyzeOtherToolsXml}',
])));

// Row 14: Other Tool #2 (duplicate) → empty
R.set(14, rebuildRow(rows[14].xml, makePara(" ")));

// Row 15: Investigation Outcome label → keep
// Row 16: Investigation Outcome content
R.set(16, rebuildRow(rows[16].xml, makePara("{@investigationOutcomeXml}")));

// Row 17: Root Cause label → keep
// Row 18: Root Cause content
R.set(18, rebuildRow(rows[18].xml, makeParas([
  '{@rootCauseNarrativeXml}',
])));

// Row 19: Impact Assessment label → keep
// Row 20: Impact Assessment content
R.set(20, rebuildRow(rows[20].xml, makeParas([
  'System: {impactSystem}',
  'Document: {impactDocument}',
  'Product: {impactProduct}',
  'Equipment: {impactEquipment}',
  'Patient safety / Past Batches: {impactPatientSafety}',
])));

// Row 21: Improve (label + checklist combined)
R.set(21, rebuildRow(rows[21].xml, makeParas([
  'Improve: Improve section covers the corrective actions.',
  'Following checks shall be considered while writing the \u201CImprove\u201D section.',
  '1. Were specific corrective actions identified (including immediate actions)?',
  '2. Were specific corrective actions identified for each root cause?',
  '3. Was the corrective action assigned a unique number, responsible person and due date?',
  '4. Does the action describe the expected outcome that can be verified?',
  '5. Was effectiveness verification required or not, with rationale documented?',
  '6. Are the identified corrective actions achievable?',
])));

// Row 22: "Corrective Action:" label → keep

// Row 23: Corrective Action content
R.set(23, rebuildRow(rows[23].xml, makeParas([
  '{@correctiveActionsXml}',
])));

// Row 24: Control (label + checklist combined)
R.set(24, rebuildRow(rows[24].xml, makeParas([
  'Control: Control section covers the preventive actions.',
  'Following checks shall be considered while writing the \u201CControl\u201D section.',
  '1. Are specific preventive actions identified to prevent recurrence?',
  '2. Was the preventive action assigned a unique number, responsible person and due date?',
  '3. Does the action describe the expected outcome that can be verified?',
  '4. Was effectiveness verification required or not, with rationale documented?',
  '5. Are the identified preventive actions achievable?',
])));

// Row 25: "Preventive Action:" label → keep

// Row 26: Preventive Action content (single body)
R.set(26, rebuildRow(rows[26].xml, makeParas([
  '{@preventiveActionsXml}',
])));

// Row 27: "Document Reviewed:" label → keep

// Row 28: Document Reviewed content
R.set(28, rebuildRow(rows[28].xml, makePara("{@documentsReviewedXml}")));

// Row 29: "List of attachment" label → keep

// Row 30: Attachment content
R.set(30, rebuildRow(rows[30].xml, makeParas([
  '{#attachments}',
  'Attachment No. {romanNumeral}: {attachmentDescription}',
  '{/attachments}',
])));

// Rows 31-32: Signature table → keep

// ─── Apply replacements in reverse order ───

const sorted = [...R.entries()].sort((a, b) => b[0] - a[0]);
for (const [idx, newRowXml] of sorted) {
  const row = rows[idx];
  if (row) {
    xml = xml.substring(0, row.start) + newRowXml + xml.substring(row.end);
  }
}

// ─── Save ───

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

zip.file("word/document.xml", xml);
const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(OUTPUT, buf);

console.log(`\nTemplate saved to: ${OUTPUT}`);
console.log(`Applied ${R.size} row replacements`);
