/**
 * Creates a blank docxtemplater template from reference-template.docx.
 * Rebuilds entire rows while keeping row and cell properties.
 */
import fs from "fs";
import path from "path";
import PizZip from "pizzip";

const REFERENCE = path.join(process.cwd(), "reference-template.docx");
/** QC/QA sign-off layout used on current investigation drafts (separate table after DMAIC body). */
const SIGNATURE_LAYOUT_SOURCE = path.join(
  process.cwd(),
  "docs/Draft Investigation (DEV-QC-26-001).docx"
);
const OUTPUT_DIR = path.join(process.cwd(), "templates");
const OUTPUT = path.join(OUTPUT_DIR, "investigation-report-template.docx");

const content = fs.readFileSync(REFERENCE);
const zip = new PizZip(content);
let xml = zip.file("word/document.xml").asText();

// ─── Helpers ───

function runPr({ bold = false, fontSize = 24 } = {}) {
  const bTag = bold ? "<w:b/>" : "";
  return `<w:rPr>${bTag}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr>`;
}

function textRun(text, { bold = false, fontSize = 24 } = {}) {
  return `<w:r>${runPr({ bold, fontSize })}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function makePara(text, { bold = false, fontSize = 24 } = {}) {
  const pPrRPr = runPr({ bold, fontSize });
  return `<w:p><w:pPr><w:spacing w:before="60" w:line="276" w:lineRule="auto"/><w:jc w:val="left"/>${pPrRPr}</w:pPr>${textRun(text, { bold, fontSize })}</w:p>`;
}

function makeLabelValuePara(label, valuePlaceholder, { fontSize = 24 } = {}) {
  return (
    `<w:p><w:pPr><w:spacing w:before="60" w:line="276" w:lineRule="auto"/><w:jc w:val="left"/>${runPr({ bold: true, fontSize })}</w:pPr>` +
    `${textRun(label, { bold: true, fontSize })}${textRun(valuePlaceholder, { bold: false, fontSize })}</w:p>`
  );
}

function makeParas(lines, opts = {}) {
  return lines.map((l) => makePara(l, opts)).join("");
}

function isSignatureTableXml(tblXml) {
  const text = Array.from(tblXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g))
    .map((m) => m[1] ?? "")
    .join("");
  return (
    /\bPrepared\b/i.test(text) &&
    /\bSign\s*\/\s*Date\b/i.test(text) &&
    (/\bReviewed\b/i.test(text) || /\bApproved\b/i.test(text))
  );
}

function extractSignatureTableXmlFromDocx(docxPath) {
  const zip = new PizZip(fs.readFileSync(docxPath));
  const docXml = zip.file("word/document.xml")?.asText();
  if (!docXml) throw new Error(`Missing word/document.xml in ${docxPath}`);

  const matches = [...docXml.matchAll(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)].map(
    (m) => m[0]
  );
  const signatureTables = matches.filter(isSignatureTableXml);
  if (signatureTables.length === 0) {
    throw new Error(`No signature table found in ${docxPath}`);
  }
  return signatureTables[signatureTables.length - 1];
}

function blankSignatureDataRow(dataRowXml) {
  return dataRowXml.replace(
    /<w:t[^>]*>[^<]*<\/w:t>/g,
    '<w:t xml:space="preserve"></w:t>'
  );
}

/** Two-row QC/QA reviewer table matching docs/Draft Investigation (DEV-QC-26-001).docx import. */
function buildBlankReviewerSignatureTable() {
  const source = extractSignatureTableXmlFromDocx(SIGNATURE_LAYOUT_SOURCE);
  const rows = [...source.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  if (rows.length < 2) {
    throw new Error("Signature layout source must contain header and data rows");
  }
  const tblPr = source.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] ?? "";
  return `<w:tbl>${tblPr}${rows[0]}${blankSignatureDataRow(rows[1])}</w:tbl>`;
}

function replaceLastSignatureTable(xml, replacementTableXml) {
  const candidates = [];
  const tblRe = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g;
  let match;
  while ((match = tblRe.exec(xml)) !== null) {
    if (!isSignatureTableXml(match[0])) continue;
    candidates.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  if (candidates.length === 0) {
    throw new Error("No signature table found in reference template");
  }
  const last = candidates[candidates.length - 1];
  return xml.substring(0, last.start) + replacementTableXml + xml.substring(last.end);
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
  return (
    "<w:p><w:pPr><w:spacing w:before=\"60\" w:line=\"276\" w:lineRule=\"auto\"/>" +
    "<w:jc w:val=\"left\"/><w:rPr><w:b/><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/></w:rPr></w:pPr>" +
    textRun("Investigation tool used:  ", { bold: true }) +
    formCheckboxFieldXml(false, "toolSixM") +
    textRun(" 6M     ", { bold: true }) +
    formCheckboxFieldXml(false, "toolFiveWhy") +
    textRun(" 5 Why     ", { bold: true }) +
    formCheckboxFieldXml(false, "toolBrainstorming") +
    textRun(" Brainstorming", { bold: true }) +
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
  makeLabelValuePara("Other Tools (If any): ", "{otherToolsDisplay}")
));

// Row 3: Other Tools old value → empty
R.set(3, rebuildRow(rows[3].xml, makePara(" ")));

// Row 4: "Define:" label → keep

// Row 5: Define content (narrative includes template checkpoints from DB)
R.set(5, rebuildRow(rows[5].xml, makeParas([
  '{@defineNarrativeXml}',
])));

// Row 6: "Details Investigation:" label → keep

// Row 7: Measure (label + narrative content from DB)
R.set(7, rebuildRow(rows[7].xml,
  makePara("Measure:", { bold: true }) + makeParas(["{@measureNarrativeXml}"])
));

// Row 8: "Analyze:" label → keep

// Row 9: 6M Method content
R.set(9, rebuildRow(rows[9].xml,
  makePara("6 M Method (If Applicable):", { bold: true }) +
  makeLabelValuePara("Man: ", "{sixMMan}") +
  makeLabelValuePara("Machine: ", "{sixMMachine}") +
  makeLabelValuePara("Measurement: ", "{sixMMeasurement}") +
  makeLabelValuePara("Material: ", "{sixMMaterial}") +
  makeLabelValuePara("Method: ", "{sixMMethod}") +
  makeLabelValuePara("Milieu (Environment): ", "{sixMMilieu}") +
  makeLabelValuePara("Conclusion: ", "{sixMConclusion}")
));

// Row 10: 6M Note → keep

// Row 11: 5 Why content (chain + conclusion live in one narrative field)
R.set(11, rebuildRow(rows[11].xml,
  makePara("5 Why Approach (If Applicable):", { bold: true }) +
  makeParas(["{@fiveWhyNarrativeXml}"])
));

// Row 12: Brainstorming
R.set(12, rebuildRow(rows[12].xml,
  makePara("Brainstorming:", { bold: true }) +
  makeParas(["{@brainstormingXml}"])
));

// Row 13: Other Tool #1 — label-only duplicate row (value lives on row 14)
R.set(13, rebuildRow(rows[13].xml, makePara("Other Tool if Any:", { bold: true })));

// Row 14: Other Tool #2 — label + value on the following line(s)
R.set(14, rebuildRow(rows[14].xml,
  makePara("Other Tool if Any:", { bold: true }) +
  makeParas(["{@analyzeOtherToolsXml}"])
));

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
R.set(20, rebuildRow(rows[20].xml, makePara("{@impactAssessmentXml}")));

// Row 21: Improve label + checkpoint guidance (matches reference-template row 21)
R.set(21, rebuildRow(rows[21].xml,
  makePara("Improve:", { bold: true }) + makeParas(["{@improveNarrativeXml}"])
));

// Row 22: "Corrective Action:" label → keep

// Row 23: Corrective Action content
R.set(23, rebuildRow(rows[23].xml, makeParas([
  '{@correctiveActionsXml}',
])));

// Row 24: Control label + checkpoint guidance (matches reference-template row 24)
R.set(24, rebuildRow(rows[24].xml,
  makePara("Control:", { bold: true }) + makeParas(["{@controlNarrativeXml}"])
));

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

// Second table (global rows 31–32): QC/QA reviewer sign-off — replaced after row edits

// ─── Apply replacements in reverse order ───

const sorted = [...R.entries()].sort((a, b) => b[0] - a[0]);
for (const [idx, newRowXml] of sorted) {
  const row = rows[idx];
  if (row) {
    xml = xml.substring(0, row.start) + newRowXml + xml.substring(row.end);
  }
}

// Insert Conclusion section rows before "Document Reviewed"
const rowsAfter = [];
let rowMatchAfter;
const rowRegexAfter = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
while ((rowMatchAfter = rowRegexAfter.exec(xml)) !== null) {
  const texts = [];
  const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let tm;
  while ((tm = tRe.exec(rowMatchAfter[0])) !== null) texts.push(tm[1]);
  rowsAfter.push({
    start: rowMatchAfter.index,
    end: rowMatchAfter.index + rowMatchAfter[0].length,
    xml: rowMatchAfter[0],
    text: texts.join(""),
  });
}
const docReviewIdx = rowsAfter.findIndex((r) => /Document Reviewed/i.test(r.text));
if (docReviewIdx > 0) {
  const templateRow = rowsAfter[docReviewIdx - 1]?.xml ?? rowsAfter[0].xml;
  const conclusionLabelRow = rebuildRow(templateRow, makePara("Conclusion:", { bold: true }));
  const conclusionContentRow = rebuildRow(
    templateRow,
    makeParas(["{@conclusionNarrativeXml}"])
  );
  const insertAt = rowsAfter[docReviewIdx].start;
  xml =
    xml.substring(0, insertAt) +
    conclusionLabelRow +
    conclusionContentRow +
    xml.substring(insertAt);
}

xml = replaceLastSignatureTable(xml, buildBlankReviewerSignatureTable());

// ─── De-MJ headers, footers, and embedded logo ───

function stripMjHeaderFooterText(xml) {
  function cleanFragment(text) {
    let t = text;
    if (!t.trim()) return t;
    if (/biopharm/i.test(t)) return "Andrei";
    if (/confidential and proprietary/i.test(t)) return "Andrei — Document Review";
    if (/^m\.j\.\s*$/i.test(t.trim())) return "";
    if (/^reference sop/i.test(t.trim()) || /^rence sop/i.test(t.trim())) return "";
    if (/^sop\/$/i.test(t.trim())) return "";
    if (/^dp\/$/i.test(t.trim())) return "";
    if (/^qa$/i.test(t.trim())) return "";
    if (/^\/008$/i.test(t.trim())) return "";
    if (/sop\s*\/\s*dp\s*\/\s*qa\s*\/\s*008/i.test(t)) return "";
    if (/sop\s*\/dp\/qa\/008\/f04/i.test(t)) return "";
    if (/plot no\.|hinjawadi|international biotech|unit:\s*drug product/i.test(t)) return "";
    if (/phase ii/i.test(t) || /pune\s*\d*/i.test(t)) return "";
    return t;
  }

  return xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, text) => {
    const cleaned = cleanFragment(text);
    if (cleaned === text) return match;
    return `<w:t${attrs}>${cleaned}</w:t>`;
  });
}

for (const part of ["word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"]) {
  const partXml = zip.file(part)?.asText();
  if (partXml) {
    zip.file(part, stripMjHeaderFooterText(partXml));
  }
}

const andreiLogoPath = path.join(process.cwd(), "compliance-deck/assets/andrei-logo.png");
if (fs.existsSync(andreiLogoPath) && zip.file("word/media/image1.png")) {
  zip.file("word/media/image1.png", fs.readFileSync(andreiLogoPath));
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
console.log("Replaced signature table with QC/QA reviewer layout from draft investigation DOCX");
