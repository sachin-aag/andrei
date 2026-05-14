import mammoth from "mammoth";
import PizZip from "pizzip";
import type {
  AnalyzeSection,
  CorrectiveAction,
  MeasureSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT, SECTION_LABELS } from "@/types/sections";
import { legacyStringToDoc } from "@/lib/tiptap/rich-text";
import { SECTION_GUIDANCE } from "@/lib/report-section-guidance";

type EditableKey = "define" | "measure" | "analyze" | "improve" | "control";
type ImportedSections = Pick<
  SectionContentMap,
  "define" | "measure" | "analyze" | "improve" | "control"
>;

export type ImportedReportContent = {
  sections: ImportedSections;
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean };
};

const SECTION_ORDER: EditableKey[] = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
];

type HeadingMatch = {
  key: EditableKey;
  remainder: string;
};

const NON_EDITABLE_EXPORT_HEADING_RE =
  /^(?:details\s+investigation|documents?\s+reviewed|document\s+reviewed|list\s+of\s+attachments?|prepared\s+by|reviewed\s+by|approved(?:\s+by)?)/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(labels: string): string {
  return `${escapeRegex(labels)}(?![A-Za-z0-9_])(?:[ \\t]*\\([^)]*\\))?[ \\t]*:?[ \\t]*`;
}

/** Match an exported section title line (Word headings, numbered sections, or `Define:` labels). */
function matchSectionHeading(trimmedLine: string): HeadingMatch | null {
  const t = trimmedLine.replace(/\s+/g, " ").trim();
  for (const key of SECTION_ORDER) {
    const label = SECTION_LABELS[key];
    const escaped = escapeRegex(label);
    const re = new RegExp(
      `^(?:\\d+(?:\\.\\d+)*\\.?\\s+|(?:section|part)\\s+[ivxlcdm]+\\s*[.:)]\\s*)?${escaped}(?:\\s*[:\\-–—]\\s*(.*)|\\s*)$`,
      "i"
    );
    const match = re.exec(t);
    if (match) return { key, remainder: match[1]?.trim() ?? "" };
  }
  return null;
}

function splitPlainTextIntoSections(raw: string): {
  sections: Record<EditableKey, string>;
  foundHeadings: boolean;
} {
  const lines = raw.split(/\r?\n/);
  const buckets: Record<EditableKey, string[]> = {
    define: [],
    measure: [],
    analyze: [],
    improve: [],
    control: [],
  };
  let current: EditableKey | "preamble" | "ignored" = "preamble";
  let foundHeadings = false;

  for (const line of lines) {
    const heading = matchSectionHeading(line);
    if (heading) {
      foundHeadings = true;
      current = heading.key;
      if (heading.remainder) buckets[current].push(heading.remainder);
      continue;
    }
    if (NON_EDITABLE_EXPORT_HEADING_RE.test(line.trim())) {
      current = "ignored";
      continue;
    }
    if (current !== "preamble" && current !== "ignored") buckets[current].push(line);
  }

  if (!foundHeadings) {
    return {
      sections: {
        define: raw.trim(),
        measure: "",
        analyze: "",
        improve: "",
        control: "",
      },
      foundHeadings: false,
    };
  }

  const sections = {} as Record<EditableKey, string>;
  for (const key of SECTION_ORDER) {
    sections[key] = buckets[key].join("\n").trim();
  }

  return { sections, foundHeadings: true };
}

