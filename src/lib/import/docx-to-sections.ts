import mammoth from "mammoth";
import PizZip from "pizzip";
import type { JSONContent } from "@tiptap/core";

/** Runtime API; bundled mammoth `.d.ts` only lists `convertToHtml` / `extractRawText`. */
async function mammothConvertToMarkdown(buffer: Buffer): Promise<string> {
  const { value } = await (
    mammoth as typeof mammoth & {
      convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    }
  ).convertToMarkdown({ buffer });
  return value;
}
import type {
  AnalyzeSection,
  MeasureSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT, SECTION_LABELS } from "@/types/sections";
import { emptyDoc, legacyStringToDoc, MAMMOTH_SOFT_BREAK } from "@/lib/tiptap/rich-text";
import { parseHtmlTablesWithPositions, findDataTablePositions } from "@/lib/import/html-table-parser";
import {
  extractTableAlignmentSpecsFromDocxBuffer,
  mergeDocxAlignmentIntoTipTapTableFromSpecs,
} from "@/lib/import/docx-table-alignment";
import { extractWordCommentsFromDocxBuffer } from "@/lib/import/docx-comments";
import { enrichNarrativesFromDocxBuffer } from "@/lib/import/docx-rich-content";
import { stripWordBookmarkAnchors } from "@/lib/import/sanitize-import-html";
import { extractSignatureBlockFromDocxBuffer } from "@/lib/docx/signature-block";
import type { SectionType } from "@/db/schema";

export type ImportedSections = SectionContentMap;

export type ImportedReportHeader = {
  date?: Date;
  deviationNo?: string;
  otherTools?: string;
};

export type ImportedReportContent = {
  sections: ImportedSections;
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean };
  header: ImportedReportHeader;
  comments: ImportedReportComment[];
};

export type ImportedReportComment = {
  parentExternalCommentId: string | null;
  externalCommentId: string;
  externalAuthorName: string;
  externalAuthorInitials: string | null;
  externalCreatedAt: Date | null;
  content: string;
  anchorText: string;
  section: SectionType;
  contentPath: string | null;
  fromPos: number | null;
  toPos: number | null;
};

type ImportSectionKey = keyof SectionContentMap;
type EditableKey = ImportSectionKey;

const SECTION_ORDER: ImportSectionKey[] = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "documents_reviewed",
  "attachments",
  "signature_approvals",
];

type HeadingMatch = {
  key: ImportSectionKey;
  remainder: string;
};

const NON_EDITABLE_EXPORT_HEADING_RE =
  /^(?:details\s+investigation|prepared\s+by|reviewed\s+by|approved(?:\s+by)?)/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(labels: string): string {
  return `${escapeRegex(labels)}(?![A-Za-z0-9_])(?:[ \\t]*\\([^)]*\\))?[ \\t]*:?[ \\t]*`;
}

function sectionHeadingRegex(key: ImportSectionKey): RegExp {
  if (key === "documents_reviewed") {
    return /^(?:\d+(?:\.\d+)*\.?\s+)?documents?\s+reviewed\b(?:\s*\([^)]*\))?\s*(?::|[-–—])?\s*(.*)$/i;
  }
  if (key === "attachments") {
    return /^(?:\d+(?:\.\d+)*\.?\s+)?(?:list\s+of\s+attachments?|attachments)\b(?:\s*\([^)]*\))?\s*(?::|[-–—])?\s*(.*)$/i;
  }
  const label = SECTION_LABELS[key];
  const escaped = escapeRegex(label);
  return new RegExp(
    `^(?:\\d+(?:\\.\\d+)*\\.?\\s+|(?:section|part)\\s+[ivxlcdm]+\\s*[.:)]\\s*)?${escaped}(?:\\s*[:\\-–—]\\s*(.*)|\\s*)$`,
    "i"
  );
}

/** Match an exported section title line (Word headings, numbered sections, or `Define:` labels). */
function matchSectionHeading(trimmedLine: string): HeadingMatch | null {
  const t = trimmedLine.replace(/\s+/g, " ").trim();
  for (const key of SECTION_ORDER) {
    const re = sectionHeadingRegex(key);
    const match = re.exec(t);
    if (match) return { key, remainder: match[1]?.trim() ?? "" };
  }
  return null;
}

function splitLinesIntoSections(
  lines: string[],
  headingLine: (line: string) => string = (line) => line.replace(/\s+/g, " ").trim()
): {
  sections: Record<ImportSectionKey, string>;
  foundHeadings: boolean;
} {
  const buckets: Record<ImportSectionKey, string[]> = {
    define: [],
    measure: [],
    analyze: [],
    improve: [],
    control: [],
    conclusion: [],
    documents_reviewed: [],
    attachments: [],
    signature_approvals: [],
  };
  let current: ImportSectionKey | "preamble" | "ignored" = "preamble";
  let foundHeadings = false;

  const leavesAttachmentsSection = (line: string) =>
    /^(?:\d+(?:\.\d+)*\.?\s+)?(?:prepared|reviewed|approved)\s+by\b/i.test(
      headingLine(line)
    );

  for (const line of lines) {
    const normalized = headingLine(line);
    const heading = matchSectionHeading(normalized);
    if (heading) {
      foundHeadings = true;
      current = heading.key;
      if (heading.remainder) buckets[current].push(heading.remainder);
      continue;
    }
    if (NON_EDITABLE_EXPORT_HEADING_RE.test(normalized)) {
      current = "ignored";
      continue;
    }
    if (current === "attachments" && leavesAttachmentsSection(line)) {
      current = "ignored";
      continue;
    }
    if (current !== "preamble" && current !== "ignored") buckets[current].push(line);
  }

  if (!foundHeadings) {
    return {
      sections: {
        define: lines.join("\n").trim(),
        measure: "",
        analyze: "",
        improve: "",
        control: "",
        conclusion: "",
        documents_reviewed: "",
        attachments: "",
        signature_approvals: "",
      },
      foundHeadings: false,
    };
  }

  const sections = {} as Record<ImportSectionKey, string>;
  for (const key of Object.keys(buckets) as ImportSectionKey[]) {
    sections[key] = buckets[key].join("\n").trim();
  }

  return { sections, foundHeadings: true };
}

