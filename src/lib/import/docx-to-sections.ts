import mammoth from "mammoth";
import type {
  AnalyzeSection,
  CorrectiveAction,
  MeasureSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT, SECTION_LABELS } from "@/types/sections";
import { legacyStringToDoc } from "@/lib/tiptap/rich-text";

type EditableKey = "define" | "measure" | "analyze" | "improve" | "control";

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
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^following checks shall be considered/i.test(line.trim())
  );
  if (start === -1) return text;

  let end = start + 1;
  while (
    end < lines.length &&
    (lines[end]!.trim() === "" || /^[•*-]\s+/.test(lines[end]!.trim()))
  ) {
    end += 1;
  }

  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
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
  const notificationLabel = findInlineLabel(body, "Regulatory Notification");
  const regulatoryNotification = notificationLabel
    ? cleanImportedText(body.slice(notificationLabel.index + notificationLabel[0].length))
    : "";
  const narrative = notificationLabel
    ? cleanImportedText(body.slice(0, notificationLabel.index))
    : body;

  return {
    ...EMPTY_CONTENT.measure,
    narrative: legacyStringToDoc(narrative),
    regulatoryNotification,
  };
}

function parseFiveWhys(text: string): AnalyzeSection["fiveWhy"]["whys"] {
  const whys: AnalyzeSection["fiveWhy"]["whys"] = [];
  const re =
    /^\s*(?:\d+\.)\s*Why\s*:\s*([\s\S]*?)^\s*Ans\.?\s*([\s\S]*?)(?=^\s*(?:\d+\.)\s*Why\s*:|^\s*Conclusion\s*:|\s*$)/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    whys.push({
      question: cleanImportedText(match[1] ?? ""),
      answer: cleanImportedText(match[2] ?? ""),
    });
  }
  return whys.length > 0 ? whys : EMPTY_CONTENT.analyze.fiveWhy.whys;
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
      whys: parseFiveWhys(fiveWhyBlock),
      conclusion: getLineValue(fiveWhyBlock, "Conclusion"),
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

/**
 * Reads a .docx buffer and maps recognizable DMAIC blocks into section content.
 * Uses plain-text extraction and heading lines that match section titles (Define, Measure, …).
 */
export async function docxBufferToSectionContentMap(
  buffer: Buffer
): Promise<Pick<
  SectionContentMap,
  "define" | "measure" | "analyze" | "improve" | "control"
>> {
  const { value: raw } = await mammoth.extractRawText({ buffer });
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

function emptyDocFallback(foundHeadings: boolean, raw: string) {
  if (foundHeadings) return legacyStringToDoc("");
  return legacyStringToDoc(raw.trim() || "");
}
