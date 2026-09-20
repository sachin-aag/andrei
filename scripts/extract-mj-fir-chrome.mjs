/**
 * One-shot: extract the page chrome from a real SOP/QA/017-F01 report into
 * templates/mj-fir-chrome.docx, which build-mj-fir-template.mjs then clones.
 *
 * Why an intermediate file rather than reading the real report directly:
 * the source is a filled customer document carrying 362 tracked insertions,
 * 187 deletions and 78 review comments, and it is not tracked in git. The
 * chrome we actually want is the header (logo, company block, "Investigation
 * Report", the SOP/Unit line), the footer, styles, theme and fonts — none of
 * which contain report data.
 *
 *   node scripts/extract-mj-fir-chrome.mjs "docs/sample_files/<report>.docx"
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const ROOT = process.cwd();
const SOURCE =
  process.argv[2] ??
  path.join(
    ROOT,
    "docs/sample_files/Investigation report_ERF-26-022 11.09.2026.docx"
  );
const DEST = path.join(ROOT, "templates/mj-fir-chrome.docx");

/** Parts that carry review history or body content — never copied. */
const DROP_EXACT = new Set([
  "word/document.xml",
  "word/comments.xml",
  "word/commentsExtended.xml",
  "word/commentsIds.xml",
  "word/commentsExtensible.xml",
  "word/people.xml",
  "docProps/core.xml",
  "docProps/app.xml",
  "docProps/custom.xml",
]);

const DROP_PREFIX = ["customXml/"];

if (!fs.existsSync(SOURCE)) {
  console.error(`Source report not found: ${SOURCE}`);
  console.error("Pass the path to a real SOP/QA/017-F01 report as argv[2].");
  process.exit(1);
}

const src = new PizZip(fs.readFileSync(SOURCE));

const headerRels = src.file("word/_rels/header1.xml.rels")?.asText();
if (!headerRels) throw new Error("Source has no word/_rels/header1.xml.rels");
const logo = [...headerRels.matchAll(/Target="(media\/[^"]+)"/g)].map(
  (m) => `word/${m[1]}`
);
if (logo.length === 0) throw new Error("Header references no image");

const keepMedia = new Set(logo);

const out = new PizZip();

// [Content_Types].xml must stay the first entry or Word rejects the file.
const types = src.file("[Content_Types].xml").asText();
out.file("[Content_Types].xml", stripContentTypes(types));

for (const name of Object.keys(src.files)) {
  if (name === "[Content_Types].xml") continue;
  if (src.files[name].dir) continue;
  if (DROP_EXACT.has(name)) continue;
  if (DROP_PREFIX.some((p) => name.startsWith(p))) continue;
  if (name.startsWith("word/media/") && !keepMedia.has(name)) continue;

  if (name === "word/_rels/document.xml.rels") {
    out.file(name, documentRels());
    continue;
  }
  if (name === "_rels/.rels") {
    out.file(name, packageRels());
    continue;
  }
  if (name === "word/settings.xml") {
    out.file(name, stripSettings(src.file(name).asText()));
    continue;
  }
  out.file(name, src.file(name).asNodeBuffer());
}

// Minimal body. build-mj-fir-template.mjs replaces everything between
// <w:body> and <w:sectPr>; the sectPr here is the real report's page setup.
out.file("word/document.xml", emptyDocument());

fs.writeFileSync(DEST, out.generate({ type: "nodebuffer", compression: "DEFLATE" }));

function stripContentTypes(xml) {
  return xml
    .replace(/<Override[^>]*PartName="\/word\/comments[^"]*"[^>]*\/>/g, "")
    .replace(/<Override[^>]*PartName="\/word\/people\.xml"[^>]*\/>/g, "")
    .replace(/<Override[^>]*PartName="\/docProps\/[^"]*"[^>]*\/>/g, "")
    .replace(/<Override[^>]*PartName="\/customXml\/[^"]*"[^>]*\/>/g, "");
}

function packageRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
}

/** Only the parts the stripped document actually references. */
function documentRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId15" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId16" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
}

/** rsid soup is ~90KB of editing history; it has no effect on rendering. */
function stripSettings(xml) {
  return xml
    .replace(/<w:rsids>[\s\S]*?<\/w:rsids>/g, "")
    .replace(/<w:proofState[^/]*\/>/g, "");
}

function emptyDocument() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p/><w:sectPr><w:headerReference w:type="default" r:id="rId15"/><w:footerReference w:type="default" r:id="rId16"/><w:pgSz w:w="11909" w:h="16834" w:orient="portrait" w:code="9"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="1008" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="272"/></w:sectPr></w:body></w:document>`;
}

const check = new PizZip(fs.readFileSync(DEST));
console.log(`Wrote ${path.relative(ROOT, DEST)}`);
console.log(`  parts: ${Object.keys(check.files).length}`);
console.log(`  logo:  ${logo.join(", ")}`);
console.log(
  `  size:  ${(fs.statSync(DEST).size / 1024).toFixed(0)} KB (source ${(fs.statSync(SOURCE).size / 1024).toFixed(0)} KB)`
);
