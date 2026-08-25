/**
 * Builds templates/convergent-mechanical-dv-report-template.docx from the
 * Convergent software DV template.
 *
 * The two reports share the same house format — Verification Test Report
 * Template 731-00008: same header with logo, same footer with "Page n of N"
 * and the proprietary marking, same styles and numbering. Only the body
 * differs, so we clone the software template and rewrite its body to the
 * mechanical report's numbered structure.
 *
 * PizZip is used (not Python zipfile) so [Content_Types].xml stays the first
 * entry — Word rejects the file otherwise.
 *
 *   node scripts/build-mechanical-dv-template.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import PizZip from "pizzip";

const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ROOT = process.cwd();
const SOURCE = path.join(
  ROOT,
  "templates/convergent-design-verification-report-template.docx"
);
const DEST = path.join(
  ROOT,
  "templates/convergent-mechanical-dv-report-template.docx"
);

/**
 * Body layout. `heading` clones the section-heading paragraph style; `field`
 * clones the body paragraph style and carries a docxtemplater raw-XML tag.
 */
const BODY = [
  { heading: "PURPOSE:" },
  { field: "purposeXml" },
  { heading: "SCOPE:" },
  { field: "scopeXml" },
  { heading: "1. Testers/Dates:" },
  { field: "testersXml" },
  { heading: "2. Methods of Measurement" },
  { heading: "2.1 Executed Protocol:" },
  { field: "executedProtocolXml" },
  { heading: "2.2 Protocol Deviations:" },
  { field: "protocolDeviationsXml" },
  { heading: "2.3 Units Under Test (UUT's):" },
  { field: "uutNarrativeXml" },
  { field: "uutTableXml" },
  { heading: "2.4 Test Equipment:" },
  { field: "equipmentNarrativeXml" },
  { field: "equipmentTableXml" },
  { heading: "3. Failure/Out of Specification Forms:" },
  { field: "failuresXml" },
  { heading: "4. Results and Discussion:" },
  { heading: "4.1 Data Collection Forms:" },
  { field: "dataCollectionXml" },
  { heading: "4.2 Requirements Verified:" },
  { field: "requirementsLeadInXml" },
  { field: "hardwareResultsTableXml" },
  { field: "systemResultsTableXml" },
  { heading: "4.3 Observations:" },
  { field: "observationsXml" },
  { heading: "5. Problem or Failure Resolution:" },
  { field: "problemsXml" },
  { heading: "6. Conclusion:" },
  { field: "conclusionXml" },
  { heading: "Revision History" },
  { field: "revisionHistoryTableXml" },
];

/** Identity block: cell text in row order, left label then value placeholder. */
const IDENTITY_ROWS = [
  ["Project Name:", "{projectName}", "DHF Index #:", "{dhfIndexNo}"],
  ["Project Leader:", "{projectLeader}", "ECO/DCO#:", "{ecoDcoNo}"],
];

const zip = new PizZip(fs.readFileSync(SOURCE));
const parser = new DOMParser();
const doc = parser.parseFromString(
  zip.file("word/document.xml").asText(),
  "text/xml"
);

function childElements(node) {
  return Array.from(node.childNodes ?? []).filter((n) => n.nodeType === 1);
}

function firstRun(p) {
  const runs = p.getElementsByTagNameNS(WNS, "r");
  return runs.length > 0 ? runs[0] : null;
}

/**
 * Replaces a paragraph's content with a single run carrying `text`, keeping the
 * paragraph and run properties so the house styling survives. `fallbackRun` is
 * used when the paragraph is empty and has no run to clone.
 */