function splitPlainTextIntoSections(raw: string): {
  sections: Record<ImportSectionKey, string>;
  foundHeadings: boolean;
} {
  return splitLinesIntoSections(raw.split(/\r?\n/));
}

/** Reverses mammoth's markdown escaper so import text matches readable prose. */
function unescapeMammothMarkdownEscapes(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
}

const MAMMOTH_MARKDOWN_IMAGE_RE = /!\[[^\]\n]*\]\((?:data:image\/[^)\s]+|[^)\n]+)\)/gi;

/**
 * Mammoth's convertToMarkdown keeps Word list numbering as "1. …", "2. …".
 * extractRawText drops those numbers because they are not stored as paragraph text.
 */
export function mammothMarkdownToImportPlain(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const normalized = lines.map((line) => {
    const softBreak = /  +$/.test(line);
    const withoutBold = line.replace(/__([\s\S]*?)__/g, "$1").trimEnd();
    const withImagePlaceholders = withoutBold.replace(MAMMOTH_MARKDOWN_IMAGE_RE, "[image]");
    const unescaped = unescapeMammothMarkdownEscapes(withImagePlaceholders);
    const stripped = stripWordBookmarkAnchors(unescaped);
    return softBreak ? `${stripped}${MAMMOTH_SOFT_BREAK}` : stripped;
  });
  return normalized.join("\n");
}

