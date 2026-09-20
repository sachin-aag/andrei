/**
 * Builds templates/mj-failure-investigation-report-template.docx.
 *
 * The export has to look like a real SOP/QA/017-F01 report, so the chrome
 * (header with the MJ logo and the SOP/Unit line, footer, styles, theme,
 * fonts, page setup) is cloned from templates/mj-fir-chrome.docx — extracted
 * from an actual report by scripts/extract-mj-fir-chrome.mjs — and only the
 * body is generated here.
 *
 * Body geometry is copied from that report, not invented:
 *   - ONE form table, 4 columns of 2610 dxa, w=10440 (page 11909 − 720 − 720)
 *   - identity rows use all 4 columns as label / value / label / value
 *   - every other row is a single cell with gridSpan=4
 *   - section labels are BOLD 12pt and UNSHADED; only inner table header rows
 *     carry D9D9D9
 *   - body text is 12pt (sz 24), paragraphs justified with line spacing 276
 *   - a separate 5-column approval table, w=10457
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
const CHROME = path.join(ROOT, "templates/mj-fir-chrome.docx");
const DEST = path.join(
  ROOT,
  "templates/mj-failure-investigation-report-template.docx"
);

/** Body width: page 11909 less 720 left + 720 right margins, as in the source. */
const FULL = 10440;
const COL = 2610;

const BORDER = (side) =>
  `<w:${side} w:val="single" w:color="auto" w:sz="4" w:space="0"/>`;
const TBL_BORDERS = `<w:tblBorders>${BORDER("top")}${BORDER("left")}${BORDER("bottom")}${BORDER("right")}${BORDER("insideH")}${BORDER("insideV")}</w:tblBorders>`;
const TC_BORDERS = `<w:tcBorders>${BORDER("top")}${BORDER("left")}${BORDER("bottom")}${BORDER("right")}</w:tcBorders>`;