function setParagraphText(p, text, fallbackRun) {
  const proto = firstRun(p) ?? fallbackRun;
  const run = proto
    ? proto.cloneNode(true)
    : p.ownerDocument.createElementNS(WNS, "w:r");

  // Drop every child except the paragraph properties, then re-add one run.
  for (const child of childElements(p)) {
    if (child.localName === "pPr") continue;
    p.removeChild(child);
  }

  // Strip bookmarks, proofing marks and extra text nodes that would otherwise
  // split a docxtemplater tag across runs. Do this BEFORE creating w:t, or the
  // new node gets removed by this same loop.
  for (const child of childElements(run)) {
    if (child.localName === "rPr") continue;
    run.removeChild(child);
  }

  const t = run.ownerDocument.createElementNS(WNS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(p.ownerDocument.createTextNode(text));
  run.appendChild(t);
  p.appendChild(run);
}

const body = doc.getElementsByTagNameNS(WNS, "body")[0];
const bodyChildren = childElements(body);

const identityTable = bodyChildren.find((n) => n.localName === "tbl");
const sectPr = bodyChildren.find((n) => n.localName === "sectPr");
const paragraphs = bodyChildren.filter((n) => n.localName === "p");

// "PURPOSE:" is the first section heading; the paragraph after it is a field.
const headingProto = paragraphs.find((p) =>
  p.textContent.trim().startsWith("PURPOSE")
);
const fieldProto = paragraphs.find((p) =>
  p.textContent.trim().startsWith("{@purposeXml")
);
const spacerProto = paragraphs[0];

if (!identityTable || !headingProto || !fieldProto || !sectPr) {
  throw new Error(
    "Source template does not have the expected structure (identity table, PURPOSE heading, purposeXml field, sectPr)."
  );
}

// ── Identity block ────────────────────────────────────────────────────────
const rows = identityTable.getElementsByTagNameNS(WNS, "tr");
// Row 2's value cells are empty in the source template, so they have no run to
// clone. Borrow one from a cell that does.
const identityRunProto = firstRun(
  identityTable.getElementsByTagNameNS(WNS, "p")[0]
);
for (let ri = 0; ri < IDENTITY_ROWS.length && ri < rows.length; ri++) {
  const cells = rows[ri].getElementsByTagNameNS(WNS, "tc");
  for (let ci = 0; ci < IDENTITY_ROWS[ri].length && ci < cells.length; ci++) {
    const cellParagraphs = Array.from(
      cells[ci].getElementsByTagNameNS(WNS, "p")
    );
    if (cellParagraphs.length === 0) continue;
    setParagraphText(cellParagraphs[0], IDENTITY_ROWS[ri][ci], identityRunProto);
    for (let extra = 1; extra < cellParagraphs.length; extra++) {
      cellParagraphs[extra].parentNode.removeChild(cellParagraphs[extra]);
    }
  }
}

// ── Body ──────────────────────────────────────────────────────────────────
for (const node of bodyChildren) {
  if (node === identityTable || node === sectPr) continue;
  body.removeChild(node);
}

const spacer = spacerProto.cloneNode(true);
setParagraphText(spacer, "");
body.insertBefore(spacer, sectPr);

for (const entry of BODY) {
  const proto = entry.heading ? headingProto : fieldProto;
  const p = proto.cloneNode(true);
  setParagraphText(p, entry.heading ?? `{@${entry.field}}`);
  body.insertBefore(p, sectPr);
}

zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));

// ── Header ────────────────────────────────────────────────────────────────
// The running header carries the full report title. The cloned template names
// the software report; this family is the system and hardware one. The footer
// already carries "Verification Test Report Template, 731-00008 Rev. B",
// "Page n of N" and the proprietary marking, so it is left alone.
const HEADER_PART = "word/header1.xml";
const SOFTWARE_TITLE = "Software Design Verification Test Report";
const MECHANICAL_TITLE = "System and Hardware Verification Test Report";
const headerXml = zip.file(HEADER_PART).asText();
if (!headerXml.includes(SOFTWARE_TITLE)) {
  throw new Error(
    `Expected "${SOFTWARE_TITLE}" in ${HEADER_PART}; the source header changed.`
  );
}
zip.file(
  HEADER_PART,
  headerXml.split(SOFTWARE_TITLE).join(MECHANICAL_TITLE)
);

fs.writeFileSync(
  DEST,
  zip.generate({ type: "nodebuffer", compression: "DEFLATE" })
);

console.log(`Wrote ${path.relative(ROOT, DEST)}`);
console.log(
  `  ${BODY.filter((b) => b.field).length} field placeholders, ${BODY.filter((b) => b.heading).length} headings`
);
