/**
 * Rewrites templates/mj-equipment-lifecycle-report-template.docx in place:
 * drops instructional italics that were printing into the report, adds
 * assessment placeholders above Access Control and Audit Trail, and
 * splits 5.0 into System Trends, Risk Assessment, and Conclusion.
 *
 * PizZip is used (not Python zipfile) so [Content_Types].xml stays the first
 * entry — Word rejects the file otherwise. A `{placeholder}` must live in a
 * single `<w:t>`.
 *
 *   node scripts/build-mj-elr-template.mjs
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const ROOT = process.cwd();
const DEST = path.join(
  ROOT,
  "templates/mj-equipment-lifecycle-report-template.docx"
);

const INSTRUCTION_PREFIXES = [
  "Cumulative for the full life of the equipment",
  "Aseptic process simulations covering this equipment",
  "Environmental, process-parameter and utility monitoring",
  "Instruments are identified by the equipment ID prefix",
  "Record PM compliance for the period",
  "The period rule for this section runs from the completion date",
  "Compiled from the approved alarm trend reports",
  "Sections 3.12 and 3.13 are completed",
  "Discrepancies observed while compiling this report",
  "State whether the equipment remains in its qualified state",
];

const DROP_EXACT = new Set([
  "5.1 SYSTEM TRENDS AND PATTERNS",
  "5.2 RISK ASSESSMENT AND PRIORITIZED ACTIONS",
  "5.3 CONCLUSION",
  "{@accessControlXml}",
  "{@auditTrailXml}",
  "{@systemTrendsXml}",
  "{@systemTrendsTableXml}",
  "{@riskAssessmentXml}",
  "{@riskActionsTableXml}",
]);

function rPr({ bold = false, italic = false, sz = 20 } = {}) {
  return `<w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}${
    italic ? "<w:i/><w:iCs/>" : ""
  }<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

function textRun(text, opts = {}) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${escaped}</w:t></w:r>`;
}

/** A docxtemplater tag must live in a single `<w:t>`. */
function tagRun(tag, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${tag}</w:t></w:r>`;
}

function para(runs, extraPPr = "") {
  return `<w:p><w:pPr><w:spacing w:before="80" w:after="80"/>${extraPPr}</w:pPr>${runs}</w:p>`;
}

function heading2(text) {
  return para(
    textRun(text, { bold: true, sz: 22 }),
    `<w:spacing w:before="200" w:after="80"/>`
  );
}

function field(tag) {
  return para(tagRun(tag, { sz: 20 }));
}

function gradeLine() {
  return para(
    textRun("Overall report risk grading: ", { sz: 20 }) +
      tagRun("{overallRiskGrade}", { sz: 20 })
  );
}

function paragraphPlainText(xml) {
  return [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1] ?? "")
    .join("")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function splitBodyBlocks(body) {
  const blocks = [];
  const re = /<w:(?:p|tbl|sectPr)\b[\s\S]*?<\/w:(?:p|tbl|sectPr)>/g;
  let last = 0;
  let match = re.exec(body);
  while (match) {
    if (match.index > last) {
      const gap = body.slice(last, match.index);
      if (gap.trim()) blocks.push(gap);
    }
    blocks.push(match[0]);
    last = match.index + match[0].length;
    match = re.exec(body);
  }
  if (last < body.length) {
    const tail = body.slice(last);
    if (tail.trim()) blocks.push(tail);
  }
  return blocks;
}

function isInstruction(text) {
  return INSTRUCTION_PREFIXES.some((prefix) => text.startsWith(prefix));
}

function isGradeLine(text) {
  return /^Overall report risk grading:/i.test(text);
}

function rewriteBlocks(blocks) {
  const out = [];
  let pendingConclusionTag = null;
  let summaryOpened = false;
  let summaryFilled = false;

  const flushSummary = () => {
    if (summaryFilled) return;
    out.push(heading2("5.1 SYSTEM TRENDS AND PATTERNS"));
    out.push(field("{@systemTrendsXml}"));
    out.push(field("{@systemTrendsTableXml}"));
    out.push(heading2("5.2 RISK ASSESSMENT AND PRIORITIZED ACTIONS"));
    out.push(gradeLine());
    out.push(field("{@riskAssessmentXml}"));
    out.push(field("{@riskActionsTableXml}"));
    out.push(heading2("5.3 CONCLUSION"));
    if (pendingConclusionTag) out.push(pendingConclusionTag);
    else out.push(field("{@conclusionXml}"));
    pendingConclusionTag = null;
    summaryFilled = true;
  };

  for (const block of blocks) {
    if (!block.startsWith("<w:p")) {
      if (summaryOpened && !summaryFilled) flushSummary();
      out.push(block);
      continue;
    }

    const text = paragraphPlainText(block);

    if (isInstruction(text) || isGradeLine(text) || DROP_EXACT.has(text)) {
      continue;
    }

    if (text === "3.12 ACCESS CONTROL") {
      out.push(block);
      out.push(field("{@accessControlXml}"));
      continue;
    }

    if (text === "3.13 AUDIT TRAIL REVIEW") {
      out.push(block);
      out.push(field("{@auditTrailXml}"));
      continue;
    }

    if (text === "5.0 SUMMARY AND CONCLUSION") {
      if (summaryOpened && !summaryFilled) flushSummary();
      out.push(block);
      summaryOpened = true;
      summaryFilled = false;
      continue;
    }

    if (summaryOpened && !summaryFilled) {
      if (text === "{@conclusionXml}") {
        pendingConclusionTag = block;
        flushSummary();
        continue;
      }
      if (text === "6.0 RECOMMENDATION") {
        flushSummary();
        out.push(block);
        continue;
      }
      continue;
    }

    out.push(block);
  }

  if (summaryOpened && !summaryFilled) flushSummary();
  return reorderAlarmTrendsAboveBreakdowns(out);
}

const HEADING_RENAMES = [
  ["3.11 ALARM TRENDS", "3.9 ALARM TRENDS"],
  ["3.11.1 ALARM TREND SUMMARY", "3.9.1 ALARM TREND SUMMARY"],
  ["3.9 BREAKDOWNS AND TRENDS", "3.10 BREAKDOWNS AND TRENDS"],
  ["3.9.1 BREAKDOWN TREND SUMMARY", "3.10.1 BREAKDOWN TREND SUMMARY"],
  [
    "3.10 QMS RECORDS SINCE LAST PERIODIC RE-QUALIFICATION",
    "3.11 QMS RECORDS SINCE LAST PERIODIC RE-QUALIFICATION",
  ],
];

function headingIndex(blocks, text) {
  return blocks.findIndex(
    (block) => block.startsWith("<w:p") && paragraphPlainText(block) === text
  );
}

function renameHeadingText(block) {
  const text = paragraphPlainText(block);
  for (const [from, to] of HEADING_RENAMES) {
    if (text === from) return block.replace(from, to);
  }
  return block;
}

function renameHeadingSlice(blocks) {
  return blocks.map(renameHeadingText);
}

/** Alarm Trends (3.9) sits above Breakdowns (3.10) so remaining-section can cite that table. */
function reorderAlarmTrendsAboveBreakdowns(blocks) {
  if (headingIndex(blocks, "3.9 ALARM TRENDS") >= 0) return blocks;

  const breakdownStart = headingIndex(blocks, "3.9 BREAKDOWNS AND TRENDS");
  const qmsStart = headingIndex(
    blocks,
    "3.10 QMS RECORDS SINCE LAST PERIODIC RE-QUALIFICATION"
  );
  const alarmStart = headingIndex(blocks, "3.11 ALARM TRENDS");
  const accessStart = headingIndex(blocks, "3.12 ACCESS CONTROL");
  if (
    breakdownStart < 0 ||
    qmsStart < 0 ||
    alarmStart < 0 ||
    accessStart < 0 ||
    !(breakdownStart < qmsStart && qmsStart < alarmStart && alarmStart < accessStart)
  ) {
    throw new Error("ELR template 3.9–3.11 headings are not in the expected order");
  }

  const before = blocks.slice(0, breakdownStart);
  const breakdowns = renameHeadingSlice(blocks.slice(breakdownStart, qmsStart));
  const qms = renameHeadingSlice(blocks.slice(qmsStart, alarmStart));
  const alarms = renameHeadingSlice(blocks.slice(alarmStart, accessStart));
  const after = blocks.slice(accessStart);
  return [...before, ...alarms, ...breakdowns, ...qms, ...after];
}

const zip = new PizZip(fs.readFileSync(DEST));
const documentXml = zip.file("word/document.xml").asText();
const bodyMatch = documentXml.match(/<w:body>([\s\S]*)<\/w:body>/);
if (!bodyMatch) {
  throw new Error("ELR template has no w:body");
}

const rewritten = rewriteBlocks(splitBodyBlocks(bodyMatch[1]));
const next = documentXml.replace(
  /<w:body>[\s\S]*<\/w:body>/,
  `<w:body>${rewritten.join("")}</w:body>`
);

zip.file("word/document.xml", next);
const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(DEST, buf);

const tags = [
  ...new Set(
    [...next.matchAll(/\{(@?[A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1])
  ),
];
const required = [
  "@accessControlXml",
  "@auditTrailXml",
  "@systemTrendsXml",
  "@systemTrendsTableXml",
  "@riskAssessmentXml",
  "@riskActionsTableXml",
  "overallRiskGrade",
];
const missing = required.filter((tag) => !tags.includes(tag));
if (missing.length > 0) {
  throw new Error(`ELR template missing tags: ${missing.join(", ")}`);
}
for (const prefix of INSTRUCTION_PREFIXES) {
  if (next.includes(prefix)) {
    throw new Error(`Instructional copy still in template: ${prefix}`);
  }
}

const alarmAt = next.indexOf("3.9 ALARM TRENDS");
const breakdownAt = next.indexOf("3.10 BREAKDOWNS AND TRENDS");
const qmsAt = next.indexOf("3.11 QMS RECORDS SINCE LAST PERIODIC RE-QUALIFICATION");
if (!(alarmAt >= 0 && breakdownAt > alarmAt && qmsAt > breakdownAt)) {
  throw new Error("ELR template did not place Alarm Trends above Breakdowns");
}
if (next.includes("3.9 BREAKDOWNS") || next.includes("3.11 ALARM")) {
  throw new Error("ELR template still uses the old 3.9/3.11 numbering");
}

console.log(`Wrote ${path.relative(ROOT, DEST)} (${tags.length} tags)`);
