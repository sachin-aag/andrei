import type { AnalyzeSection, MeasureSection, SectionContentMap } from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
import { emptyDoc, legacyStringToDoc } from "@/lib/tiptap/rich-text";
import type { ImportedSections } from "@/lib/import/docx-import-types";
import {
  cleanImportedNarrativeText,
  cleanImportedText,
  findLabel,
  getBetweenLabels,
  getInlineBetweenLabel,
  getLineValue,
  hasLabel,
  textBeforeAnyInlineLabel,
  textBeforeAnyLabel,
} from "@/lib/import/docx-import-text";
import { splitPlainTextIntoSections } from "@/lib/import/docx-section-split";

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
  return { narrative: cleanImportedText(text), conclusion: "" };
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
    impactAssessment: parseImpactAssessmentBlock(body),
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

function emptyDocFallback(foundHeadings: boolean, raw: string) {
  if (foundHeadings) return legacyStringToDoc("");
  return legacyStringToDoc(raw.trim() || "");
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
      correctiveActions: correctiveActionsUnified,
    },
    control: {
      ...EMPTY_CONTENT.control,
      preventiveActions: controlPreventiveUnified,
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

/** @internal exported for tests */
export function parseAnalyzeOtherToolsForTest(body: string) {
  return parseAnalyzeOtherTools(body);
}
