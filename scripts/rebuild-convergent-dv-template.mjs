/**
 * Rebuild templates/convergent-design-verification-report-template.docx from
 * convergent/dvreportrecipe/DV Test Report Template.docx (gitignored). Uses PizZip so
 * [Content_Types].xml stays first — rewriting with Python zipfile breaks Word.
 */
import fs from "node:fs";
import path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import PizZip from "pizzip";

const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ROOT = process.cwd();
const SOURCE = path.join(
  ROOT,
  "convergent/dvreportrecipe/DV Test Report Template.docx"
);
const DEST = path.join(
  ROOT,
  "templates/convergent-design-verification-report-template.docx"
);

const zip = new PizZip(fs.readFileSync(SOURCE));

function elements(node, local) {
  return Array.from(node.childNodes ?? []).filter(
    (n) => n.nodeType === 1 && n.localName === local
  );
}

function paragraphText(p) {
  const texts = p.getElementsByTagNameNS(WNS, "t");
  let out = "";
  for (let i = 0; i < texts.length; i++) out += texts[i].textContent ?? "";
  return out.replace(/\s+/g, " ").trim();
}

function cloneFirstRun(fromP, doc) {
  const runs = fromP.getElementsByTagNameNS(WNS, "r");
  if (runs.length > 0) return runs[0].cloneNode(true);
  const r = doc.createElement("w:r");
  const t = doc.createElement("w:t");
  r.appendChild(t);
  return r;
}

function setRunText(run, text) {
  const texts = run.getElementsByTagNameNS(WNS, "t");
  let t = texts[0];
  if (!t) {
    t = run.ownerDocument.createElement("w:t");
    run.appendChild(t);
  }
  while (texts.length > 1) {
    texts[texts.length - 1].parentNode.removeChild(texts[texts.length - 1]);
  }
  if (text.startsWith(" ") || text.endsWith(" ")) {
    t.setAttribute("xml:space", "preserve");
  }
  t.textContent = text;
}

function stripRunsAndBookmarks(p) {
  for (const child of Array.from(p.childNodes)) {
    if (child.nodeType !== 1) continue;
    if (child.localName === "pPr") continue;
    p.removeChild(child);
  }
}

function setParagraphText(p, text) {
  const run = cloneFirstRun(p, p.ownerDocument);
  stripRunsAndBookmarks(p);
  setRunText(run, text);
  p.appendChild(run);
}

function makePlaceholder(templateP, tag) {
  const p = templateP.cloneNode(true);
  setParagraphText(p, `{@${tag}}`);
  return p;
}

function setCellText(tc, text) {
  const paras = tc.getElementsByTagNameNS(WNS, "p");
  const p = paras[0];
  if (!p) return;
  setParagraphText(p, text);
}

function recolorXml(xml) {
  return xml
    .replace(/w:val="0070C0"/gi, 'w:val="000000"')
    .replace(/ w:themeColor="text2"/g, "")
    .replace(/ w:themeColor="text1"/g, "");
}

const parser = new DOMParser();
const serializer = new XMLSerializer();
const documentXml = zip.file("word/document.xml").asText();
const doc = parser.parseFromString(documentXml, "text/xml");
const parseErr = doc.getElementsByTagName("parsererror")[0];
if (parseErr) throw new Error(parseErr.textContent ?? "parse error");

const body = doc.getElementsByTagNameNS(WNS, "body")[0];
const kids = Array.from(body.childNodes).filter((n) => n.nodeType === 1);

const tables = kids.filter((n) => n.localName === "tbl");
const coverTbl = tables[0];
const revTbl = tables[tables.length - 1];
const sectPr = kids.find((n) => n.localName === "sectPr");
const spacer = kids.find((n) => n.localName === "p" && paragraphText(n) === "");

function findP(pred) {
  const hit = kids.find((n) => n.localName === "p" && pred(paragraphText(n)));
  if (!hit) throw new Error(`missing paragraph: ${pred}`);
  return hit;
}