function cleanImportedText(text: string): string {
  return text
    .replace(/\{[#/][^}]+\}/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\r/g, "")
    .replace(new RegExp(MAMMOTH_SOFT_BREAK, "g"), "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Narrative import: preserve mammoth soft-break markers for linesToDoc/hardBreak. */
function cleanImportedNarrativeText(text: string): string {
  return text
    .replace(/\{[#/][^}]+\}/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findLabel(text: string, labels: string[], from = 0): RegExpExecArray | null {
  const alt = labels.map(labelPattern).join("|");
  const re = new RegExp(`^[ \\t]*(?:${alt})`, "gim");
  re.lastIndex = from;
  return re.exec(text);
}

function getBetweenLabels(
  text: string,
  startLabels: string[],
  stopLabels: string[]
): string {
  const start = findLabel(text, startLabels);
  if (!start) return "";

  const startIndex = start.index + start[0].length;
  let endIndex = text.length;
  for (const stop of stopLabels) {
    const match = findLabel(text, [stop], startIndex);
    if (match && match.index < endIndex) endIndex = match.index;
  }

  return cleanImportedText(text.slice(startIndex, endIndex));
}

/** Word forms duplicate "Other Tool if Any" rows; the answer is under the last label. */
function parseAnalyzeOtherTools(body: string): string {
  const startLabels = ["Other Tool if Any", "Other Tools (If any)"];
  const stopLabels = ["Investigation Outcome"];

  let lastStart: RegExpExecArray | null = null;
  let from = 0;
  while (true) {
    const match = findLabel(body, startLabels, from);
    if (!match) break;
    lastStart = match;
    from = match.index + match[0].length;
  }
  if (!lastStart) return "";

  const startIndex = lastStart.index + lastStart[0].length;
  let endIndex = body.length;
  for (const stop of stopLabels) {
    const match = findLabel(body, [stop], startIndex);
    if (match && match.index < endIndex) endIndex = match.index;
  }

  return cleanImportedText(body.slice(startIndex, endIndex));
}

function hasLabel(text: string, labels: string[]): boolean {
  return findLabel(text, labels) !== null;
}

function getLineValueMaybe(text: string, label: string): string | null {
  const re = new RegExp(`^[ \\t]*${labelPattern(label)}(.*)$`, "im");
  const match = re.exec(text);
  return match ? cleanImportedText(match[1] ?? "") : null;
}

function getLineValue(text: string, label: string): string {
  return getLineValueMaybe(text, label) ?? "";
}

function parseImpactAssessmentBlock(body: string): string {
  return getBetweenLabels(
    body,
    [
      "Impact Assessment (System/ Document/ Product/ Equipment/Patient safety/Past batches)",
      "Impact Assessment",
    ],
    ["Improve"]
  );
}

function findInlineLabel(text: string, label: string, from = 0): RegExpExecArray | null {
  const re = new RegExp(labelPattern(label), "gi");
  re.lastIndex = from;
  return re.exec(text);
}

function getInlineBetweenLabel(
  text: string,
  startLabel: string,
  stopLabels: string[]
): string {
  const start = findInlineLabel(text, startLabel);
  if (!start) return "";

  const startIndex = start.index + start[0].length;
  let endIndex = text.length;
  for (const stop of stopLabels) {
    const match = findInlineLabel(text, stop, startIndex);
    if (match && match.index < endIndex) endIndex = match.index;
  }

  return cleanImportedText(text.slice(startIndex, endIndex));
}

function textBeforeAnyInlineLabel(text: string, labels: string[]): string {
  let endIndex = text.length;
  for (const label of labels) {
    const match = findInlineLabel(text, label);
    if (match && match.index < endIndex) endIndex = match.index;
  }
  return cleanImportedText(text.slice(0, endIndex));
}

/** Line-anchored variant — avoids splitting on label phrases inside checklist questions. */
function textBeforeAnyLabel(text: string, labels: string[]): string {
  let endIndex = text.length;
  for (const label of labels) {
    const match = findLabel(text, [label]);
    if (match && match.index < endIndex) endIndex = match.index;
  }
  return cleanImportedText(text.slice(0, endIndex));
}

function parseMeasure(text: string): MeasureSection {
  const body = cleanImportedNarrativeText(text);

  return {
    ...EMPTY_CONTENT.measure,
    narrative: legacyStringToDoc(body),
  };
}

/**
 * The investigation template stores the 5-Why chain and its concluding paragraph in a single
 * table cell. Parse it verbatim into `narrative` and leave `conclusion` empty so nothing has
 * to be re-stitched downstream.
 */
function parseFiveWhyBlock(text: string): AnalyzeSection["fiveWhy"] {
  return { narrative: legacyStringToDoc(cleanImportedNarrativeText(text)), conclusion: "" };
}

function buildAnalyzeFromChunk(text: string): AnalyzeSection {
  const base = EMPTY_CONTENT.analyze;
  const body = cleanImportedText(text);
  if (!body) return base;

  const sixMBlock = getBetweenLabels(body, ["6 M Method", "6M Method"], [
    "5 Why Approach",
    "5-Why Approach",
    "Brainstorming",
  ]);
  const fiveWhyBlock = getBetweenLabels(body, ["5 Why Approach", "5-Why Approach"], [
    "Brainstorming",
  ]);

  return {
    ...base,
    sixM: {
      man: getLineValue(sixMBlock, "Man"),
      machine: getLineValue(sixMBlock, "Machine"),
      measurement: getLineValue(sixMBlock, "Measurement"),
      material: getLineValue(sixMBlock, "Material"),
      method: getLineValue(sixMBlock, "Method"),
      milieu: getLineValue(sixMBlock, "Milieu (Environment)") || getLineValue(sixMBlock, "Milieu"),
      conclusion: getLineValue(sixMBlock, "Conclusion"),
    },
    fiveWhy: {
      ...parseFiveWhyBlock(fiveWhyBlock),
    },
    brainstorming: getBetweenLabels(body, ["Brainstorming"], [
      "Other Tool if Any",
      "Other Tools (If any)",
      "Investigation Outcome",
    ]),
    otherTools: parseAnalyzeOtherTools(body),
    investigationOutcome: legacyStringToDoc(
      getBetweenLabels(body, ["Investigation Outcome"], [
        "Identified Root Cause/ Probable Cause",
        "Identified Root Cause / Probable Cause",
        "Impact Assessment (System/ Document/ Product/ Equipment/Patient safety/Past batches)",
      ])
    ),
    rootCause: {
      narrative: legacyStringToDoc(
        getBetweenLabels(
          body,
          ["Identified Root Cause/ Probable Cause", "Identified Root Cause / Probable Cause"],
          [
            "Impact Assessment (System/ Document/ Product/ Equipment/Patient safety/Past batches)",
            "Impact Assessment",
          ]
        )
      ),
    },
    impactAssessment: legacyStringToDoc(parseImpactAssessmentBlock(body)),
  };
}

function parseCorrectiveActions(text: string): string {
  const register = getBetweenLabels(text, ["Corrective Actions Register"], []);
  if (!register) return "";

  const starts = Array.from(register.matchAll(/^CA-\d+\s*:\s*/gim));
  if (starts.length === 0) {
    return cleanImportedText(register);
  }

  const entries: string[] = [];
  for (let idx = 0; idx < starts.length; idx++) {
    const match = starts[idx]!;
    const next = starts[idx + 1];
    const start = match.index + match[0].length;
    const end = next?.index ?? register.length;
    const block = cleanImportedText(register.slice(start, end));
    const description = textBeforeAnyInlineLabel(block, [
      "Responsible person",
      "Due date",
      "Expected outcome",
      "Effectiveness verification",
    ]);
    const details = [
      ["Responsible person", getInlineBetweenLabel(block, "Responsible person", [
        "Due date",
        "Expected outcome",
        "Effectiveness verification",
      ])],
      ["Due date", getInlineBetweenLabel(block, "Due date", [
        "Expected outcome",
        "Effectiveness verification",
      ])],
      ["Expected outcome", getInlineBetweenLabel(block, "Expected outcome", [
        "Effectiveness verification",
      ])],
      ["Effectiveness verification", getInlineBetweenLabel(block, "Effectiveness verification", [])],
    ]
      .filter(([, value]) => value && value !== "—")
      .map(([label, value]) => `${label}: ${value}`);

    entries.push(cleanImportedText([description, ...details].filter(Boolean).join("\n")));
  }

  return cleanImportedText(entries.filter(Boolean).join("\n\n"));
}

/** Headings that begin content outside the Control DMAIC block (export/upload templates). */
const CONTROL_BODY_STOP_LABELS = [
  "Documents Reviewed",
  "Document Reviewed",
  "List of attachment",
  "List of attachments",
];

const IMPROVE_ACTION_LABELS = ["Corrective Action", "Corrective Actions Register"];

function extractControlPreventivePlain(controlBody: string): string {
  if (!hasLabel(controlBody, ["Preventive Action"])) {
    return cleanImportedText(controlBody);
  }

  const preamble = textBeforeAnyLabel(controlBody, ["Preventive Action"]);
  const body = getBetweenLabels(
    controlBody,
    ["Preventive Action"],
    CONTROL_BODY_STOP_LABELS
  );
  const parts: string[] = [];
  if (preamble) parts.push(cleanImportedText(preamble));
  if (body) parts.push(`Preventive Action:\n${cleanImportedText(body)}`);
  return parts.filter(Boolean).join("\n\n");
}

const REPORT_HEADER_LABEL_RE =
  /^(?:date|deviation\s+no\.?|investigation\s+tool\s+used|other\s+tools?\b)/i;

function isReportHeaderLabelLine(line: string): boolean {
  return REPORT_HEADER_LABEL_RE.test(line.replace(/\s+/g, " ").trim());
}

/** Header fields in the investigation template put values on the line after the label. */
function getBlockLabelValue(text: string, label: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const labelRe = new RegExp(`^${labelPattern(label)}(.*)$`, "i");

  for (let i = 0; i < lines.length; i++) {
    const match = labelRe.exec(lines[i]!);
    if (!match) continue;

    const inline = cleanImportedText(match[1] ?? "");
    if (inline) return inline;

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next) continue;
      if (isReportHeaderLabelLine(next)) break;
      return cleanImportedText(next);
    }
    return "";
  }

  return "";
}

function extractReportPreamble(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (matchSectionHeading(normalized)?.key === "define") break;
    if (/^define\s*:?\s*$/i.test(normalized)) break;
    out.push(line);
  }

  return out.join("\n");
}

function parseDdMmYyyyDate(value: string): Date | undefined {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return parsed;
}

export function parseReportHeaderFromRaw(raw: string): ImportedReportHeader {
  const preamble = extractReportPreamble(raw);
  const dateText = getBlockLabelValue(preamble, "Date");
  const deviationNo = getBlockLabelValue(preamble, "Deviation No.");
  const otherTools = getBlockLabelValue(preamble, "Other Tools (If any)");

  const header: ImportedReportHeader = {};
  const parsedDate = parseDdMmYyyyDate(dateText);
  if (parsedDate) header.date = parsedDate;
  if (deviationNo) header.deviationNo = deviationNo;
  if (otherTools) header.otherTools = otherTools;

  return header;
}

function parseToolsUsed(raw: string): ImportedReportContent["toolsUsed"] {
  const line =
    raw
      .split(/\r?\n/)
      .find((item) => /investigation\s+tool\s+used/i.test(item)) ?? "";
  const afterLabel = line.replace(/^.*?investigation\s+tool\s+used\s*:?\s*/i, "");
  const checked = (label: RegExp) => {
    const match = label.exec(afterLabel);
    if (!match) return false;
    const before = afterLabel.slice(Math.max(0, match.index - 3), match.index);
    if (before.includes("☑")) return true;
    if (before.includes("☐")) return false;
    return false;
  };

  return {
    sixM: checked(/\b6\s*M\b/i),
    fiveWhy: checked(/\b5\s*-?\s*why\b/i),
    brainstorming: checked(/\bbrainstorming\b/i),
  };
}

type CommentTarget =
  | {
      section: SectionType;
      contentPath: string;
      kind: "rich";
      doc: JSONContent;
    }
  | {
      section: SectionType;
      contentPath: string;
      kind: "plain";
      text: string;
    };

function buildCommentTargets(sections: ImportedSections): CommentTarget[] {
  return [
    { section: "define", contentPath: "narrative", kind: "rich", doc: sections.define.narrative },
    { section: "measure", contentPath: "narrative", kind: "rich", doc: sections.measure.narrative },
    { section: "analyze", contentPath: "sixM.man", kind: "plain", text: sections.analyze.sixM.man },
    { section: "analyze", contentPath: "sixM.machine", kind: "plain", text: sections.analyze.sixM.machine },
    { section: "analyze", contentPath: "sixM.measurement", kind: "plain", text: sections.analyze.sixM.measurement },
    { section: "analyze", contentPath: "sixM.material", kind: "plain", text: sections.analyze.sixM.material },
    { section: "analyze", contentPath: "sixM.method", kind: "plain", text: sections.analyze.sixM.method },
    { section: "analyze", contentPath: "sixM.milieu", kind: "plain", text: sections.analyze.sixM.milieu },
    { section: "analyze", contentPath: "sixM.conclusion", kind: "plain", text: sections.analyze.sixM.conclusion },
    { section: "analyze", contentPath: "fiveWhy.narrative", kind: "rich", doc: sections.analyze.fiveWhy.narrative },
    { section: "analyze", contentPath: "brainstorming", kind: "plain", text: sections.analyze.brainstorming },
    { section: "analyze", contentPath: "otherTools", kind: "plain", text: sections.analyze.otherTools },
    { section: "analyze", contentPath: "investigationOutcome", kind: "rich", doc: sections.analyze.investigationOutcome },
    { section: "analyze", contentPath: "rootCause.narrative", kind: "rich", doc: sections.analyze.rootCause.narrative },
    {
      section: "analyze",
      contentPath: "impactAssessment",
      kind: "rich",
      doc: sections.analyze.impactAssessment,
    },
    {
      section: "improve",
      contentPath: "correctiveActions",
      kind: "rich",
      doc: sections.improve.correctiveActions,
    },
    {
      section: "control",
      contentPath: "preventiveActions",
      kind: "rich",
      doc: sections.control.preventiveActions,
    },
  ];
}

const EMPTY_STRUCTURAL_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

function nodeSize(node: JSONContent): number {
  if (node.type === "text") return (node.text ?? "").length;
  if (!node.content?.length) {
    return EMPTY_STRUCTURAL_NODE_TYPES.has(node.type ?? "") ? 2 : 1;
  }
  return 2 + node.content.reduce((sum, child) => sum + nodeSize(child), 0);
}

function buildPlainTextPositionMap(doc: JSONContent): {
  text: string;
  positions: number[];
} {
  const chunks: string[] = [];
  const positions: number[] = [];

  function appendText(text: string, startPos: number) {
    chunks.push(text);
    for (let i = 0; i < text.length; i++) positions.push(startPos + i);
  }

  function appendBreak() {
    chunks.push("\n");
    positions.push(-1);
  }

  function walk(node: JSONContent, pos: number): number {
    if (node.type === "text") {
      const text = node.text ?? "";
      appendText(text, pos);
      return text.length;
    }

    const children = node.content ?? [];
    let childPos = node.type === "doc" ? pos : pos + 1;
    for (const child of children) {
      const size = walk(child, childPos);
      childPos += size;
    }

    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
      appendBreak();
    }

    return nodeSize(node);
  }

  walk(doc, 0);
  return { text: chunks.join(""), positions };
}

function normalizedSearchMatch(
  haystack: string,
  needle: string
): { start: number; end: number } | null {
  const normalizedChars: string[] = [];
  const rawOffsets: number[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < haystack.length; i++) {
    const ch = haystack[i]!;
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        normalizedChars.push(" ");
        rawOffsets.push(i);
        lastWasSpace = true;
      }
      continue;
    }
    normalizedChars.push(ch.toLowerCase());
    rawOffsets.push(i);
    lastWasSpace = false;
  }

  const normalizedNeedle = needle.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedNeedle) return null;
  const idx = normalizedChars.join("").indexOf(normalizedNeedle);
  if (idx === -1) return null;

  const start = rawOffsets[idx] ?? -1;
  const lastMatchedRaw = rawOffsets[idx + normalizedNeedle.length - 1] ?? -1;
  if (start < 0 || lastMatchedRaw < start) return null;
  return { start, end: lastMatchedRaw + 1 };
}

function normalizedSearchIndex(haystack: string, needle: string): number {
  return normalizedSearchMatch(haystack, needle)?.start ?? -1;
}

function findRichAnchorRange(doc: JSONContent, anchorText: string): {
  fromPos: number;
  toPos: number;
} | null {
  const needle = cleanImportedText(anchorText);
  if (!needle) return null;
  const { text, positions } = buildPlainTextPositionMap(doc);
  const match = normalizedSearchMatch(text, needle);
  if (!match) return null;

  let fromPos: number | null = null;
  for (let i = match.start; i < positions.length; i++) {
    if ((positions[i] ?? -1) >= 0) {
      fromPos = positions[i]!;
      break;
    }
  }
  let toPos: number | null = null;
  for (let i = Math.min(positions.length - 1, match.end - 1); i >= 0; i--) {
    if ((positions[i] ?? -1) >= 0) {
      toPos = positions[i]! + 1;
      break;
    }
  }
  if (fromPos == null || toPos == null || toPos <= fromPos) return null;
  return { fromPos, toPos };
}

function groupDuplicateAnchorReplies(
  comments: ImportedReportComment[]
): ImportedReportComment[] {
  const rootByAnchor = new Map<string, string>();

  return comments.map((comment) => {
    if (comment.parentExternalCommentId || !comment.anchorText) return comment;

    const key = [
      comment.section,
      comment.contentPath ?? "",
      comment.anchorText.replace(/\s+/g, " ").trim().toLowerCase(),
    ].join("\u0000");
    const rootExternalId = rootByAnchor.get(key);
    if (!rootExternalId) {
      rootByAnchor.set(key, comment.externalCommentId);
      return comment;
    }

    return {
      ...comment,
      parentExternalCommentId: rootExternalId,
      contentPath: null,
      fromPos: null,
      toPos: null,
    };
  });
}

function mapImportedWordComments(
  buffer: Buffer,
  sections: ImportedSections
): ImportedReportComment[] {
  const targets = buildCommentTargets(sections);
  const mapped = extractWordCommentsFromDocxBuffer(buffer).map((comment) => {
    const anchorText = cleanImportedText(comment.anchorText);
    for (const target of targets) {
      if (comment.section && target.section !== comment.section) continue;
      if (target.kind === "rich") {
        const range = findRichAnchorRange(target.doc, anchorText);
        if (range) {
          return {
            parentExternalCommentId: comment.parentExternalCommentId,
            externalCommentId: comment.externalCommentId,
            externalAuthorName: comment.authorName,
            externalAuthorInitials: comment.authorInitials,
            externalCreatedAt: comment.createdAt,
            content: comment.content,
            anchorText,
            section: target.section,
            contentPath: target.contentPath,
            fromPos: range.fromPos,
            toPos: range.toPos,
          };
        }
      } else if (anchorText && normalizedSearchIndex(target.text, anchorText) !== -1) {
        return {
          parentExternalCommentId: comment.parentExternalCommentId,
          externalCommentId: comment.externalCommentId,
          externalAuthorName: comment.authorName,
          externalAuthorInitials: comment.authorInitials,
          externalCreatedAt: comment.createdAt,
          content: comment.content,
          anchorText,
          section: target.section,
          contentPath: target.contentPath,
          fromPos: null,
          toPos: null,
        };
      }
    }

    const fallbackSection = comment.section ?? "define";
    return {
      parentExternalCommentId: comment.parentExternalCommentId,
      externalCommentId: comment.externalCommentId,
      externalAuthorName: comment.authorName,
      externalAuthorInitials: comment.authorInitials,
      externalCreatedAt: comment.createdAt,
      content: comment.content,
      anchorText,
      section: fallbackSection,
      contentPath: null,
      fromPos: null,
      toPos: null,
    };
  });
  return groupDuplicateAnchorReplies(mapped);
}

function parseToolsUsedFromDocxXml(buffer: Buffer): ImportedReportContent["toolsUsed"] | null {
  try {
    const zip = new PizZip(buffer);
    const xml = zip.file("word/document.xml")?.asText();
    if (!xml) return null;
    const paragraphs = xml.match(/<\w+:p\b[\s\S]*?<\/\w+:p>/g) ?? [];
    const toolsPara = paragraphs.find((paragraph) =>
      decodeXmlText(paragraph).match(/investigation\s+tool\s+used/i)
    );
    if (!toolsPara) return null;

    const toolsUsed: ImportedReportContent["toolsUsed"] = {
      sixM: false,
      fiveWhy: false,
      brainstorming: false,
    };
    let pendingCheckbox: boolean | null = null;
    let sawStructuredCheckbox = false;
    const runs = toolsPara.match(/<\w+:r\b[\s\S]*?<\/\w+:r>/g) ?? [];
    for (const run of runs) {
      const checkbox = checkboxStateFromRun(run);
      if (checkbox !== null) {
        sawStructuredCheckbox = true;
        pendingCheckbox = checkbox;
        continue;
      }

      const text = decodeXmlText(run).trim();
      if (!text || pendingCheckbox === null) continue;
      if (/^6\s*M\b/i.test(text)) toolsUsed.sixM = pendingCheckbox;
      else if (/^5\s*-?\s*why\b/i.test(text)) toolsUsed.fiveWhy = pendingCheckbox;
      else if (/^brainstorming\b/i.test(text)) toolsUsed.brainstorming = pendingCheckbox;
      pendingCheckbox = null;
    }

    /** Exported reports use ☑ / ☐ in text (Docxtemplater), not Word SDT checkboxes — let `parseToolsUsed(raw)` handle those. */
    if (!sawStructuredCheckbox) return null;

    return toolsUsed;
  } catch {
    return null;
  }
}

function checkboxStateFromRun(runXml: string): boolean | null {
  const checkbox = /<\w+:checkBox\b[\s\S]*?<\/\w+:checkBox>/.exec(runXml)?.[0];
  if (!checkbox) return null;

  const checked = /<\w+:checked\b[^>]*(?:\w+:)?val="([^"]+)"/.exec(checkbox)?.[1];
  if (checked !== undefined) return checked !== "0" && checked.toLowerCase() !== "false";

  const defaultValue = /<\w+:default\b[^>]*(?:\w+:)?val="([^"]+)"/.exec(checkbox)?.[1];
  return defaultValue === "1" || defaultValue?.toLowerCase() === "true";
}

