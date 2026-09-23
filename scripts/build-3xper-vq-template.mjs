/**
 * Builds templates/3xper-vendor-qualification-template.docx from the A4
 * generic document template: swap the header logo, retitle header/footer to
 * QAD-SOP-MS-001-F04, and rewrite the body to Cover + A–N + scoring.
 *
 * PizZip is used (not Python zipfile) so [Content_Types].xml stays the first
 * entry — Word rejects the file otherwise.
 *
 *   node scripts/build-3xper-vq-template.mjs
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "templates/generic-document-template.docx");
const DEST = path.join(
  ROOT,
  "templates/3xper-vendor-qualification-template.docx"
);
const LOGO = path.join(ROOT, "public/logo-3xper.png");

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

function textRun(text, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function tagRun(tag, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${tag}</w:t></w:r>`;
}

function para(runs, extraPPr = "") {
  return `<w:p><w:pPr><w:spacing w:before="80" w:after="80"/>${extraPPr}</w:pPr>${runs}</w:p>`;
}

function heading(text, sz = 24) {
  return para(
    textRun(text, { bold: true, sz }),
    `<w:spacing w:before="240" w:after="80"/>`
  );
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

function cellPara(width, runs, { span = 1, fill = null } = {}) {
  const spanXml = span > 1 ? `<w:gridSpan w:val="${span}"/>` : "";
  const fillXml = fill
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`
    : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${spanXml}${fillXml}<w:vAlign w:val="center"/></w:tcPr>${para(runs, '<w:spacing w:before="40" w:after="40"/>')}</w:tc>`;
}

function tbl(colWidths, rowXml) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const grid = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/>${TBL_BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`;
}

function tr(cells) {
  return `<w:tr>${cells}</w:tr>`;
}

function identityTable() {
  const labelW = 3600;
  const valueW = 6800;
  const row = (label, tag) =>
    tr(
      cellPara(labelW, textRun(label, { bold: true, sz: 18 }), { fill: "E7E6E6" }) +
        cellPara(valueW, tagRun(tag, { sz: 18 }))
    );
  return tbl(
    [labelW, valueW],
    row("Form number", "{formNo}") +
      row("Revision", "{revision}") +
      row("VQ number", "{documentNo}") +
      row("Date", "{date}")
  );
}

const SECTIONS = [
  ["COVER — 3xPER ISSUANCE", "vqCoverXml", "vqCoverNarrativeXml", null],
  [
    "A. GENERAL COMPANY INFORMATION AND QUALITY MANAGEMENT",
    "vqSectionAXml",
    "vqSectionANarrativeXml",
    "vqSectionATableXml",
  ],
  [
    "B. TSE/BSE RISK ANALYSIS SURVEY",
    "vqSectionBXml",
    "vqSectionBNarrativeXml",
    null,
  ],
  [
    "C. TRACEABILITY OF INGREDIENTS POTENTIALLY DERIVED FROM GMO",
    "vqSectionCXml",
    "vqSectionCNarrativeXml",
    null,
  ],
  ["D. ALLERGEN", "vqSectionDXml", "vqSectionDNarrativeXml", null],
  [
    "E. EXTENDED QUALITY QUESTIONNAIRE",
    "vqSectionEXml",
    "vqSectionENarrativeXml",
    null,
  ],
  ["F. PACKAGING MATERIAL", "vqSectionFXml", "vqSectionFNarrativeXml", null],
  [
    "G. ELEMENTAL IMPURITIES QUESTIONNAIRE",
    "vqSectionGXml",
    "vqSectionGNarrativeXml",
    "vqSectionGTableXml",
  ],
  [
    "H. RESIDUAL SOLVENT QUESTIONNAIRE",
    "vqSectionHXml",
    "vqSectionHNarrativeXml",
    "vqSectionHTableXml",
  ],
  [
    "I. POTENTIAL GENOTOXIC IMPURITY (PGI) QUESTIONNAIRE",
    "vqSectionIXml",
    "vqSectionINarrativeXml",
    "vqSectionITableXml",
  ],
  [
    "J. NITROSAMINE IMPURITY QUESTIONNAIRE",
    "vqSectionJXml",
    "vqSectionJNarrativeXml",
    "vqSectionJTableXml",
  ],
  ["K. WILLINGNESS TO INSPECTION", "vqSectionKXml", "vqSectionKNarrativeXml", null],
  ["L. CHANGE NOTIFICATION", "vqSectionLXml", "vqSectionLNarrativeXml", null],
  ["M. QUALITY AGREEMENT", "vqSectionMXml", "vqSectionMNarrativeXml", null],
  [
    "N. AUDIT CHECKLIST",
    "vqSectionNXml",
    "vqSectionNNarrativeXml",
    "vqSectionNTableXml",
  ],
  [
    "APPROVAL OF VENDOR QUALIFICATION (3xPER INNOVENTURE LTD)",
    "vqScoringXml",
    "vqScoringNarrativeXml",
    null,
  ],
];

function bodyXml() {
  const chunks = [
    para(
      textRun("VENDOR QUALIFICATION FOR KSM/KRM/ CRITICAL RAW MATERIALS", {
        bold: true,
        sz: 28,
      }),
      `<w:jc w:val="center"/>`
    ),
    para(
      textRun("QAD-SOP-MS-001-F04  Rev 01", { bold: true, sz: 20 }),
      `<w:jc w:val="center"/>`
    ),
    bodyText(
      "3xper Innoventure Ltd, Plot No. 53, Part 54 & 55, Palachur Village, Naidupeta SEZ – 524421"
    ),
    identityTable(),
    pageBreak(),
  ];
  for (const [title, fieldsTag, narrativeTag, tableTag] of SECTIONS) {
    chunks.push(heading(title));
    chunks.push(field(fieldsTag));
    if (narrativeTag) chunks.push(field(narrativeTag));
    if (tableTag) chunks.push(field(tableTag));
    chunks.push(pageBreak());
  }
  return chunks.join("");
}

function patchHeader(xml) {
  let out = xml.replaceAll("<w:t>Andrei</w:t>", "<w:t>3xper</w:t>");
  out = out.replace(
    "<w:t>Investigation Report</w:t>",
    "<w:t>Vendor Qualification</w:t>"
  );
  out = out.replace(
    "<w:t xml:space=\"preserve\">                      </w:t>",
    "<w:t xml:space=\"preserve\">MASTER COPY</w:t>"
  );
  return out;
}

function patchFooter(xml) {
  let out = xml.replace(
    "<w:t>Andrei — Document Review</w:t>",
    "<w:t>Prepared: Anantha Kumar D · Reviewed: Sarat Kumar Y · Approved: Narayan Kumar S</w:t>"
  );
  out = out.replace("<w:t>SOP</w:t>", "<w:t>QAD</w:t>");
  out = out.replace(
    "<w:t>/DP/QA/008/F04</w:t>",
    "<w:t>-SOP-MS-001-F04</w:t>"
  );
  out = out.replace("<w:t>-R0</w:t>", "<w:t> Rev </w:t>");
  out = out.replace(
    '<w:r w:rsidR="00421388"><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>2</w:t></w:r>',
    "<w:r><w:rPr><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/></w:rPr><w:t>01</w:t></w:r>"
  );
  return out;
}

if (!fs.existsSync(SOURCE)) {
  throw new Error(`Missing source template: ${SOURCE}`);
}
if (!fs.existsSync(LOGO)) {
  throw new Error(`Missing 3xper logo: ${LOGO}`);
}

const zip = new PizZip(fs.readFileSync(SOURCE));
if (!zip.file("word/media/image1.png")) {
  throw new Error("Source generic template is missing word/media/image1.png");
}
zip.file("word/media/image1.png", fs.readFileSync(LOGO));

const documentXml = zip.file("word/document.xml").asText();
const bodyOpen = documentXml.indexOf("<w:body>");
const sectPr = documentXml.lastIndexOf("<w:sectPr");
if (bodyOpen < 0 || sectPr < 0) {
  throw new Error("Could not find w:body / w:sectPr in the generic template");
}
zip.file(
  "word/document.xml",
  documentXml.slice(0, bodyOpen + "<w:body>".length) +
    bodyXml() +
    documentXml.slice(sectPr)
);

zip.file("word/header2.xml", patchHeader(zip.file("word/header2.xml").asText()));
zip.file("word/footer1.xml", patchFooter(zip.file("word/footer1.xml").asText()));

fs.writeFileSync(DEST, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));

const out = new PizZip(fs.readFileSync(DEST));
console.log(`Wrote ${path.relative(ROOT, DEST)}`);
console.log(
  `  header: ${/Vendor Qualification/.test(out.file("word/header2.xml").asText())}`
);
console.log(
  `  footer form: ${/MS-001-F04/.test(out.file("word/footer1.xml").asText())}`
);
console.log(
  `  cover tag: ${/vqCoverXml/.test(out.file("word/document.xml").asText())}`
);