const purposeP = findP((t) => t === "PURPOSE:" || t.startsWith("PURPOSE"));
const testersP = findP((t) => t.startsWith("Testers/Dates"));
const methodsP = findP((t) => t === "Methods of Measurement");
const equipmentP = findP((t) => t.startsWith("Test Equipment"));
const deviationsP = findP((t) => t.startsWith("Deviations"));
const resultsP = findP((t) => t.startsWith("Results and Discussion"));
const problemsP = findP((t) => t.startsWith("Problem or Failure Resolution"));
const conclusionP = findP((t) => t.startsWith("Conclusion"));
const revHistoryP = findP((t) => t.startsWith("Revision History"));
const captionSrc = findP((t) => t.startsWith("Table 1"));

const scopeP = purposeP.cloneNode(true);
setParagraphText(purposeP, "PURPOSE:");
setParagraphText(scopeP, "SCOPE:");
setParagraphText(testersP, "Testers/Dates:");
setParagraphText(methodsP, "Methods of Measurement");
setParagraphText(equipmentP, "Test Equipment:");
setParagraphText(deviationsP, "Deviations:");
setParagraphText(resultsP, "Results and Discussion:");
setParagraphText(problemsP, "Problem or Failure Resolution:");
setParagraphText(conclusionP, "Conclusion:");
setParagraphText(revHistoryP, "Revision History");

const coverRows = elements(coverTbl, "tr");
const coverCells = elements(coverRows[0], "tc");
setCellText(coverCells[1], "{productName}");
setCellText(coverCells[3], "{documentNo}");

const revRows = elements(revTbl, "tr");
for (const row of revRows.slice(2)) {
  row.parentNode.removeChild(row);
}
if (revRows[1]) {
  for (const cell of elements(revRows[1], "tc")) {
    const paras = cell.getElementsByTagNameNS(WNS, "p");
    if (paras[0]) setParagraphText(paras[0], "");
  }
}

const caption = captionSrc.cloneNode(true);
setParagraphText(caption, "Table 4: Requirements Verified");
const placeholderSrc = spacer ?? purposeP;

const rebuilt = [
  coverTbl,
  spacer,
  purposeP,
  makePlaceholder(placeholderSrc, "purposeXml"),
  scopeP,
  makePlaceholder(placeholderSrc, "scopeXml"),
  testersP,
  makePlaceholder(placeholderSrc, "testersXml"),
  methodsP,
  makePlaceholder(placeholderSrc, "methodsXml"),
  equipmentP,
  makePlaceholder(placeholderSrc, "equipmentXml"),
  deviationsP,
  makePlaceholder(placeholderSrc, "deviationsXml"),
  resultsP,
  makePlaceholder(placeholderSrc, "resultsDiscussionXml"),
  caption,
  makePlaceholder(placeholderSrc, "resultsTableXml"),
  problemsP,
  makePlaceholder(placeholderSrc, "problemsXml"),
  conclusionP,
  makePlaceholder(placeholderSrc, "conclusionXml"),
  revHistoryP,
  revTbl,
  sectPr,
].filter(Boolean);

while (body.firstChild) body.removeChild(body.firstChild);
for (const node of rebuilt) body.appendChild(node);

let outDoc = serializer.serializeToString(doc);
if (!outDoc.startsWith("<?xml")) {
  outDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${outDoc}`;
}
zip.file("word/document.xml", recolorXml(outDoc));

const headerXml = parser.parseFromString(
  zip.file("word/header1.xml").asText(),
  "text/xml"
);
const headerParas = Array.from(headerXml.getElementsByTagNameNS(WNS, "p"));
const headerWithText = headerParas.filter((p) => paragraphText(p).length > 0);
if (headerWithText.length < 2) {
  throw new Error(`expected 2 header text paragraphs, got ${headerWithText.length}`);
}
setParagraphText(
  headerWithText[0],
  "{productName} Software Design Verification Report"
);
setParagraphText(headerWithText[1], "{documentNo}, Rev. {revision}");
zip.file(
  "word/header1.xml",
  recolorXml(serializer.serializeToString(headerXml))
);

for (const name of zip.file(/.+\.(xml|rels)$/).map((f) => f.name)) {
  if (name === "word/document.xml" || name === "word/header1.xml") continue;
  zip.file(name, recolorXml(zip.file(name).asText()));
}

const buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(DEST, buffer);
console.log("wrote", DEST, buffer.length);