function decodeXmlText(xml: string): string {
  return Array.from(xml.matchAll(/<\w+:t\b[^>]*>([\s\S]*?)<\/\w+:t>/g))
    .map((match) =>
      (match[1] ?? "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    )
    .join("");
}

function parseDocumentsReviewedBody(body: string): string[] {
  const lines = cleanImportedText(body)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+\.\s*(.+)$/);
    if (numbered) {
      items.push(numbered[1]!.trim());
      continue;
    }
    if (/^documents?\s+reviewed\b/i.test(line)) continue;
    items.push(line);
  }
  return items;
}

function parseAttachmentsBody(body: string): SectionContentMap["attachments"]["items"] {
  const lines = cleanImportedText(body)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items: SectionContentMap["attachments"]["items"] = [];
  const attRe =
    /^(?:\d+\.\s*)?(Attachment\s*No\.\s*[IVXLCDM]+)(?:\s*:\s*|\s+)(.*)$/i;
  for (const line of lines) {
    const m = attRe.exec(line);
    if (m) {
      items.push({ label: m[1]!.trim(), description: (m[2] ?? "").trim() });
    } else if (!/^list\s+of\s+attachments?\b/i.test(line)) {
      items.push({ label: "", description: line });
    }
  }
  return trimAttachmentListSignatureNoise(items);
}

