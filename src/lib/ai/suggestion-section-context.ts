import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type { AnalyzeSection } from "@/types/sections";
import { collapseFiveWhyFields } from "@/lib/analyze-five-why";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { normalizeRichField } from "@/lib/tiptap/rich-text";
import {
  compactText,
  compactTextPreservingNewlines,
  fallbackContextForPrompt,
  isRecord,
  pushObjectFields,
  pushTextLine,
} from "@/lib/ai/section-context";

/**
 * Suggestion-only SECTION CONTENT serializer.
 *
 * Uses the canonical anchor string (`flattenForAnchor`) for rich fields so the
 * model sees the same text the locate/apply path searches. Eval continues to
 * use `contextForPrompt` (markdown) — do not change that path.
 */

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

function canonicalRichText(value: unknown): string {
  const doc = normalizeRichField(value) as JSONContent;
  return flattenForAnchor(doc).text;
}

function pushCanonicalBlock(lines: string[], label: string, value: unknown) {
  if (typeof value !== "string") return;
  const cleaned = compactTextPreservingNewlines(value);
  if (!cleaned) return;
  if (cleaned.includes("\n")) {
    lines.push(`${label}:\n${cleaned}`);
  } else {
    lines.push(`${label}: ${cleaned}`);
  }
}

function pushCanonicalNarrative(
  lines: string[],
  section: SectionType,
  content: Record<string, unknown>
) {
  const text = stripLeadingTemplateChecklist(
    section,
    canonicalRichText(content.narrative)
  );
  if (!text) return;
  const cleaned = compactTextPreservingNewlines(text);
  if (cleaned.includes("\n")) {
    lines.push(`Narrative:\n${cleaned}`);
  } else {
    lines.push(`Narrative: ${cleaned}`);
  }
}

/**
 * Build SECTION CONTENT for suggestion generation / chat read_section.
 * Prior/read-only sections may still use markdown via `contextForPrompt`.
 */
export function contextForSuggestionPrompt(
  section: SectionType,
  content: unknown
): string {
  if (!isRecord(content)) return fallbackContextForPrompt(content);

  const lines: string[] = [];
  if (section === "define") {
    pushCanonicalNarrative(lines, section, content);
  } else if (section === "measure") {
    pushCanonicalNarrative(lines, section, content);
    pushTextLine(lines, "Regulatory notification", content.regulatoryNotification);
    pushTextLine(lines, "Experiment number", content.experimentNumber);
    pushTextLine(lines, "Experiment title", content.experimentTitle);
    pushCanonicalBlock(lines, "Experiment purpose", canonicalRichText(content.purpose));
    pushCanonicalBlock(
      lines,
      "Experiment conclusion",
      canonicalRichText(content.conclusion)
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
    pushCanonicalBlock(
      lines,
      "5-Why",
      flattenForAnchor(fiveWhyCollapsed.narrative as JSONContent).text
    );
    pushTextLine(lines, "Brainstorming", content.brainstorming);
    pushTextLine(lines, "Other tools", content.otherTools);
    pushCanonicalBlock(
      lines,
      "Investigation outcome",
      canonicalRichText(content.investigationOutcome)
    );
    const rootCause = content.rootCause as AnalyzeSection["rootCause"] | undefined;
    pushCanonicalBlock(
      lines,
      "Root cause",
      canonicalRichText(rootCause?.narrative)
    );
    pushCanonicalBlock(
      lines,
      "Impact assessment",
      canonicalRichText(content.impactAssessment)
    );
  } else if (section === "improve") {
    pushCanonicalBlock(
      lines,
      "Corrective actions",
      canonicalRichText(content.correctiveActions)
    );
  } else if (section === "control") {
    const raw = canonicalRichText(content.preventiveActions);
    const stripped = stripLeadingTemplateChecklist(section, raw);
    pushTextLine(lines, "Preventive actions", stripped);
  } else if (section === "conclusion") {
    pushCanonicalNarrative(lines, section, content);
  }

  return lines.length ? lines.join("\n") : fallbackContextForPrompt(content);
}

/** Compact helper for tests / drop-rate measurement. */
export function compactCanonical(value: string): string {
  return compactText(value);
}