function esc(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Source report runs at 12pt throughout; labels differ only by bold. */
function rPr({ bold = false, sz = 24 } = {}) {
  return `<w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

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

/** Matches the source: justified, line spacing 276. */
function para(runs, { justify = true, sz = 24 } = {}) {
  const pPr = `<w:pPr><w:spacing w:line="276" w:lineRule="auto"/>${justify ? '<w:jc w:val="both"/>' : ""}<w:rPr><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function cell(width, inner, { span = 1, fill = null } = {}) {
  const spanXml = span > 1 ? `<w:gridSpan w:val="${span}"/>` : "";
  const fillXml = fill
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`
    : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${spanXml}${TC_BORDERS}${fillXml}<w:tcMar/><w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
}

function tr(cells, { height = null } = {}) {
  const trPr = height ? `<w:trPr><w:trHeight w:val="${height}"/></w:trPr>` : "";
  return `<w:tr>${trPr}${cells}</w:tr>`;
}

function tbl(colWidths, rowXml, { width = null, float = false } = {}) {
  const total = width ?? colWidths.reduce((a, b) => a + b, 0);
  const grid = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const floatXml = float
    ? '<w:tblpPr w:leftFromText="180" w:rightFromText="180" w:vertAnchor="text" w:horzAnchor="margin" w:tblpY="11"/>'
    : "";
  return `<w:tbl><w:tblPr>${floatXml}<w:tblW w:w="${total}" w:type="dxa"/>${TBL_BORDERS}<w:tblLook w:val="0160" w:firstRow="1" w:lastRow="1" w:firstColumn="0" w:lastColumn="1" w:noHBand="0" w:noVBand="0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`;
}

// ------------------------------------------------------------- form rows

/** Full-width section label. Bold, 12pt, no shading — as in the source. */
function labelRow(label) {
  return tr(cell(FULL, para(textRun(label, { bold: true })), { span: 4 }));
}

/**
 * Full-width value row carrying a raw-XML section field. The `{@tag}` must sit
 * inside a `<w:p>`: docxtemplater replaces the whole enclosing paragraph, and a
 * `<w:tc>` with no paragraph is invalid OOXML.
 */
function xmlRow(tag) {
  return tr(cell(FULL, para(tagRun(`{@${tag}}`)), { span: 4 }));
}

/** Full-width value row carrying a plain-text tag (checkbox rows). */
function textRow(tag) {
  return tr(cell(FULL, para(tagRun(`{${tag}}`)), { span: 4 }));
}

function section(label, tag) {
  return labelRow(label) + xmlRow(tag);
}

/**
 * Identity row: label / value / label / value across the same 4 columns as the
 * rest of the form. The source bolds only the right-hand label, which reads as
 * an accident of editing — bold both so the pairs are visually consistent.
 */
function identityRow(pairs) {
  return tr(
    pairs
      .map(
        ([label, tag]) =>
          cell(COL, para(textRun(label, { bold: true }), { justify: false })) +
          cell(COL, para(tagRun(`{${tag}}`), { justify: false }))
      )
      .join(""),
    { height: 286 }
  );
}

function approvalTable() {
  const cols = [1979, 2146, 2069, 2069, 2194];
  const roles = [
    ["Prepared By", "EU (Sign. & Date)"],
    ["Reviewed By", "EU (Sign. & Date)"],
    ["Reviewed By", "Production (Sign. & Date)"],
    ["Reviewed By", "QA (Sign. & Date)"],
    ["Approved By", "QA (Sign. & Date)"],
  ];
  // Source approval header: bold 12pt, centered, line spacing 276 — same run
  // size as the rest of the form.
  const centered = (text) =>
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>${textRun(text, { bold: true })}</w:p>`;
  const header = tr(
    roles
      .map(([top, bottom], i) =>
        cell(cols[i], centered(top) + centered(bottom))
      )
      .join(""),
    { height: 812 }
  );
  const blank = tr(cols.map((w) => cell(w, "<w:p/>")).join(""), {
    height: 1161,
  });
  return tbl(cols, header + blank, { width: 10457, float: true });
}

// ---------------------------------------------------------------- body

function bodyXml() {
  const rows =
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
      ["Report No.:", "documentNo"],
    ]) +
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
    textRow("toolsCheckboxes") +
    xmlRow("toolsNarrativeXml") +
    labelRow("Chronology of the event:") +
    xmlRow("chronologyNarrativeXml") +
    xmlRow("chronologyTableXml") +
    section("Investigation details:", "investigationDetailsXml") +
    labelRow("Historic Review:") +
    xmlRow("historicNarrativeXml") +
    xmlRow("historicTableXml") +
    labelRow("Root Cause/ Probable Cause:") +
    textRow("rootCauseClassificationCheckboxes") +
    textRow("rootCauseGroupCheckboxes") +
    xmlRow("rootCauseXml") +
    labelRow(
      "Human Error Evaluation (In Case Root cause identified as Human Error)"
    ) +
    textRow("humanErrorCheckboxes") +
    xmlRow("humanErrorTableXml") +
    labelRow("Impact Assessment:") +
    textRow("resultsStatusCheckboxes") +
    xmlRow("impactAssessmentXml") +
    section("Scope Assessment:", "scopeAssessmentXml") +
    labelRow("Batch Disposition") +
    textRow("batchDispositionCheckboxes") +
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

  return (
    tbl([COL, COL, COL, COL], rows, { width: FULL }) +
    "<w:p/>" +
    approvalTable() +
    "<w:p/>"
  );
}

// -------------------------------------------------------------------- build

if (!fs.existsSync(CHROME)) {
  console.error(`Missing ${path.relative(ROOT, CHROME)}.`);
  console.error(
    "Run: node scripts/extract-mj-fir-chrome.mjs <real-report.docx>"
  );
  process.exit(1);
}

const zip = new PizZip(fs.readFileSync(CHROME));
if (!zip.file("word/header1.xml")) {
  throw new Error("Chrome source is missing word/header1.xml");
}

const documentXml = zip.file("word/document.xml").asText();
const bodyOpen = documentXml.indexOf("<w:body>");
const sectPr = documentXml.lastIndexOf("<w:sectPr");
if (bodyOpen < 0 || sectPr < 0) {
  throw new Error("Chrome document.xml has no w:body / w:sectPr");
}
zip.file(
  "word/document.xml",
  documentXml.slice(0, bodyOpen + "<w:body>".length) +
    bodyXml() +
    documentXml.slice(sectPr)
);

// The source report is revision R00 of the form; we implement R01.
const footer = zip.file("word/footer1.xml").asText();
zip.file("word/footer1.xml", footer.replace("F01/R00", "F01/R01"));

fs.writeFileSync(DEST, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));

const out = new PizZip(fs.readFileSync(DEST));
const body = out.file("word/document.xml").asText();
const header = out.file("word/header1.xml").asText().replace(/<[^>]+>/g, "");
const media = Object.keys(out.files).filter((n) => n.startsWith("word/media/"));
console.log(`Wrote ${path.relative(ROOT, DEST)}`);
console.log(`  media:  ${media.join(", ")}`);
console.log(
  `  header: title=${/Investigation Report/.test(header)} unit=${/Unit: Drug Substance/.test(header)} sop=${/SOP\/QA\/017/.test(header)}`
);
console.log(
  `  footer: ${/F01\/R01/.test(out.file("word/footer1.xml").asText()) ? "SOP/QA/017-F01/R01" : "??"}`
);
console.log(
  `  table:  w10440=${/<w:tblW w:w="10440"/.test(body)} gridCols=${(body.match(/<w:gridCol/g) ?? []).length}`
);
console.log(
  `  tags:   ${new Set(body.match(/\{@?[A-Za-z]+\}/g) ?? []).size}`
);
