/**
 * Builds templates/mj-failure-investigation-report-template.docx from the MJ
 * investigation template.
 *
 * The export must look like SOP/QA/017 form F01 R01 (Template for Failure
 * Investigation Form, Drug Substance unit) — NOT the DMAIC form. We clone the
 * MJ investigation Word file so the circular MJ logo, the company header table
 * and the Confidential footer survive, then rewrite the body to R01: one
 * continuous bordered form table of label rows and value rows, ending in the
 * EU / EU / Production / QA / QA approval row.
 *
 * PizZip is used (not Python zipfile) so [Content_Types].xml stays the first
 * entry — Word rejects the file otherwise.
 *
 *   node scripts/build-mj-fir-template.mjs
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "templates/mj-investigation-report-template.docx");
const DEST = path.join(
  ROOT,
  "templates/mj-failure-investigation-report-template.docx"
);

const BORDER = (side) =>
  `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
const TBL_BORDERS = `<w:tblBorders>${BORDER("top")}${BORDER("left")}${BORDER("bottom")}${BORDER("right")}${BORDER("insideH")}${BORDER("insideV")}</w:tblBorders>`;

/** Full body width in dxa, matching the source template's margins. */
const FULL = 9360;

function esc(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function rPr({ bold = false, sz = 20 } = {}) {
  return `<w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

/** Plain text run. Never use this for `{placeholder}` tags. */
function textRun(text, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/**
 * A docxtemplater tag must live in a single `<w:t>`. Splitting `{` / `tag` /
 * `}` across runs makes the tag invisible to the renderer.
 */
function tagRun(tag, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${tag}</w:t></w:r>`;
}

function para(runs, extraPPr = "") {
  return `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/>${extraPPr}</w:pPr>${runs}</w:p>`;
}

function cellXml(width, inner, { span = 1, fill = null, valign = "center" } = {}) {
  const spanXml = span > 1 ? `<w:gridSpan w:val="${span}"/>` : "";
  const fillXml = fill
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`
    : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${spanXml}${fillXml}<w:vAlign w:val="${valign}"/></w:tcPr>${inner}</w:tc>`;
}

function cellPara(width, runs, opts = {}) {
  return cellXml(width, para(runs, '<w:spacing w:before="40" w:after="40"/>'), opts);
}

function tbl(colWidths, rowXml) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const grid = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/>${TBL_BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`;
}

function tr(cells) {
  return `<w:tr>${cells}</w:tr>`;
}

// ------------------------------------------------------------- form rows

/** Shaded full-width label row, exactly as the R01 form prints it. */
function labelRow(label) {
  return tr(
    cellPara(FULL, textRun(label, { bold: true, sz: 20 }), { fill: "D9D9D9" })
  );
}

/** Full-width value row carrying a raw-XML section field. */
function xmlRow(tag) {
  return tr(cellPara(FULL, tagRun(`{@${tag}}`, { sz: 20 }), { valign: "top" }));
}

/** Full-width value row carrying a plain-text tag (checkbox rows, identity). */
function textRowTag(tag) {
  return tr(cellPara(FULL, tagRun(`{${tag}}`, { sz: 20 }), { valign: "top" }));
}

/** Label row plus its value row. */
function section(label, tag) {
  return labelRow(label) + xmlRow(tag);
}

/** Two label/value pairs on one row — the R01 header grid. */
function identityRow(pairs) {
  const labelW = 1800;
  const valueW = 2880;
  return tr(
    pairs
      .map(([label, tag]) =>
        cellPara(labelW, textRun(label, { bold: true, sz: 18 }), {
          fill: "E7E6E6",
        }) + cellPara(valueW, tagRun(`{${tag}}`, { sz: 18 }))
      )
      .join("")
  );
}

function identityTable() {
  const cols = [1800, 2880, 1800, 2880];
  return tbl(
    cols,
    identityRow([
      ["Date of non conformance:", "dateOfNonConformance"],
      ["Source Document No.:", "sourceDocumentNo"],
    ]) +
      identityRow([
        ["Product Name:", "productName"],
        ["Batch No.:", "batchNo"],
      ]) +
      identityRow([
        ["Equipment ID:", "equipmentId"],
        ["Unit:", "unit"],
      ]) +
      identityRow([
        ["Reference SOP No.:", "referenceSopNo"],
        ["", "sourceDocumentNo"],
      ])
  );
}

function approvalTable() {
  const cols = [1872, 1872, 1872, 1872, 1872];
  const header = tr(
    [
      "Prepared By\nEU (Sign. & Date)",
      "Reviewed By\nEU (Sign. & Date)",
      "Reviewed By\nProduction (Sign. & Date)",
      "Reviewed By\nQA (Sign. & Date)",
      "Approved By\nQA (Sign. & Date)",
    ]
      .map((h, i) =>
        cellPara(cols[i], textRun(h.replaceAll("\n", " "), { bold: true, sz: 16 }), {
          fill: "D9D9D9",
        })
      )
      .join("")
  );
  const blank = tr(
    cols
      .map((w) =>
        cellXml(
          w,
          '<w:p><w:pPr><w:spacing w:before="240" w:after="240"/></w:pPr></w:p>'
        )
      )
      .join("")
  );
  return tbl(cols, header + blank);
}

// ---------------------------------------------------------------- body

function bodyXml() {
  const formRows =
    section(
      "Non-Conformance Description/ Description of event:",
      "eventDescriptionXml"
    ) +
    section("Standard Procedures:", "standardProceduresXml") +
    section("Immediate action taken (if any):", "immediateActionXml") +
    section("Initial Impact Assessment", "initialImpactXml") +
    labelRow("Investigation Team:") +
    xmlRow("teamTableXml") +
    labelRow("Investigation Tools Assigned:") +
    textRowTag("toolsCheckboxes") +
    xmlRow("toolsNarrativeXml") +
    labelRow("Chronology of the event:") +
    xmlRow("chronologyNarrativeXml") +
    xmlRow("chronologyTableXml") +
    section("Investigation details:", "investigationDetailsXml") +
    labelRow("Historic Review:") +
    xmlRow("historicNarrativeXml") +
    xmlRow("historicTableXml") +
    labelRow("Root Cause/ Probable Cause:") +
    textRowTag("rootCauseClassificationCheckboxes") +
    textRowTag("rootCauseGroupCheckboxes") +
    xmlRow("rootCauseXml") +
    labelRow("Human Error Evaluation (In Case Root cause identified as Human Error)") +
    textRowTag("humanErrorCheckboxes") +
    xmlRow("humanErrorTableXml") +
    labelRow("Impact Assessment:") +
    textRowTag("resultsStatusCheckboxes") +
    xmlRow("impactAssessmentXml") +
    section("Scope Assessment:", "scopeAssessmentXml") +
    labelRow("Batch Disposition") +
    textRowTag("batchDispositionCheckboxes") +
    xmlRow("batchDispositionXml") +
    labelRow("Correction, Corrective and Preventive action Details (CAPA):") +
    labelRow("Correction Details:") +
    xmlRow("correctionXml") +
    labelRow("Corrective Action:") +
    xmlRow("correctiveNarrativeXml") +
    xmlRow("correctiveTableXml") +
    labelRow("Interim Control") +
    xmlRow("interimNarrativeXml") +
    xmlRow("interimTableXml") +
    labelRow("Preventive Action:") +
    xmlRow("preventiveNarrativeXml") +
    xmlRow("preventiveTableXml") +
    labelRow("CAPA Effectiveness Check") +
    xmlRow("effectivenessTableXml") +
    labelRow("List of Attachment:") +
    xmlRow("attachmentsTableXml");

  return [
    identityTable(),
    para(textRun("")),
    tbl([FULL], formRows),
    para(textRun("")),
    approvalTable(),
    para(
      textRun(
        "Note: Word template format shall be used to carry out the investigation. No. of reviewed by person can be added or removed based on investigation team members.",
        { sz: 16 }
      )
    ),
  ].join("");
}

// -------------------------------------------------------- header / footer

function patchHeader(xml) {
  let out = xml;
  if (!out.includes("Investigation Report")) {
    throw new Error("Expected 'Investigation Report' in header2.xml");
  }
  // ERF/26/022 prints "Investigation Report" in the header; the DS/DP split is
  // carried by the Unit meta row below, not by the title. Leave it as-is.
  // The source header carries SOP/DP/QA/008 split across runs; blank them and
  // add an explicit meta row for SOP/QA/017.
  out = out.replace("<w:t>SOP/</w:t>", "<w:t></w:t>");
  out = out.replace("<w:t>DP/</w:t>", "<w:t></w:t>");
  out = out.replace("<w:t>QA</w:t>", "<w:t></w:t>");
  out = out.replace("<w:t>/008</w:t>", "<w:t></w:t>");

  const metaRow = `<w:tr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/><w:gridSpan w:val="2"/><w:vAlign w:val="center"/></w:tcPr><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${TBL_BORDERS}</w:tblPr><w:tblGrid><w:gridCol w:w="3486"/><w:gridCol w:w="3486"/><w:gridCol w:w="3487"/></w:tblGrid><w:tr>${cellPara(3486, textRun("Unit: Drug Substance", { bold: true, sz: 18 }))}${cellPara(3486, textRun("Reference SOP No.: SOP/QA/017", { bold: true, sz: 18 }))}${cellPara(3487, textRun("Revision No: R08", { bold: true, sz: 18 }))}</w:tr></w:tbl><w:p/></w:tc></w:tr>`;
  const tblClose = out.lastIndexOf("</w:tbl>");
  if (tblClose < 0) throw new Error("header2.xml has no table");
  out = out.slice(0, tblClose) + metaRow + out.slice(tblClose);
  return out;
}

function patchFooter(xml) {
  if (!xml.includes("/DP/QA/008/F04")) {
    throw new Error("Expected SOP/DP/QA/008/F04 in footer1.xml");
  }
  let out = xml.replace("<w:t>/DP/QA/008/F04</w:t>", "<w:t>/QA/017-F01/R01</w:t>");
  out = out.replace("<w:t>-R0</w:t>", "<w:t></w:t>");
  out = out.replace(
    '<w:r w:rsidR="00421388"><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>2</w:t></w:r>',
    ""
  );
  return out;
}

// -------------------------------------------------------------------- build

const zip = new PizZip(fs.readFileSync(SOURCE));
if (!zip.file("word/media/image1.png")) {
  throw new Error("Source investigation template is missing word/media/image1.png");
}

const documentXml = zip.file("word/document.xml").asText();
const bodyOpen = documentXml.indexOf("<w:body>");
const sectPr = documentXml.lastIndexOf("<w:sectPr");
if (bodyOpen < 0 || sectPr < 0) {
  throw new Error("Could not find w:body / w:sectPr in the investigation template");
}
const rebuilt =
  documentXml.slice(0, bodyOpen + "<w:body>".length) +
  bodyXml() +
  documentXml.slice(sectPr);
zip.file("word/document.xml", rebuilt);

zip.file("word/header2.xml", patchHeader(zip.file("word/header2.xml").asText()));
zip.file("word/footer1.xml", patchFooter(zip.file("word/footer1.xml").asText()));

fs.writeFileSync(DEST, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));

const out = new PizZip(fs.readFileSync(DEST));
const media = Object.keys(out.files).filter((n) => n.startsWith("word/media/"));
const body = out.file("word/document.xml").asText();
console.log(`Wrote ${path.relative(ROOT, DEST)}`);
console.log(`  media: ${media.join(", ")}`);
const headerXml = out.file("word/header2.xml").asText();
console.log(`  header title: ${/Investigation Report/.test(headerXml)}`);
console.log(`  unit: ${/Unit: Drug Substance/.test(headerXml)}`);
console.log(`  footer form: ${/QA\/017-F01\/R01/.test(out.file("word/footer1.xml").asText())}`);
console.log(
  `  tags: ${(body.match(/\{@?[A-Za-z]+\}/g) ?? []).length}`
);