function cleanImportedText(text: string): string {
  return text
    .replace(/\{[#/][^}]+\}/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripGuidanceChecklist(text: string): string {
  const guidance = Object.values(SECTION_GUIDANCE)
    .flat()
    .map(normalizeGuidanceLine);

  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (/^following (?:checks|checkpoints?) shall be considered/i.test(trimmed)) {
        return false;
      }
      const normalized = normalizeGuidanceLine(trimmed);
      return !guidance.some(
        (item) => normalized === item || normalized.includes(item) || item.includes(normalized)
      );
    })
    .join("\n");
}

function normalizeGuidanceLine(text: string): string {
  return text
    .replace(/^[•*\-]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
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

function parseMeasure(text: string): MeasureSection {
  const body = cleanImportedText(stripGuidanceChecklist(text));

  return {
    ...EMPTY_CONTENT.measure,
    narrative: legacyStringToDoc(body),
  };
}

function splitConclusionBlock(text: string): { body: string; conclusion: string } {
  const match = findLabel(text, ["Conclusion"]);
  if (!match) return { body: cleanImportedText(text), conclusion: "" };

  return {
    body: cleanImportedText(text.slice(0, match.index)),
    conclusion: cleanImportedText(text.slice(match.index + match[0].length)),
  };
}

function normalizeFiveWhyNarrative(text: string): string {
  return cleanImportedText(text);
}

function parseFiveWhyBlock(text: string): AnalyzeSection["fiveWhy"] {
  const { body, conclusion } = splitConclusionBlock(text);
  return {
    narrative: normalizeFiveWhyNarrative(body),
    conclusion,
  };
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
    otherTools: getBetweenLabels(body, ["Other Tool if Any", "Other Tools (If any)"], [
      "Investigation Outcome",
    ]),
    investigationOutcome: getBetweenLabels(body, ["Investigation Outcome"], [
      "Identified Root Cause/ Probable Cause",
      "Identified Root Cause / Probable Cause",
      "Primary Root Cause Level 1",
      "Impact Assessment (System/ Document/ Product/ Equipment/Patient safety/Past batches)",
    ]),
    rootCause: {
      narrative: getBetweenLabels(
        body,
        ["Identified Root Cause/ Probable Cause", "Identified Root Cause / Probable Cause"],
        ["Primary Root Cause Level 1", "Impact Assessment"]
      ),
      primaryLevel1: getLineValue(body, "Primary Root Cause Level 1"),
      secondaryLevel2: getLineValue(body, "Secondary Root Cause Level 2"),
      thirdLevel3: getLineValue(body, "Third Root Cause Level 3"),
    },
    impactAssessment: {
      system: getLineValue(body, "System"),
      document: getLineValue(body, "Document"),
      product: getLineValue(body, "Product"),
      equipment: getLineValue(body, "Equipment"),
      patientSafety:
        getLineValueMaybe(body, "Patient safety / Past Batches") ??
        getLineValue(body, "Patient safety"),
    },
  };
}

function parseCorrectiveActions(text: string): CorrectiveAction[] {
  const register = getBetweenLabels(text, ["Corrective Actions Register"], []);
  if (!register) return [];

  const actions: CorrectiveAction[] = [];
  const starts = Array.from(register.matchAll(/^CA-\d+\s*:\s*/gim));
  for (let idx = 0; idx < starts.length; idx++) {
    const match = starts[idx]!;
    const next = starts[idx + 1];
    const start = match.index + match[0].length;
    const end = next?.index ?? register.length;
    const block = cleanImportedText(register.slice(start, end));
    actions.push({
      id: `imported-ca-${actions.length + 1}`,
      description: textBeforeAnyInlineLabel(block, [
        "Responsible person",
        "Due date",
        "Expected outcome",
        "Effectiveness verification",
      ]),
      responsiblePerson: getInlineBetweenLabel(block, "Responsible person", [
        "Due date",
        "Expected outcome",
        "Effectiveness verification",
      ]),
      dueDate: getInlineBetweenLabel(block, "Due date", [
        "Expected outcome",
        "Effectiveness verification",
      ]),
      expectedOutcome: getInlineBetweenLabel(block, "Expected outcome", [
        "Effectiveness verification",
      ]),
      effectivenessVerification: getInlineBetweenLabel(block, "Effectiveness verification", []),
    });
  }

  return actions;
}

function parsePreventiveActions(text: string): string {
  const register = getBetweenLabels(text, ["Preventive Actions Register"], [
    "Interim Plan",
    "Final Comments",
    "Impact Assessment (post-investigation)",
  ]);
  const starts = Array.from(register.matchAll(/^PA-\d+\s*:\s*/gim));
  if (starts.length === 0) {
    return cleanImportedText(
      register
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          return trimmed !== ":" && !/^[A-Za-z][A-Za-z /-]*:\s*$/.test(trimmed);
        })
        .join("\n")
    );
  }

  const entries: string[] = [];
  for (let idx = 0; idx < starts.length; idx++) {
    const match = starts[idx]!;
    const next = starts[idx + 1];
    const start = match.index + match[0].length;
    const end = next?.index ?? register.length;
    const block = cleanImportedText(register.slice(start, end));
    const description = textBeforeAnyInlineLabel(block, [
      "Linked root cause",
      "Responsible person",
      "Due date",
      "Expected outcome",
      "Effectiveness verification",
    ]);
    const details = [
      ["Linked root cause", getInlineBetweenLabel(block, "Linked root cause", [
        "Responsible person",
        "Due date",
        "Expected outcome",
        "Effectiveness verification",
      ])],
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
      ["Effectiveness verification", getInlineBetweenLabel(
        block,
        "Effectiveness verification",
        []
      )],
    ]
      .filter(([, value]) => value && value !== "—")
      .map(([label, value]) => `${label}: ${value}`);

    entries.push(cleanImportedText([description, ...details].filter(Boolean).join("\n")));
  }

  return cleanImportedText(entries.filter(Boolean).join("\n\n"));
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
    const runs = toolsPara.match(/<\w+:r\b[\s\S]*?<\/\w+:r>/g) ?? [];
    for (const run of runs) {
      const checkbox = checkboxStateFromRun(run);
      if (checkbox !== null) {
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

function buildSectionsFromRaw(raw: string): ImportedSections {
  const { sections, foundHeadings } = splitPlainTextIntoSections(raw);

  const defineText = cleanImportedText(stripGuidanceChecklist(sections.define));
  const improveBody = cleanImportedText(stripGuidanceChecklist(sections.improve));
  const controlBody = cleanImportedText(stripGuidanceChecklist(sections.control));

  const defineNarr = defineText
    ? legacyStringToDoc(defineText)
    : emptyDocFallback(foundHeadings, raw);
  const improveNarrative = getBetweenLabels(improveBody, ["Corrective Action"], [
    "Corrective Actions Register",
  ]);
  const controlNarrative = getBetweenLabels(controlBody, ["Preventive Action"], [
    "Preventive Actions Register",
  ]);

  return {
    define: {
      ...EMPTY_CONTENT.define,
      narrative: defineNarr,
    },
    measure: parseMeasure(sections.measure),
    analyze: buildAnalyzeFromChunk(sections.analyze),
    improve: {
      ...EMPTY_CONTENT.improve,
      narrative: legacyStringToDoc(
        improveNarrative ||
          (hasLabel(improveBody, ["Corrective Action"]) ? "" : improveBody)
      ),
      correctiveActions: parseCorrectiveActions(improveBody),
    },
    control: {
      ...EMPTY_CONTENT.control,
      narrative: legacyStringToDoc(
        controlNarrative ||
          (hasLabel(controlBody, ["Preventive Action"]) ? "" : controlBody)
      ),
      preventiveActions: parsePreventiveActions(controlBody),
      interimPlan: getBetweenLabels(controlBody, ["Interim Plan"], [
        "Final Comments",
        "Impact Assessment (post-investigation)",
      ]),
      finalComments: getBetweenLabels(controlBody, ["Final Comments"], [
        "Impact Assessment (post-investigation)",
      ]),
      regulatoryImpact: getLineValue(controlBody, "Regulatory Impact / Notification"),
      productQuality: getLineValue(controlBody, "Product Quality"),
      validation: getLineValue(controlBody, "Validation"),
      stability: getLineValue(controlBody, "Stability"),
      marketClinical: getLineValue(controlBody, "Market / Clinical"),
      lotDisposition: getLineValue(controlBody, "Lot Disposition"),
      conclusion: getLineValue(controlBody, "Conclusion"),
    },
  };
}

/**
 * Reads a .docx buffer and maps recognizable DMAIC blocks into section content.
 * Uses plain-text extraction and heading lines that match section titles (Define, Measure, …).
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
  const { value: raw } = await mammoth.extractRawText({ buffer });
  return {
    sections: buildSectionsFromRaw(raw),
    toolsUsed: parseToolsUsedFromDocxXml(buffer) ?? parseToolsUsed(raw),
  };
}

function emptyDocFallback(foundHeadings: boolean, raw: string) {
  if (foundHeadings) return legacyStringToDoc("");
  return legacyStringToDoc(raw.trim() || "");
}