/** Drop signature / approval table rows often parsed as extra “attachments” after real annexes. */
function trimAttachmentListSignatureNoise(
  items: SectionContentMap["attachments"]["items"]
): SectionContentMap["attachments"]["items"] {
  const cut = items.findIndex((row) => {
    const d = row.description.trim();
    if (!/^prepared$/i.test(d)) return false;
    const lab = row.label.replace(/\s/g, "");
    if (!lab) return true;
    return /^AttachmentNo\.VI/i.test(lab);
  });
  return cut === -1 ? items : items.slice(0, cut);
}

export function buildSectionsFromRaw(raw: string): ImportedSections {
  const { sections, foundHeadings } = splitPlainTextIntoSections(raw);

  const defineText = cleanImportedNarrativeText(sections.define);
  const improveBody = cleanImportedText(sections.improve);
  const controlBody = cleanImportedText(sections.control);

  const defineNarr = defineText
    ? legacyStringToDoc(defineText)
    : emptyDocFallback(foundHeadings, raw);
  const improvePreamble = hasLabel(improveBody, IMPROVE_ACTION_LABELS)
    ? textBeforeAnyLabel(improveBody, IMPROVE_ACTION_LABELS)
    : improveBody;
  const correctiveActionBlock = getBetweenLabels(
    improveBody,
    ["Corrective Action"],
    ["Corrective Actions Register"]
  );
  const controlPreventiveUnified = cleanImportedText(
    extractControlPreventivePlain(controlBody)
  );
  const correctiveParsed = [correctiveActionBlock, parseCorrectiveActions(improveBody)]
    .filter(Boolean)
    .join("\n\n");
  const improveParts: string[] = [];
  if (improvePreamble) improveParts.push(improvePreamble);
  if (correctiveParsed) {
    improveParts.push(`Corrective Action:\n${correctiveParsed}`);
  }
  const correctiveActionsUnified = improveParts.join("\n\n");

  return {
    define: {
      ...EMPTY_CONTENT.define,
      narrative: defineNarr,
    },
    measure: parseMeasure(sections.measure),
    analyze: buildAnalyzeFromChunk(sections.analyze),
    improve: {
      ...EMPTY_CONTENT.improve,
      narrative: emptyDoc(),
      correctiveActions: legacyStringToDoc(correctiveActionsUnified),
    },
    control: {
      ...EMPTY_CONTENT.control,
      preventiveActions: legacyStringToDoc(controlPreventiveUnified),
    },
    conclusion: {
      ...EMPTY_CONTENT.conclusion,
      narrative: legacyStringToDoc(cleanImportedNarrativeText(sections.conclusion)),
    },
    documents_reviewed: {
      ...EMPTY_CONTENT.documents_reviewed,
      items: parseDocumentsReviewedBody(sections.documents_reviewed),
    },
    attachments: {
      ...EMPTY_CONTENT.attachments,
      items: parseAttachmentsBody(sections.attachments),
    },
    signature_approvals: { ...EMPTY_CONTENT.signature_approvals },
  };
}

