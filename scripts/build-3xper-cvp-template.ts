/**
 * Build templates/3xper-cleaning-verification-protocol-template.docx from the
 * filled QAD-SOP-PS-003-F08-00 example. Keep page chrome (A4, borders, header
 * logo, footer Format No.). Replace the 96-page body with cover identity tags
 * plus `{@cvp_*Xml}` slots. Drop body figures (media/image1–8); keep image9
 * (header logo).
 *
 *   pnpm build-cvp-template
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import {
  childElements,
  elementText,
  isElement,
  setParagraphText,
  splitTopLevelElements,
  withChildren,
} from "../src/lib/export/qsr/ooxml";
import { CVP_SECTION_KEYS } from "../src/lib/document-types/cvp/sections";
import {
  cvpTemplateHeadingSpec,
  cvpHeadingParagraphXml,
  cvpWordTocXml,
} from "../src/lib/export/cvp-docx-format";

const SOURCE = path.join(
  process.cwd(),
  "docs/sample_files/3xper-cleaning-verification-protocol-source.docx"
);
const OUTPUT = path.join(
  process.cwd(),
  "templates",
  "3xper-cleaning-verification-protocol-template.docx"
);

function fail(message: string): never {
  throw new Error(`build-3xper-cvp-template: ${message}`);
}

function cleanXml(xml: string): string {
  return xml
    .replace(/\s(?:w:rsid\w*|w14:paraId|w14:textId)="[^"]*"/g, "")
    .replace(/<w:bookmarkStart\b[^>]*\/>/g, "")
    .replace(/<w:bookmarkEnd\b[^>]*\/>/g, "")
    .replace(/<w:proofErr\b[^>]*\/>/g, "")
    .replace(/<w:highlight\b[^>]*\/>/g, "");
}

function expectText(actual: string, expected: string, where: string) {
  if (actual.trim() !== expected) {
    fail(`${where}: expected "${expected}", found "${actual.trim().slice(0, 80)}"`);
  }
}

function tableRows(tbl: string): string[] {
  return childElements(tbl).filter((child) => isElement(child, "w:tr"));
}

function rowCells(tr: string): string[] {
  return childElements(tr).filter((child) => isElement(child, "w:tc"));
}

function setCellParagraph(tc: string, paraIndex: number, text: string): string {
  let i = -1;
  return withChildren(
    tc,
    childElements(tc).map((child) => {
      if (!isElement(child, "w:p")) return child;
      i += 1;
      return i === paraIndex ? setParagraphText(child, text) : child;
    })
  );
}

function replaceCell(
  tr: string,
  cellIndex: number,
  paraIndex: number,
  text: string
): string {
  let i = -1;
  return withChildren(
    tr,
    childElements(tr).map((child) => {
      if (!isElement(child, "w:tc")) return child;
      i += 1;
      return i === cellIndex ? setCellParagraph(child, paraIndex, text) : child;
    })
  );
}

function mapRows(tbl: string, fn: (tr: string, index: number) => string): string {
  let i = -1;
  return withChildren(
    tbl,
    childElements(tbl).map((child) => {
      if (!isElement(child, "w:tr")) return child;
      i += 1;
      return fn(child, i);
    })
  );
}

function tagCoverTable(tbl: string): string {
  const tags = [
    "{productName}",
    "{productCode}",
    "{stage}",
    "{plant}",
  ] as const;
  const labels = [
    "Name of the product",
    "Product Code",
    "Stage",
    "Plant",
  ] as const;
  return mapRows(tbl, (tr, i) => {
    const cells = rowCells(tr);
    expectText(elementText(cells[0] ?? ""), labels[i] ?? "", `cover row ${i} label`);
    return replaceCell(tr, 2, 0, tags[i] ?? fail(`cover row ${i}`));
  });
}

function tagHeaderTable(tbl: string, withEffectiveDate: boolean): string {
  const rows = tableRows(tbl);
  if (rows.length < 4) fail("header table is missing identity rows");
  expectText(
    elementText(rowCells(rows[1] ?? "")[1] ?? "").slice(0, 16),
    "Document Title:",
    "header document title"
  );
  expectText(elementText(rowCells(rows[2] ?? "")[0] ?? ""), "Department", "header department");
  expectText(elementText(rowCells(rows[3] ?? "")[0] ?? ""), "Protocol No.", "header protocol");
  let out = tbl;
  out = mapRows(out, (tr, i) => {
    if (i === 1) return replaceCell(tr, 1, 1, "{documentTitle}");
    if (i === 2) return replaceCell(tr, 1, 0, "{department}");
    if (i === 3) {
      return replaceCell(replaceCell(tr, 1, 0, "{documentNo}"), 3, 0, "{version}");
    }
    if (withEffectiveDate && i === 4) {
      expectText(elementText(rowCells(tr)[2] ?? ""), "Effective Date", "header effective date");
      return replaceCell(tr, 3, 0, "{effectiveDate}");
    }
    return tr;
  });
  return out;
}

function tagHeaderPart(xml: string, withEffectiveDate: boolean): string {
  const openEnd = xml.indexOf(">", xml.indexOf("<w:hdr")) + 1;
  const close = xml.lastIndexOf("</w:hdr>");
  const inner = splitTopLevelElements(xml.slice(openEnd, close)).map((el) =>
    isElement(el, "w:tbl") ? tagHeaderTable(el, withEffectiveDate) : el
  );
  return `${xml.slice(0, openEnd)}${inner.join("")}</w:hdr>`;
}

const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/** 15.N headings live in `{@cvp_equipment_samplingXml}`, not a wrapper H1. */
const CVP_SKIP_BODY_HEADING = new Set(["cvp_equipment_sampling"]);

