import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type { AnalyzeSection } from "@/types/sections";
import { collapseFiveWhyFields } from "@/lib/analyze-five-why";
import { normalizeRichField, richJsonToPlainText } from "@/lib/tiptap/rich-text";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Collapses runs of spaces/tabs within each line but preserves line breaks.
 * Used for narrative content that may include markdown tables — we don't want
 * to flatten table rows into a single line, but we still want clean prose.
 */
export function compactTextPreservingNewlines(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripLeadingTemplateChecklist(section: SectionType, value: string): string {
  if (section !== "improve" && section !== "control") return value;

  const marker =
    section === "improve"
      ? /^improve section covers the corrective actions\s*/i
      : /^control section covers the preventive actions\s*/i;

  let text = value.trim();
  if (!marker.test(text)) return value;

  text = text.replace(marker, "").trimStart();

  while (text) {
    const checklistSentence = text.match(
      /^(?:(?:is|are|was|were|does|do|did)\b|capa required\b)[^?.]*(?:[?.]\s*|$)/i
    );
    if (!checklistSentence) break;

    text = text.slice(checklistSentence[0].length).trimStart();
  }

  return text;
}

export function tiptapText(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    (value as JSONContent).type === "doc"
  ) {
    // Use markdown table format so the LLM sees explicit headers, separator
    // rows, and expanded merged cells instead of an ambiguous pipe stream.
    return richJsonToPlainText(value as JSONContent, { tableFormat: "markdown" });
  }

  const pieces: string[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as JSONContent;
    if (typeof n.text === "string") pieces.push(n.text);
    if (n.type === "hardBreak" || n.type === "paragraph") pieces.push("\n");
    if (n.content?.length) n.content.forEach(visit);
  }
  visit(value);
  return pieces.join(" ").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
}

export function pushTextLine(
  lines: string[],
  label: string,
  value: unknown
) {
  if (typeof value !== "string") return;
  const text = compactText(value);
  if (text) lines.push(`${label}: ${text}`);
}

/** Multi-line plain text: preserves paragraph breaks so SECTION CONTENT stays readable in the user prompt. */
export function pushTextBlock(lines: string[], label: string, value: unknown) {
  if (typeof value !== "string") return;
  const cleaned = compactTextPreservingNewlines(value);
  if (!cleaned) return;
  if (cleaned.includes("\n")) {
    lines.push(`${label}:\n${cleaned}`);
  } else {
    lines.push(`${label}: ${cleaned}`);
  }
}

export function pushNarrativeLine(
  lines: string[],
  section: SectionType,
  content: Record<string, unknown>
) {
  const text = stripLeadingTemplateChecklist(section, tiptapText(content.narrative));
  if (!text) return;
  const cleaned = compactTextPreservingNewlines(text);
  // Multi-line narratives (especially ones containing markdown tables) read
  // better when the label is on its own line so the table's first `|` row
  // starts at column 0.
  if (cleaned.includes("\n")) {
    lines.push(`Narrative:\n${cleaned}`);
  } else {
    lines.push(`Narrative: ${cleaned}`);
  }
}

export function pushObjectFields(
  lines: string[],
  heading: string,
  value: unknown,
  fields: Array<[string, string]>
) {
  if (!isRecord(value)) return;
  const fieldLines: string[] = [];
  for (const [key, label] of fields) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string" && fieldValue.trim()) {
      fieldLines.push(`${label}: ${compactText(fieldValue)}`);
    }
  }
  if (fieldLines.length) lines.push(`${heading}: ${fieldLines.join("; ")}`);
}

export function fallbackContextForPrompt(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

export function contextForPrompt(section: SectionType, content: unknown): string {
  if (!isRecord(content)) return fallbackContextForPrompt(content);

  const lines: string[] = [];
  if (section === "define") {
    pushNarrativeLine(lines, section, content);
  } else if (section === "measure") {
    pushNarrativeLine(lines, section, content);
    pushTextLine(lines, "Regulatory notification", content.regulatoryNotification);
    pushTextLine(lines, "Experiment number", content.experimentNumber);
    pushTextLine(lines, "Experiment title", content.experimentTitle);
    pushTextBlock(
      lines,
      "Experiment purpose",
      richJsonToPlainText(normalizeRichField(content.purpose))
    );
    pushTextBlock(
      lines,
      "Experiment conclusion",
      richJsonToPlainText(normalizeRichField(content.conclusion))
    );
  } else if (section === "analyze") {
    pushObjectFields(lines, "6M", content.sixM, [
      ["man", "Man"],
      ["machine", "Machine"],
      ["measurement", "Measurement"],
      ["material", "Material"],
      ["method", "Method"],
      ["milieu", "Milieu"],
      ["conclusion", "Conclusion"],
    ]);
    const fiveWhyCollapsed = collapseFiveWhyFields(
      content.fiveWhy as AnalyzeSection["fiveWhy"]
    );
    pushTextBlock(
      lines,
      "5-Why",
      richJsonToPlainText(fiveWhyCollapsed.narrative, { tableFormat: "markdown" })
    );
    pushTextBlock(
      lines,
      "Investigation outcome",
      richJsonToPlainText(normalizeRichField(content.investigationOutcome))
    );
    const rootCause = content.rootCause as AnalyzeSection["rootCause"] | undefined;
    pushTextBlock(
      lines,
      "Root cause",
      richJsonToPlainText(normalizeRichField(rootCause?.narrative))
    );
    pushTextBlock(
      lines,
      "Impact assessment",
      richJsonToPlainText(normalizeRichField(content.impactAssessment))
    );
  } else if (section === "improve") {
    pushTextBlock(
      lines,
      "Corrective actions",
      richJsonToPlainText(normalizeRichField(content.correctiveActions))
    );
  } else if (section === "control") {
    const raw = richJsonToPlainText(normalizeRichField(content.preventiveActions));
    const stripped = stripLeadingTemplateChecklist(section, raw);
    pushTextLine(lines, "Preventive actions", stripped);
  } else if (section === "conclusion") {
    pushNarrativeLine(lines, section, content);
  }

  return lines.length ? lines.join("\n") : fallbackContextForPrompt(content);
}