/**
 * Reads a .docx buffer and maps recognizable DMAIC blocks into section content.
 * Uses mammoth markdown conversion (normalized to plain text) so Word list numbering
 * is preserved; plain extractRawText omits automatic 1., 2., … prefixes.
 */
export async function docxBufferToSectionContentMap(
  buffer: Buffer
): Promise<ImportedSections> {
  const imported = await docxBufferToImportedReportContent(buffer);
  return imported.sections;
}

export async function docxBufferToImportedReportContent(
  buffer: Buffer
): Promise<ImportedReportContent> {
  const [markdown, { value: html }] = await Promise.all([
    mammothConvertToMarkdown(buffer),
    mammoth.convertToHtml({ buffer }),
  ]);
  const raw = mammothMarkdownToImportPlain(markdown);

  const sections = buildSectionsFromRaw(raw);

  // Inject table nodes from HTML into narratives where applicable.
  injectTablesFromHtml(html, sections, buffer);
  await enrichNarrativesFromDocxBuffer(buffer, {
    define: sections.define,
    measure: sections.measure,
    improve: sections.improve,
    analyze: sections.analyze,
  });

  const signatureBlock = extractSignatureBlockFromDocxBuffer(buffer);
  if (signatureBlock) {
    sections.signature_approvals = {
      table: signatureBlock.table,
      headerRowXml: signatureBlock.headerRowXml,
      dataRowXml: signatureBlock.dataRowXml,
    };
  }

  return {
    sections,
    toolsUsed: parseToolsUsedFromDocxXml(buffer) ?? parseToolsUsed(raw),
    header: parseReportHeaderFromRaw(raw),
    comments: mapImportedWordComments(buffer, sections),
  };
}

