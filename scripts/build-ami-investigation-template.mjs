/**
 * Clones MJ's investigation Word template and rebrands the chrome for Ami
 * Lifesciences. Body placeholders (DMAIC `{@defineNarrativeXml}` etc.) stay
 * identical so export and Word import keep working.
 *
 *   node scripts/build-ami-investigation-template.mjs
 *
 * PizZip is used (not Python zipfile) so [Content_Types].xml stays the first
 * entry — Word rejects the file otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "templates/mj-investigation-report-template.docx");
const DEST = path.join(ROOT, "templates/ami-investigation-report-template.docx");
const LOGO = path.join(ROOT, "public/logo-ami-mark.png");

function rebrandHeader(xml) {
  return xml
    .replaceAll("<w:t xml:space=\"preserve\">M.J. </w:t>", "<w:t>Ami Lifesciences </w:t>")
    .replaceAll("<w:t>Biopharm Private Limited</w:t>", "<w:t>Pvt. Ltd.</w:t>")
    .replaceAll(
      "<w:t>Plot No. 18, International Biotech Park, Hinjawadi</w:t>",
      "<w:t>7th Floor, 1038 Lilleria, Gotri-Sevasi Road</w:t>"
    )
    .replaceAll(
      "<w:t xml:space=\"preserve\"> Phase II, Pune 411057</w:t>",
      "<w:t xml:space=\"preserve\"> New Alkapuri, Vadodara 390021</w:t>"
    )
    .replaceAll("<w:t>Unit: Drug Product</w:t>", "<w:t>Unit: API</w:t>")
    .replaceAll("<w:t>SOP/</w:t>", "<w:t>Investigation SOP</w:t>")
    .replaceAll("<w:t>DP/</w:t>", "<w:t></w:t>")
    .replaceAll("<w:t>QA</w:t>", "<w:t></w:t>")
    .replaceAll("<w:t>/008</w:t>", "<w:t></w:t>");
}

function rebrandFooter(xml) {
  return xml
    .replaceAll("<w:t>/DP/QA/008/F04</w:t>", "<w:t></w:t>")
    .replaceAll("<w:t>-R0</w:t>", "<w:t></w:t>")
    .replace(
      '<w:r w:rsidR="00F04DE5"><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>SOP</w:t></w:r>',
      '<w:r w:rsidR="00F04DE5"><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t></w:t></w:r>'
    )
    .replace(
      '<w:r w:rsidR="00421388"><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>2</w:t></w:r>',
      '<w:r w:rsidR="00421388"><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t></w:t></w:r>'
    );
}

function main() {
  const zip = new PizZip(fs.readFileSync(SOURCE));
  const header2 = zip.file("word/header2.xml")?.asText();
  const footer1 = zip.file("word/footer1.xml")?.asText();
  if (!header2 || !footer1) {
    throw new Error("MJ investigation template is missing header2/footer1");
  }
  zip.file("word/header2.xml", rebrandHeader(header2));
  zip.file("word/footer1.xml", rebrandFooter(footer1));
  zip.file("word/media/image1.png", fs.readFileSync(LOGO));
  fs.writeFileSync(DEST, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`wrote ${path.relative(ROOT, DEST)}`);
}

main();
