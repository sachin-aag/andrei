/**
 * Builds templates/mj-quality-risk-assessment-template.docx from the MJ
 * investigation template.
 *
 * The QRA export must look like SOP/DP/QA/010/F02 (Quality Risk Assessment
 * by FMEA), not like a Convergent mechanical DV report with the title swapped.
 * We clone the investigation Word file so the circular MJ logo, company
 * header table, and Confidential footer survive, then rewrite the body to
 * F02: cover, TOC, pre-approval, 1.1–4.3, revision history, post-approval.
 *
 * PizZip is used (not Python zipfile) so [Content_Types].xml stays the first
 * entry — Word rejects the file otherwise.
 *
 *   node scripts/build-mj-qra-template.mjs
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "templates/mj-investigation-report-template.docx");
const DEST = path.join(ROOT, "templates/mj-quality-risk-assessment-template.docx");

const BORDER = (side) =>
  `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
const TBL_BORDERS = `<w:tblBorders>${BORDER("top")}${BORDER("left")}${BORDER("bottom")}${BORDER("right")}${BORDER("insideH")}${BORDER("insideV")}</w:tblBorders>`;

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
 * A docxtemplater tag must live in a single `<w:t>`. Splitting `{` / `title` /
 * `}` across runs makes the tag invisible to the renderer.
 */
function tagRun(tag, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${tag}</w:t></w:r>`;
}

function para(runs, extraPPr = "") {
  return `<w:p><w:pPr><w:spacing w:before="80" w:after="80"/>${extraPPr}</w:pPr>${runs}</w:p>`;
}

function heading(text, sz = 24) {
  return para(textRun(text, { bold: true, sz }), `<w:spacing w:before="240" w:after="80"/>`);
}

function bodyText(text, opts = {}) {
  return para(textRun(text, { sz: 20, ...opts }));
}

function field(tag) {
  return para(tagRun(`{@${tag}}`));
}

function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function cellXml(width, inner, { span = 1, fill = null, valign = "center" } = {}) {
  const spanXml = span > 1 ? `<w:gridSpan w:val="${span}"/>` : "";
  const fillXml = fill
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`
    : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${spanXml}${fillXml}<w:vAlign w:val="${valign}"/></w:tcPr>${inner}</w:tc>`;
}

function cellPara(width, runs, opts = {}) {
  return cellXml(
    width,
    para(runs, '<w:spacing w:before="40" w:after="40"/>'),
    opts
  );
}

function tbl(colWidths, rowXml) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const grid = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/>${TBL_BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`;
}

function tr(cells) {
  return `<w:tr>${cells}</w:tr>`;
}

function labelValueRow(labelW, valueW, label, tag) {
  return tr(
    cellPara(labelW, textRun(label, { bold: true, sz: 20 }), { fill: "E7E6E6" }) +
      cellPara(valueW, tagRun(tag, { sz: 20 }))
  );
}

function signatureTable() {
  const cols = [2400, 2800, 2600, 2600];
  const header = tr(
    [
      "Name",
      "Designation & Department",
      "Signature",
      "Date",
    ]
      .map((h, i) =>
        cellPara(cols[i], textRun(h, { bold: true, sz: 18 }), { fill: "D9D9D9" })
      )
      .join("")
  );
  const roleRow = (role) =>
    tr(
      cellPara(cols[0], textRun(role, { bold: true, sz: 18 })) +
        cellPara(cols[1], textRun("")) +
        cellPara(cols[2], textRun("")) +
        cellPara(cols[3], textRun(""))
    );
  return tbl(
    cols,
    header +
      roleRow("Performed By (User Dept.)") +
      roleRow("Reviewed By (Risk Assessment Team Members)") +
      roleRow("") +
      roleRow("") +
      roleRow("Approved By (Head QA/Designee)")
  );
}

function tocTable() {
  const cols = [1400, 7200, 1800];
  const header = tr(
    ["Sr. No.", "Title", "Page No."]
      .map((h, i) =>
        cellPara(cols[i], textRun(h, { bold: true, sz: 18 }), { fill: "D9D9D9" })
      )
      .join("")
  );
  const entries = [
    ["", "Title Page", ""],
    ["", "Table of Contents", ""],
    ["A", "Pre-Approval", ""],
    ["1", "Details of Risk Assessment", ""],
    ["1.1", "Objective", ""],
    ["1.2", "Scope", ""],
    ["1.3", "System / Equipment / Instrument / Other (if any) Overview", ""],
    ["1.4", "Procedure", ""],
    ["1.5", "Risk Assessment Team Members", ""],
    ["1.6", "Risk Identification", ""],
    ["1.7", "Risk Measurement by Failure Mode Effect Analysis", ""],
    ["1.8", "Risk Assessment Approach", ""],
    ["2", "Risk Identification and evaluation considering current control measures", ""],
    ["3", "Risk Communication", ""],
    ["3.1", "Risk Assessment Summary and Conclusion (Before Implementation)", ""],
    ["4", "Mitigation plan and closure", ""],
    ["4.1", "New risk identified during execution / residual risk (if any)", ""],
    ["4.2", "Periodic review of identified risks", ""],
    ["4.3", "Risk assessment summary and conclusion (after implementation)", ""],
    ["B", "Revision History", ""],
    ["C", "Post-Approval", ""],
  ];
  const rows = entries
    .map(([n, title, page]) =>
      tr(
        cellPara(cols[0], textRun(n, { sz: 18 })) +
          cellPara(cols[1], textRun(title, { sz: 18 })) +
          cellPara(cols[2], textRun(page, { sz: 18 }))
      )
    )
    .join("");
  return tbl(cols, header + rows);
}