/**
 * Split the mammoth HTML by section heading boundaries and inject any data
 * tables found within each section into the corresponding narrative JSONContent.
 *
 * Because `mammoth.extractRawText()` flattens table cells into individual
 * lines, the raw-text-based narrative already contains the table content as
 * flat paragraphs (e.g. "Sr. No.\nDate\nTime in Hrs.\n…"). This function:
 *   1. Identifies which section each data table belongs to.
 *   2. Finds the consecutive flat paragraphs that match the table's cell text.
 *   3. Replaces those paragraphs with a proper Tiptap table node.
 */
function injectTablesFromHtml(
  html: string,
  sections: ImportedSections,
  buffer: Buffer
): void {
  const tablesWithMeta = parseHtmlTablesWithPositions(html);
  const specs = extractTableAlignmentSpecsFromDocxBuffer(buffer);
  for (const { node } of tablesWithMeta) {
    mergeDocxAlignmentIntoTipTapTableFromSpecs(node, specs);
  }
  const tables = tablesWithMeta.map((t) => t.node);
  const tablePositions = findDataTablePositions(html);
  if (tables.length === 0) return;

  // Find section heading positions using patterns that match heading-style
  // occurrences (bold label followed by colon, or inside a strong tag),
  // avoiding false matches like "control logic".
  const sectionPositions: Array<{ key: EditableKey; index: number }> = [];
  for (const key of SECTION_ORDER) {
    const label = SECTION_LABELS[key];
    const headingRe = new RegExp(
      `<strong>\\s*${escapeRegex(label)}\\s*(?::|</strong>)`,
      "i"
    );
    const match = headingRe.exec(html);
    if (match) sectionPositions.push({ key, index: match.index });
  }
  sectionPositions.sort((a, b) => a.index - b.index);

  // Group tables by section key.
  const tablesBySection = new Map<EditableKey, JSONContent[]>();
  for (let i = 0; i < tables.length; i++) {
    const tablePos = tablePositions[i]!;
    let sectionKey: EditableKey | null = null;
    for (let j = sectionPositions.length - 1; j >= 0; j--) {
      if (sectionPositions[j]!.index <= tablePos) {
        sectionKey = sectionPositions[j]!.key;
        break;
      }
    }
    if (sectionKey) {
      const list = tablesBySection.get(sectionKey) ?? [];
      list.push(tables[i]!);
      tablesBySection.set(sectionKey, list);
    }
  }

  // For each section, replace flat paragraphs/text with the table nodes.
  for (const [sectionKey, sectionTables] of tablesBySection) {
    for (const tableNode of sectionTables) {
      if (isSignatureTipTapTable(tableNode)) continue;
      applyTableToImportedSection(sections, sectionKey, tableNode);
    }
  }
}

function applyTableToImportedSection(
  sections: ImportedSections,
  sectionKey: EditableKey,
  tableNode: JSONContent
): boolean {
  const section = sections[sectionKey];
  if ("narrative" in section && replaceFlatParagraphsWithTable(section.narrative, tableNode)) {
    return true;
  }

  if (sectionKey === "analyze") {
    const analyze = sections.analyze;
    if (replaceFlatParagraphsWithTable(analyze.investigationOutcome, tableNode)) return true;
    if (replaceFlatParagraphsWithTable(analyze.rootCause.narrative, tableNode)) return true;

    const sixMKeys = [
      "man",
      "machine",
      "measurement",
      "material",
      "method",
      "milieu",
      "conclusion",
    ] as const;
    for (const key of sixMKeys) {
      const replaced = replaceFlatTextWithPlainTable(analyze.sixM[key], tableNode);
      if (replaced !== analyze.sixM[key]) {
        analyze.sixM[key] = replaced;
        return true;
      }
    }

    if (replaceFlatParagraphsWithTable(analyze.fiveWhy.narrative, tableNode)) return true;

    for (const key of ["brainstorming", "otherTools"] as const) {
      const replaced = replaceFlatTextWithPlainTable(analyze[key], tableNode);
      if (replaced !== analyze[key]) {
        analyze[key] = replaced;
        return true;
      }
    }

    if (replaceFlatParagraphsWithTable(analyze.impactAssessment, tableNode)) return true;
  }

  if (sectionKey === "improve") {
    if (replaceFlatParagraphsWithTable(sections.improve.correctiveActions, tableNode)) {
      return true;
    }
  }

  if (sectionKey === "control") {
    if (replaceFlatParagraphsWithTable(sections.control.preventiveActions, tableNode)) {
      return true;
    }
  }

  return false;
}

function isSignatureTipTapTable(tableNode: JSONContent): boolean {
  const cellTexts = extractTableCellTexts(tableNode);
  const joined = cellTexts.join(" ");
  return (
    /\bPrepared\b/i.test(joined) &&
    /\bSign\/Date\b/i.test(joined) &&
    (/\bReviewed\b/i.test(joined) || /\bApproved\b/i.test(joined))
  );
}

