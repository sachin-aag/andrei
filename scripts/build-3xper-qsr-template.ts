/**
 * Build templates/3xper-qualification-summary-report-template.docx from the
 * 3xper QAD/016/F06-00 source form.
 *
 *   pnpm build-qsr-template
 *
 * Everything outside the editable bodies (cover, sign-off, revision history,
 * Index, numbered headings, headers/footers, page borders) is kept verbatim.
 * Identity values become docxtemplater tags; each editable body becomes a
 * `[[QSR:key]]` slot holding prototype paragraphs/tables that the exporter
 * (src/lib/export/qsr/render.ts) clones.
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import {
  bookmarkXml,
  childElements,
  elementText,
  findChild,
  isElement,
  paragraphRunProperties,
  setParagraphText,
  splitTopLevelElements,
  textRunXml,
  withChildren,
} from "../src/lib/export/qsr/ooxml";
import {
  QSR_BANNER_MARKER,
  QSR_HEADING_MARKER,
  QSR_INDEX_ENTRIES,
  QSR_ROW_MARKER,
  QSR_SPACER_MARKER,
  qsrSlotEnd,
  qsrSlotStart,
} from "../src/lib/export/qsr/slots";
import type { QsrSectionKey } from "../src/lib/document-types/qsr/sections";

const SOURCE = path.join(
  process.cwd(),
  "docs/sample_files/3xper-qualification-summary-report-source.docx"
);
const OUTPUT = path.join(
  process.cwd(),
  "templates/3xper-qualification-summary-report-template.docx"
);

function fail(message: string): never {
  throw new Error(`build-3xper-qsr-template: ${message}`);
}

function cleanXml(xml: string): string {
  return xml
    .replace(/\s(?:w:rsid\w*|w14:paraId|w14:textId)="[^"]*"/g, "")
    .replace(/<w:bookmarkStart\b[^>]*\/>/g, "")
    .replace(/<w:bookmarkEnd\b[^>]*\/>/g, "")
    .replace(/<w:proofErr\b[^>]*\/>/g, "")
    .replace(/<w:highlight\b[^>]*\/>/g, "");
}

function markerParagraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function clearedCell(tc: string, text: string): string {
  const children = childElements(tc);
  const tcPr = children.find((c) => isElement(c, "w:tcPr")) ?? "";
  const firstP = children.find((c) => isElement(c, "w:p")) ?? "<w:p/>";
  return `<w:tc>${tcPr}${setParagraphText(firstP, text)}</w:tc>`;
}

function clearedRow(tr: string, marker: string): string {
  let first = true;
  const children = childElements(tr).map((child) => {
    if (!isElement(child, "w:tc")) return child;
    const cell = clearedCell(child, first ? marker : "");
    first = false;
    return cell;
  });
  return withChildren(tr, children);
}

function prototypeTable(
  tbl: string,
  spec: { headerRows: number; dataRow: number; bannerRow?: number }
): string {
  const children = childElements(tbl);
  const prefix = children.filter((c) => !isElement(c, "w:tr"));
  const rows = children.filter((c) => isElement(c, "w:tr"));
  if (rows.length <= spec.dataRow) fail("prototype row out of range");
  const kept = [
    ...rows.slice(0, spec.headerRows),
    clearedRow(rows[spec.dataRow], QSR_ROW_MARKER),
  ];
  if (spec.bannerRow !== undefined) {
    kept.push(clearedRow(rows[spec.bannerRow], QSR_BANNER_MARKER));
  }
  return withChildren(tbl, [...prefix, ...kept]);
}

function prototypeParagraph(p: string, marker = "", rPr?: string): string {
  return setParagraphText(p, marker, rPr);
}

function secondRunProperties(p: string): string {
  const runs = childElements(p).filter((c) => isElement(c, "w:r"));
  return (runs[1] && findChild(runs[1], "w:rPr")) ?? paragraphRunProperties(p);
}

function setCellText(tr: string, cellIndex: number, text: string): string {
  let i = -1;
  return withChildren(
    tr,
    childElements(tr).map((child) => {
      if (!isElement(child, "w:tc")) return child;
      i += 1;
      return i === cellIndex ? clearedCell(child, text) : child;
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

function pageRefRuns(rPr: string, bookmark: string, cached: string): string {
  const run = (inner: string) => `<w:r>${rPr}${inner}</w:r>`;
  return [
    run('<w:fldChar w:fldCharType="begin"/>'),
    run(`<w:instrText xml:space="preserve"> PAGEREF ${bookmark} \\h </w:instrText>`),
    run('<w:fldChar w:fldCharType="separate"/>'),
    run(`<w:t xml:space="preserve">${cached}</w:t>`),
    run('<w:fldChar w:fldCharType="end"/>'),
  ].join("");
}

function indexPageCell(tc: string, start: string, end: string | undefined): string {
  const children = childElements(tc);
  const tcPr = children.find((c) => isElement(c, "w:tcPr")) ?? "";
  const p = children.find((c) => isElement(c, "w:p")) ?? "<w:p/>";
  const pPr = findChild(p, "w:pPr") ?? "";
  const rPr = paragraphRunProperties(p);
  const cached = elementText(p).trim();
  const [first, last] = cached.split("-");
  const runs = end
    ? `${pageRefRuns(rPr, start, first)}<w:r>${rPr}<w:t>-</w:t></w:r>${pageRefRuns(rPr, end, last ?? first)}`
    : pageRefRuns(rPr, start, cached);
  return `<w:tc>${tcPr}<w:p>${pPr}${runs}</w:p></w:tc>`;
}

function withBookmark(p: string, id: number, name: string): string {
  const children = childElements(p);
  const pPrIndex = children.findIndex((c) => isElement(c, "w:pPr"));
  children.splice(pPrIndex + 1, 0, bookmarkXml(id, name));
  return withChildren(p, children);
}

type Replacement = { from: number; to: number; xml: string[] };

function main() {
  const zip = new PizZip(fs.readFileSync(SOURCE));
  const documentXml = zip.file("word/document.xml")?.asText() ?? fail("no document.xml");
  const bodyStart = documentXml.indexOf("<w:body>") + "<w:body>".length;
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  const els = splitTopLevelElements(cleanXml(documentXml.slice(bodyStart, bodyEnd)));

  const expectText = (index: number, text: string) => {
    const actual = elementText(els[index] ?? "").trim();
    if (!actual.startsWith(text)) {
      fail(`element ${index}: expected "${text}", found "${actual.slice(0, 60)}"`);
    }
  };
  expectText(12, "QUALIFICATION SUMMARY REPORT");
  expectText(34, "REVISION HISTORY");
  expectText(68, "INDEX");
  expectText(81, "INTRODUCTION");
  expectText(83, "Objective");
  expectText(111, "REQUIREMENT TRACEABILITY MATRIX");
  expectText(145, "QUALIFIED OPERATING PARAMETER DETAILS");
  expectText(147, "GLR-1301");
  expectText(162, "Operating Range");
  expectText(165, "Other Details");
  expectText(169, "CONCLUSION");
  if (!els[172]?.startsWith("<w:sectPr")) fail("final sectPr moved");

  const out = [...els];

  // Cover: Equipment Name / Code / Capacity values.
  out[16] = mapRows(els[16], (tr, i) =>
    setCellText(tr, 1, ["{equipmentName}", "{equipmentCode}", "{capacity}"][i] ?? "")
  );
  // Revision history row 1.
  out[36] = mapRows(els[36], (tr, i) =>
    i === 1 ? setCellText(setCellText(tr, 0, "{revision}"), 1, "{revisionDescription}") : tr
  );
  // Index page numbers → PAGEREF fields (cached values are the form's numbers).
  out[70] = mapRows(els[70], (tr, i) => {
    if (i === 0) return tr;
    const entry = QSR_INDEX_ENTRIES[i - 1] ?? fail(`index row ${i} has no entry`);
    let cell = -1;
    return withChildren(
      tr,
      childElements(tr).map((child) => {
        if (!isElement(child, "w:tc")) return child;
        cell += 1;
        if (cell === 0 && elementText(child).trim() !== entry.number) {
          fail(`index row ${i}: expected ${entry.number}`);
        }
        return cell === 2 ? indexPageCell(child, entry.start, entry.end) : child;
      })
    );
  });
  const headingIndices = [81, 83, 86, 89, 95, 98, 99, 101, 104, 107, 111, 112, 115, 119, 122, 125, 128, 145, 169];
  headingIndices.forEach((elIndex, i) => {
    out[elIndex] = withBookmark(els[elIndex], 9000 + i, QSR_INDEX_ENTRIES[i].start);
  });
  out[162] = setParagraphText(els[162], "{operatingRangeTitle}");

  const replacements: Replacement[] = [];
  const narrative = (key: QsrSectionKey, index: number, rPr?: string) =>
    replacements.push({
      from: index,
      to: index,
      xml: [markerParagraph(qsrSlotStart(key)), prototypeParagraph(els[index], "", rPr), markerParagraph(qsrSlotEnd(key))],
    });
  const tableSlot = (
    key: QsrSectionKey,
    index: number,
    spec: { headerRows: number; dataRow: number; bannerRow?: number }
  ) =>
    replacements.push({
      from: index,
      to: index,
      xml: [markerParagraph(qsrSlotStart(key)), prototypeTable(els[index], spec), markerParagraph(qsrSlotEnd(key))],
    });

  narrative("qsr_objective", 84);
  narrative("qsr_scope", 87);
  tableSlot("qsr_references", 90, { headerRows: 1, dataRow: 1, bannerRow: 9 });
  tableSlot("qsr_acronyms", 96, { headerRows: 0, dataRow: 0 });
  narrative("qsr_overview", 100);
  narrative("qsr_background", 102);
  tableSlot("qsr_qualification_documents", 106, { headerRows: 1, dataRow: 2, bannerRow: 1 });
  tableSlot("qsr_sops", 109, { headerRows: 1, dataRow: 1 });
  tableSlot("qsr_rtm_process", 113, { headerRows: 2, dataRow: 2, bannerRow: 31 });
  tableSlot("qsr_rtm_control", 116, { headerRows: 2, dataRow: 2 });
  tableSlot("qsr_rtm_gmp", 120, { headerRows: 2, dataRow: 2 });
  tableSlot("qsr_rtm_safety", 124, { headerRows: 2, dataRow: 2 });
  tableSlot("qsr_rtm_csv", 126, { headerRows: 2, dataRow: 2 });
  tableSlot("qsr_rtm_maintenance", 129, { headerRows: 2, dataRow: 2 });
  replacements.push({
    from: 147,
    to: 161,
    xml: [
      markerParagraph(qsrSlotStart("qsr_volumetric_details")),
      prototypeParagraph(els[147], QSR_HEADING_MARKER),
      prototypeTable(els[148], { headerRows: 1, dataRow: 1 }),
      prototypeParagraph(els[155], QSR_SPACER_MARKER),
      markerParagraph(qsrSlotEnd("qsr_volumetric_details")),
    ],
  });
  tableSlot("qsr_operating_range", 163, { headerRows: 1, dataRow: 1 });
  narrative("qsr_other_details", 166, secondRunProperties(els[166]));
  narrative("qsr_conclusion", 170);

  const body: string[] = [];
  for (let i = 0; i < out.length; i += 1) {
    const hit = replacements.find((r) => r.from === i);
    if (hit) {
      body.push(...hit.xml);
      i = hit.to;
      continue;
    }
    body.push(out[i]);
  }
  zip.file(
    "word/document.xml",
    `${documentXml.slice(0, bodyStart)}${body.join("")}${documentXml.slice(bodyEnd)}`
  );

  for (const name of ["word/header1.xml", "word/header2.xml", "word/header3.xml"]) {
    zip.file(name, tagHeader(cleanXml(zip.file(name)?.asText() ?? fail(`no ${name}`))));
  }
  for (const name of ["word/footer1.xml", "word/footer2.xml"]) {
    const file = zip.file(name);
    if (file) zip.file(name, cleanXml(file.asText()));
  }

  fs.writeFileSync(OUTPUT, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
}

const HEADER_VALUE_TAGS: ReadonlyArray<[string, string]> = [
  ["Equipment/System", "{equipmentName}"],
  ["Report No.", "{documentNo}"],
  ["Section", "{plantSection}"],
  ["Equipment Number", "{equipmentCode}"],
  ["Capacity/Size", "{capacity}"],
];

/** Replace the paragraph after each header label with its tag. */
function tagHeader(xml: string): string {
  let pendingTag: string | null = null;
  let tagged = 0;
  const result = xml.replace(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g, (p) => {
    const text = elementText(p).trim();
    if (!text) return p;
    if (pendingTag) {
      const tag = pendingTag;
      pendingTag = null;
      tagged += 1;
      return setParagraphText(p, tag);
    }
    if (text.startsWith("Revision:")) {
      tagged += 1;
      const bold = paragraphRunProperties(p);
      const plain = bold.replace(/<w:b(?:Cs)?\/>/g, "");
      const pPr = findChild(p, "w:pPr") ?? "";
      return `<w:p>${pPr}${textRunXml(bold, "Revision: ")}${textRunXml(plain, "{revision}")}</w:p>`;
    }
    pendingTag = HEADER_VALUE_TAGS.find(([label]) => label === text)?.[1] ?? null;
    return p;
  });
  if (tagged !== HEADER_VALUE_TAGS.length + 1) fail(`header tagged ${tagged} fields`);
  return result;
}

main();
