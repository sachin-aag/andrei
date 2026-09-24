/**
 * Builds templates/3xper-vendor-qualification-template.docx from the A4
 * generic document template: the paper form's header table (logo, Document
 * Name / Number / Revision, Page N of M) on every page, a footer slot for the
 * per-page signature table, and one body slot. The body and footer XML are
 * generated at export time by src/lib/document-types/vq/export-xml.ts.
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

const FONT = "Times New Roman";
const W = 10440;
/** Header columns measured off the paper form (logo | label | value | page label | page value). */
const COLS = [1378, 2248, 3625, 1522, 1667];

function esc(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function rPr({ bold = false, sz = 22 } = {}) {
  return `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

function textRun(text, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function field(instr, placeholder, opts = {}) {
  return (
    `<w:r>${rPr(opts)}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr(opts)}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r>${rPr(opts)}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${rPr(opts)}<w:t>${placeholder}</w:t></w:r>` +
    `<w:r>${rPr(opts)}<w:fldChar w:fldCharType="end"/></w:r>`
  );
}

function para(runs, { jc = "left", sz = 22 } = {}) {
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:jc w:val="${jc}"/><w:rPr><w:sz w:val="${sz}"/></w:rPr></w:pPr>${runs}</w:p>`;
}

function tc(width, body, { span = 1, vMerge = null } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${vMerge ? `<w:vMerge w:val="${vMerge}"/>` : ""}<w:vAlign w:val="center"/></w:tcPr>${body}</w:tc>`;
}

function tr(cells, height) {
  return `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${height}" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>${cells}</w:tr>`;
}

const BORDER = (side) =>
  `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;

/** 3xper logo, 250x100 px at 0.85 in wide. */
function logo() {
  const cx = 777240;
  const cy = 310896;
  return `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="3xper logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo-3xper.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/** Page header: the Document Name / Number / Revision / Page No block. */
function headerTable() {
  const [logoW, labelW, valueW, pageLabelW, pageValueW] = COLS;
  const addressW = pageLabelW + pageValueW;
  const address = [
    "3xper Innoventure Ltd,",
    "Plot No. 53, Part 54 & 55,",
    "Palachur Village,",
    "Naidupeta SEZ – 524421",
  ]
    .map((line) => para(textRun(line), { jc: "center" }))
    .join("");
  const rows =
    tr(
      tc(logoW, para(logo(), { jc: "center" }), { vMerge: "restart" }) +
        tc(labelW, para(textRun("Document Name", { bold: true }))) +
        tc(
          valueW,
          para(textRun("VENDOR QUALIFICATION", { bold: true }), { jc: "center" }) +
            para(textRun("FOR KSM/KRM/ CRITICAL", { bold: true }), { jc: "center" }) +
            para(textRun("RAW MATERIALS", { bold: true }), { jc: "center" })
        ) +
        tc(addressW, address, { span: 2, vMerge: "restart" }),
      760
    ) +
    tr(
      tc(logoW, para(""), { vMerge: "continue" }) +
        tc(labelW, para(textRun("Document Number", { bold: true }))) +
        tc(valueW, para(textRun("QAD-SOP-MS-001-F04"), { jc: "center" })) +
        tc(addressW, para(""), { span: 2, vMerge: "continue" }),
      480
    ) +
    tr(
      tc(logoW, para(""), { vMerge: "continue" }) +
        tc(labelW, para(textRun("Revision Number", { bold: true }))) +
        tc(valueW, para(textRun("01", { bold: true }), { jc: "center" })) +
        tc(pageLabelW, para(textRun("Page No", { bold: true }))) +
        tc(
          pageValueW,
          para(field("PAGE", "1") + textRun(" of ") + field("NUMPAGES", "1"), {
            jc: "center",
          })
        ),
      440
    );
  const grid = COLS.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(BORDER).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

/** Word requires a paragraph after a table at the end of a header/footer. */
const TINY_PARA =
  '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>';

function headerXml(originalHeaderXml) {
  const open = originalHeaderXml.slice(
    0,
    originalHeaderXml.indexOf(">", originalHeaderXml.indexOf("<w:hdr")) + 1
  );
  return `${open}${headerTable()}${TINY_PARA}</w:hdr>`;
}

/**
 * Footer body is one raw-XML tag: the export fills in the per-page signature
 * table (Name of the Activity / Name / Designation / Signature / Date) and
 * the `Format: - QAD-SOP-MS-001-F04` line from the cover section.
 */
function footerXml(originalFooterXml) {
  const open = originalFooterXml.slice(
    0,
    originalFooterXml.indexOf(">", originalFooterXml.indexOf("<w:ftr")) + 1
  );
  return `${open}<w:p><w:r><w:t>{@vqFooterXml}</w:t></w:r></w:p></w:ftr>`;
}

function bodyXml() {
  return `<w:p><w:r><w:t>{@vqBodyXml}</w:t></w:r></w:p>`;
}

/**
 * A4, 12.7 mm side margins. The header starts 35 mm down and the footer ends
 * 30 mm up, as on the paper form — the band above the header is where 3xper
 * document control stamps MASTER COPY / Issued By / Issued On.
 */
const SECT_PR = (refs) =>
  `<w:sectPr>${refs}<w:pgSz w:w="11909" w:h="16834" w:code="9"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="1985" w:footer="1700" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="272"/></w:sectPr>`;

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
const sectPrStart = documentXml.lastIndexOf("<w:sectPr");
const sectPrEnd = documentXml.indexOf("</w:sectPr>", sectPrStart);
if (bodyOpen < 0 || sectPrStart < 0 || sectPrEnd < 0) {
  throw new Error("Could not find w:body / w:sectPr in the generic template");
}
const refs = (documentXml.slice(sectPrStart, sectPrEnd).match(
  /<w:(?:header|footer)Reference [^>]*\/>/g
) ?? []).join("");
zip.file(
  "word/document.xml",
  documentXml.slice(0, bodyOpen + "<w:body>".length) +
    bodyXml() +
    SECT_PR(refs) +
    documentXml.slice(sectPrEnd + "</w:sectPr>".length)
);

const headerRels = zip.file("word/_rels/header2.xml.rels").asText();
for (const name of ["header1", "header2", "header3"]) {
  zip.file(`word/${name}.xml`, headerXml(zip.file(`word/${name}.xml`).asText()));
  zip.file(`word/_rels/${name}.xml.rels`, headerRels);
}
zip.file("word/footer1.xml", footerXml(zip.file("word/footer1.xml").asText()));

fs.writeFileSync(DEST, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));

const out = new PizZip(fs.readFileSync(DEST));
console.log(`Wrote ${path.relative(ROOT, DEST)}`);
console.log(
  `  header: ${/QAD-SOP-MS-001-F04/.test(out.file("word/header2.xml").asText())}`
);
console.log(
  `  footer tag: ${/vqFooterXml/.test(out.file("word/footer1.xml").asText())}`
);
console.log(
  `  body tag: ${/vqBodyXml/.test(out.file("word/document.xml").asText())}`
);