/**
 * Extract all paragraph text values from table cells in reading order.
 * Mammoth flattens multi-line cells as separate paragraphs in markdown, so the
 * replacement matcher must use the same granularity.
 */
function extractTableCellTexts(tableNode: JSONContent): string[] {
  const texts: string[] = [];
  for (const row of tableNode.content ?? []) {
    for (const cell of row.content ?? []) {
      const cellTexts = extractCellParagraphTexts(cell);
      if (cellTexts.length > 0) texts.push(...cellTexts);
    }
  }
  return texts;
}

function extractTableRowsText(tableNode: JSONContent): string[][] {
  return (tableNode.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => extractCellParagraphTexts(cell).join("\n").trim())
  );
}

function escapeMarkdownTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n+\s*/g, "<br>");
}

function tableNodeToPlainMarkdown(tableNode: JSONContent): string {
  const rows = extractTableRowsText(tableNode).filter((row) => row.some(Boolean));
  if (rows.length === 0) return "";

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => escapeMarkdownTableCell(row[index] ?? ""))
  );
  const header = normalizedRows[0]!;
  const separator = Array.from({ length: columnCount }, () => "---");
  const body = normalizedRows.slice(1);

  return [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function extractCellParagraphTexts(node: JSONContent): string[] {
  if (node.type === "paragraph") {
    const text = extractParagraphTexts(node);
    return text ? [text] : [];
  }
  if (!node.content?.length) return [];
  return node.content.flatMap(extractCellParagraphTexts);
}

function extractParagraphTexts(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  if (!node.content?.length) return "";
  return node.content.map(extractParagraphTexts).join("").replace(/\s+/g, " ").trim();
}

/**
 * Get the plain text of a narrative paragraph node.
 */
function paragraphText(para: JSONContent): string {
  if (para.type === "text") return (para.text ?? "").trim();
  if (!para.content?.length) return "";
  return para.content.map(paragraphText).join("").trim();
}

function findOrderedCellTextRun(
  length: number,
  textAt: (index: number) => string,
  start: number,
  cellTexts: string[]
): { end: number; matchedCells: number } {
  let end = start;
  let expectedIndex = 0;
  let matchedCells = 0;

  while (end < length && expectedIndex < cellTexts.length) {
    const text = textAt(end);
    if (!text) {
      end++;
      continue;
    }

    let matchedIndex = -1;
    for (let i = expectedIndex; i < cellTexts.length; i++) {
      if (cellTexts[i] === text) {
        matchedIndex = i;
        break;
      }
    }
    if (matchedIndex === -1) break;

    matchedCells++;
    expectedIndex = matchedIndex + 1;
    end++;
  }

  return { end, matchedCells };
}

/**
 * Find consecutive paragraphs in the narrative whose text matches the table's
 * cell values (in order), and replace them with the table node. The match uses
 * the table's header row cells to anchor the search, then extends forward to
 * cover all remaining cell values.
 */
function replaceFlatParagraphsWithTable(
  narrative: JSONContent,
  tableNode: JSONContent
): boolean {
  const cellTexts = extractTableCellTexts(tableNode);
  if (cellTexts.length === 0) return false;

  const content = narrative.content;
  if (!content?.length) return false;

  // Find the first paragraph whose text appears in the table's cell values.
  // Use the FIRST header cell as anchor since it's the most distinctive.
  const firstHeaderText = cellTexts[0];
  if (!firstHeaderText) return false;

  let anchorStart = -1;
  for (let i = 0; i < content.length; i++) {
    if (paragraphText(content[i]!) === firstHeaderText) {
      anchorStart = i;
      break;
    }
  }
  if (anchorStart === -1) return false;

  const { end: matchEndRaw, matchedCells } = findOrderedCellTextRun(
    content.length,
    (index) => paragraphText(content[index]!),
    anchorStart,
    cellTexts
  );

  // Require matching at least half the cell texts to avoid false positives.
  if (matchedCells < Math.min(cellTexts.length, 3)) return false;

  let matchEnd = matchEndRaw;
  // Skip trailing empty paragraphs after the table data.
  while (matchEnd < content.length && !paragraphText(content[matchEnd]!)) {
    matchEnd++;
  }

  // Replace the flat paragraphs [anchorStart..matchEnd) with the table node.
  content.splice(anchorStart, matchEnd - anchorStart, tableNode);
  return true;
}

function replaceFlatTextWithPlainTable(text: string, tableNode: JSONContent): string {
  const cellTexts = extractTableCellTexts(tableNode);
  const tableText = tableNodeToPlainMarkdown(tableNode);
  if (cellTexts.length === 0 || !tableText) return text;

  const lines = text.split(/\r?\n/);
  const firstHeaderText = cellTexts[0];
  if (!firstHeaderText) return text;

  const anchorStart = lines.findIndex((line) => line.trim() === firstHeaderText);
  if (anchorStart === -1) return text;

  const { end: matchEndRaw, matchedCells } = findOrderedCellTextRun(
    lines.length,
    (index) => lines[index]!.trim(),
    anchorStart,
    cellTexts
  );

  if (matchedCells < Math.min(cellTexts.length, 3)) return text;

  let matchEnd = matchEndRaw;
  while (matchEnd < lines.length && !lines[matchEnd]!.trim()) {
    matchEnd++;
  }

  return cleanImportedText([
    ...lines.slice(0, anchorStart),
    tableText,
    ...lines.slice(matchEnd),
  ].join("\n"));
}

function emptyDocFallback(foundHeadings: boolean, raw: string) {
  if (foundHeadings) return legacyStringToDoc("");
  return legacyStringToDoc(raw.trim() || "");
}

/** @internal exported for tests */
export function parseAnalyzeOtherToolsForTest(body: string) {
  return parseAnalyzeOtherTools(body);
}