function rawXmlPara(tag: string): string {
  return `<w:p><w:r><w:t>{@${tag}}</w:t></w:r></w:p>`;
}

function sectionBody(): string[] {
  const out: string[] = [PAGE_BREAK, cvpWordTocXml(), PAGE_BREAK];
  for (const key of CVP_SECTION_KEYS) {
    if (!CVP_SKIP_BODY_HEADING.has(key)) {
      const spec = cvpTemplateHeadingSpec(key);
      out.push(cvpHeadingParagraphXml(spec.text, spec.ilvl));
    }
    out.push(rawXmlPara(`${key}Xml`));
  }
  return out;
}

function stripBodyImageRels(xml: string): string {
  return xml.replace(
    /<Relationship [^>]*Target="media\/image[1-8]\.png"[^>]*\/>/g,
    ""
  );
}

function main() {
  const fromSource = fs.existsSync(SOURCE);
  const zip = new PizZip(fs.readFileSync(fromSource ? SOURCE : OUTPUT));
  const documentXml = zip.file("word/document.xml")?.asText() ?? fail("no document.xml");
  const bodyStart = documentXml.indexOf("<w:body>") + "<w:body>".length;
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  const els = splitTopLevelElements(cleanXml(documentXml.slice(bodyStart, bodyEnd)));
  const coverTableIdx = els.findIndex(
    (el) => el.startsWith("<w:tbl") && elementText(el).includes("Name of the product")
  );
  if (coverTableIdx < 0) fail("cover identity table moved");
  const sectPr = els.at(-1);
  if (!sectPr?.startsWith("<w:sectPr")) fail("final sectPr moved");

  const cover = fromSource
    ? [...els.slice(0, coverTableIdx), tagCoverTable(els[coverTableIdx]!)]
    : els.slice(0, coverTableIdx + 1);
  const body = [...cover, ...sectionBody(), sectPr];
  zip.file(
    "word/document.xml",
    `${documentXml.slice(0, bodyStart)}${body.join("")}${documentXml.slice(bodyEnd)}`
  );

  if (fromSource) {
    zip.file(
      "word/header1.xml",
      tagHeaderPart(cleanXml(zip.file("word/header1.xml")?.asText() ?? fail("no header1")), false)
    );
    zip.file(
      "word/header2.xml",
      tagHeaderPart(cleanXml(zip.file("word/header2.xml")?.asText() ?? fail("no header2")), true)
    );
    for (const name of ["word/footer1.xml", "word/footer2.xml"]) {
      const file = zip.file(name);
      if (file) zip.file(name, cleanXml(file.asText()));
    }

    const rels = zip.file("word/_rels/document.xml.rels")?.asText() ?? fail("no rels");
    zip.file("word/_rels/document.xml.rels", stripBodyImageRels(rels));
    for (let i = 1; i <= 8; i += 1) {
      zip.remove(`word/media/image${i}.png`);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(
    `Wrote ${path.relative(process.cwd(), OUTPUT)}${fromSource ? "" : " (body headings + TOC)"}`
  );
}

main();