function coverTable() {
  const labelW = 4200;
  const valueW = 6200;
  return tbl(
    [labelW, valueW],
    labelValueRow(labelW, valueW, "Title", "{title}") +
      labelValueRow(labelW, valueW, "Department", "{department}") +
      labelValueRow(labelW, valueW, "Risk Assessment No.", "{documentNo}") +
      tr(
        cellPara(
          labelW + valueW,
          textRun(
            "RISK ASSESSMENT AND EVALUATION RECORD FOR (System / Equipment / Facility / Instrument / other Name)",
            { bold: true, sz: 18 }
          ),
          { span: 2, fill: "E7E6E6" }
        )
      ) +
      labelValueRow(labelW, valueW, "Name", "{productName}") +
      labelValueRow(labelW, valueW, "Source Document Name (If any)", "{sourceDocumentName}") +
      labelValueRow(labelW, valueW, "Source Document No. (If any)", "{sourceDocumentNo}") +
      labelValueRow(
        labelW,
        valueW,
        "Product / Process / Equipment / System / Other name",
        "{productName}"
      ) +
      labelValueRow(labelW, valueW, "ID No. (If Applicable)", "{idNo}") +
      labelValueRow(labelW, valueW, "Date", "{date}") +
      labelValueRow(labelW, valueW, "Revision", "{revision}")
  );
}

function bodyXml() {
  return [
    para(textRun("FORMAT — II", { bold: true, sz: 28 }), `<w:jc w:val="center"/>`),
    para(
      textRun("Template for Risk Assessment by FMEA", { bold: true, sz: 24 }),
      `<w:jc w:val="center"/>`
    ),
    bodyText("SOP/DP/QA/010/F02-R04", { sz: 18 }),
    coverTable(),
    pageBreak(),

    heading("TABLE OF CONTENTS"),
    tocTable(),
    pageBreak(),

    heading("A. PRE-APPROVAL (Before Implementation):"),
    signatureTable(),
    bodyText(
      "Note: Number of rows can be added or deleted based on the number of risk assessment team members."
    ),
    para(tagRun("{preApproval}")),
    pageBreak(),

    heading("1. DETAILS OF THE RISK ASSESSMENT"),
    heading("1.1 OBJECTIVE"),
    field("objectiveXml"),
    heading("1.2 SCOPE"),
    field("scopeXml"),
    heading("1.3 SYSTEM / EQUIPMENT / INSTRUMENT / OTHER (IF ANY) OVERVIEW"),
    field("overviewXml"),
    heading("1.4 PROCEDURE"),
    field("procedureXml"),
    heading("1.5 RISK ASSESSMENT TEAM MEMBERS"),
    field("teamTableXml"),
    heading("1.6 RISK IDENTIFICATION"),
    field("identificationTableXml"),
    heading("1.7 RISK MEASUREMENT BY FAILURE MODE EFFECT ANALYSIS"),
    bodyText(
      "Risk is measured by Failure Mode and Effect Analysis (FMEA). Quantitative assessments use Severity, Probability and Detectability ranked 1–5 and compute RPN = S × P × D. Qualitative assessments use Low / Medium / High ranks and the RPR matrix. Risk IDs start at R01."
    ),
    heading("1.8 RISK ASSESSMENT APPROACH"),
    para(
      textRun("Mode: ", { bold: true, sz: 20 }) + tagRun("{assessmentMode}", { sz: 20 })
    ),
    para(
      textRun("A02 — Impact known: ", { sz: 20 }) +
        tagRun("{impactKnown}", { sz: 20 }) +
        textRun("    Scope defined: ", { sz: 20 }) +
        tagRun("{scopeDefined}", { sz: 20 }) +
        textRun("    Scope narrow: ", { sz: 20 }) +
        tagRun("{scopeNarrow}", { sz: 20 })
    ),
    field("approachXml"),
    pageBreak(),

    heading(
      "2. RISK IDENTIFICATION AND EVALUATION CONSIDERING CURRENT CONTROL MEASURES"
    ),
    field("fmeaNarrativeXml"),
    field("fmeaTableXml"),
    bodyText(
      "Write RPN (quantitative) or RPR (qualitative) in the combined score column, according to the approach in 1.8."
    ),
    pageBreak(),

    heading("3. RISK COMMUNICATION"),
    field("communicationXml"),
    field("communicationTableXml"),
    heading("3.1 RISK ASSESSMENT SUMMARY AND CONCLUSION (Before Implementation):"),
    field("preConclusionXml"),
    pageBreak(),

    heading("4. MITIGATION PLAN AND CLOSURE"),
    field("mitigationXml"),
    field("mitigationTableXml"),
    heading("4.1 NEW RISK IDENTIFIED DURING EXECUTION / RESIDUAL RISK (IF ANY)"),
    bodyText(
      "In case of identification of new risk, refer SOP/DP/QA/010/F04. Residual / new risk shall be evaluated."
    ),
    field("residualXml"),
    field("residualTableXml"),
    heading("4.2 PERIODIC REVIEW OF IDENTIFIED RISKS"),
    bodyText(
      "Temporary changes shall not be considered for periodic review. Risk assessments that can impact product quality, safety, identity, purity or strength shall be considered for periodic review."
    ),
    para(
      textRun("Applicable (Yes / No): ", { bold: true, sz: 20 }) +
        tagRun("{periodicApplicable}", { sz: 20 })
    ),
    field("periodicXml"),
    heading("4.3 RISK ASSESSMENT SUMMARY AND CONCLUSION (After Implementation):"),
    field("postConclusionXml"),
    pageBreak(),

    heading("B. REVISION HISTORY:"),
    field("revisionHistoryTableXml"),
    heading("C. POST-APPROVAL (After Implementation):"),
    signatureTable(),
    para(tagRun("{postApproval}")),
  ].join("");
}

