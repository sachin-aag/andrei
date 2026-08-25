import { DOMParser } from "@xmldom/xmldom";
import PizZip from "pizzip";
import fs from "node:fs";

const BLUE = "0070C0";
const zip = new PizZip(fs.readFileSync(process.argv[2]));
const xml = zip.file("word/document.xml").asText();
const doc = new DOMParser().parseFromString(xml, "text/xml");

const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const el = (n, tag) => Array.from(n.getElementsByTagNameNS(NS, tag));
const attr = (n, a) => (n && n.getAttributeNS ? n.getAttributeNS(NS, a) : null);

function runText(r) {
  let out = "";
  for (const c of Array.from(r.childNodes)) {
    if (c.nodeType !== 1) continue;
    const ln = c.localName;
    if (ln === "t") out += c.textContent;
    else if (ln === "tab") out += "\t";
    else if (ln === "br") out += "\n";
  }
  return out;
}
function runColor(r) {
  const rPr = el(r, "rPr")[0];
  if (!rPr) return null;
  const c = Array.from(rPr.childNodes).find((n) => n.nodeType === 1 && n.localName === "color");
  return c ? (attr(c, "val") || "").toUpperCase() : null;
}
function runBold(r) {
  const rPr = el(r, "rPr")[0];
  if (!rPr) return false;
  return Array.from(rPr.childNodes).some((n) => n.nodeType === 1 && n.localName === "b" && attr(n, "val") !== "0" && attr(n,"val") !== "false");
}

/** Collapse a paragraph into alternating LIT / SLOT segments. */
function segmentParagraph(p) {
  const segs = [];
  for (const r of el(p, "r")) {
    const t = runText(r);
    if (!t) continue;
    const kind = runColor(r) === BLUE ? "SLOT" : "LIT";
    const bold = runBold(r);
    const last = segs[segs.length - 1];
    if (last && last.kind === kind && last.bold === bold) last.text += t;
    else segs.push({ kind, bold, text: t });
  }
  return segs;
}
function pStyle(p) {
  const pPr = el(p, "pPr")[0];
  if (!pPr) return null;
  const s = Array.from(pPr.childNodes).find((n) => n.nodeType === 1 && n.localName === "pStyle");
  return s ? attr(s, "val") : null;
}
function numbered(p) {
  const pPr = el(p, "pPr")[0];
  if (!pPr) return false;
  return Array.from(pPr.childNodes).some((n) => n.nodeType === 1 && n.localName === "numPr");
}

const body = el(doc, "body")[0];
const out = [];
let tableIdx = 0;

function renderSegs(segs) {
  return segs
    .map((s) => {
      const txt = s.text.replace(/\s+/g, " ");
      if (!txt.trim()) return "";
      return s.kind === "SLOT" ? `{{${txt.trim()}}}` : txt;
    })
    .join("")
    .trim();
}

for (const node of Array.from(body.childNodes)) {
  if (node.nodeType !== 1) continue;
  if (node.localName === "p") {
    const segs = segmentParagraph(node);
    const line = renderSegs(segs);
    if (!line) continue;
    const st = pStyle(node);
    const tag = st ? `[${st}]` : numbered(node) ? "[list]" : "";
    const allSlot = segs.every((s) => s.kind === "SLOT" || !s.text.trim());
    const anySlot = segs.some((s) => s.kind === "SLOT" && s.text.trim());
    const mark = allSlot && anySlot ? "FULL-SLOT" : anySlot ? "MIXED" : "LITERAL";
    out.push(`P ${tag} <${mark}> ${line}`);
  } else if (node.localName === "tbl") {
    tableIdx++;
    const rows = el(node, "tr");
    out.push(`TABLE #${tableIdx}: ${rows.length} rows`);
    rows.forEach((tr, ri) => {
      const cells = Array.from(tr.childNodes).filter((n) => n.nodeType === 1 && n.localName === "tc");
      const cellTexts = cells.map((tc) => {
        const segs = [];
        for (const p of el(tc, "p")) segs.push(...segmentParagraph(p));
        return renderSegs(segs) || "";
      });
      out.push(`  R${ri} [${cells.length}] | ` + cellTexts.join(" | "));
    });
  }
}
console.log(out.join("\n"));