function patchHeader(xml) {
  let out = xml;
  if (!out.includes("Investigation Report")) {
    throw new Error("Expected Investigation Report in header2.xml");
  }
  out = out.replace("<w:t>Investigation Report</w:t>", "<w:t>Quality Risk Assessment</w:t>");
  out = out.replace(
    "<w:t>Ref</w:t>",
    "<w:t>Standard Operating Procedure</w:t>"
  );
  out = out.replace("<w:t>e</w:t>", "<w:t></w:t>");
  out = out.replace("<w:t>rence SOP No.:</w:t>", "<w:t></w:t>");
  // Drop the SOP/DP/QA/008 fragment from the top line; it lives in the new row.
  out = out.replace("<w:t>SOP/</w:t>", "<w:t></w:t>");
  out = out.replace("<w:t>DP/</w:t>", "<w:t></w:t>");
  out = out.replace("<w:t>QA</w:t>", "<w:t></w:t>");
  out = out.replace("<w:t>/008</w:t>", "<w:t></w:t>");

  const metaRow = `<w:tr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/><w:gridSpan w:val="2"/><w:vAlign w:val="center"/></w:tcPr><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${TBL_BORDERS}</w:tblPr><w:tblGrid><w:gridCol w:w="3486"/><w:gridCol w:w="3486"/><w:gridCol w:w="3487"/></w:tblGrid><w:tr>${cellPara(3486, textRun("Dept.: Quality Assurance", { bold: true, sz: 18 }))}${cellPara(3486, textRun("SOP No.: SOP/DP/QA/010", { bold: true, sz: 18 }))}${cellPara(3487, textRun("Revision No: R04", { bold: true, sz: 18 }))}</w:tr></w:tbl><w:p/></w:tc></w:tr>`;
  const tblClose = out.lastIndexOf("</w:tbl>");
  if (tblClose < 0) throw new Error("header2.xml has no table");
  out = out.slice(0, tblClose) + metaRow + out.slice(tblClose);
  return out;
}

function patchFooter(xml) {
  if (!xml.includes("/DP/QA/008/F04")) {
    throw new Error("Expected SOP/DP/QA/008/F04 in footer1.xml");
  }
  let out = xml.replace(
    "<w:t>/DP/QA/008/F04</w:t>",
    "<w:t>/DP/QA/010/F02-R04</w:t>"
  );
  out = out.replace("<w:t>-R0</w:t>", "<w:t></w:t>");
  out = out.replace(
    '<w:r w:rsidR="00421388"><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>2</w:t></w:r>',
    ""
  );
  return out;
}

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
console.log(`Wrote ${path.relative(ROOT, DEST)}`);
console.log(`  media: ${media.join(", ")}`);
console.log(
  `  header title: ${/Quality Risk Assessment/.test(out.file("word/header2.xml").asText())}`
);
console.log(
  `  footer form: ${/F02-R04/.test(out.file("word/footer1.xml").asText())}`
);
