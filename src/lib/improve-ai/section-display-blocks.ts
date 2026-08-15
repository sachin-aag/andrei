import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type { AnalyzeSection } from "@/types/sections";
import { collapseFiveWhyFields } from "@/lib/analyze-five-why";
import {
  compactText,
  compactTextPreservingNewlines,
  isRecord,
} from "@/lib/ai/section-context";
import { normalizeRichField, richJsonToPlainText } from "@/lib/tiptap/rich-text";

export type ImproveAiDisplayBlock =
  | { kind: "plain"; label: string; text: string }
  | { kind: "rich"; label: string; doc: JSONContent };

function pushPlainBlock(
  blocks: ImproveAiDisplayBlock[],
  label: string,
  value: unknown
) {
  if (typeof value !== "string") return;
  const text = compactTextPreservingNewlines(value);
  if (!text) return;
  blocks.push({ kind: "plain", label, text });
}

function pushRichBlock(
  blocks: ImproveAiDisplayBlock[],
  label: string,
  value: unknown
) {
  const doc = normalizeRichField(value);
  if (!richJsonToPlainText(doc).trim()) return;
  blocks.push({ kind: "rich", label, doc });
}

function pushObjectFields(
  blocks: ImproveAiDisplayBlock[],
  heading: string,
  value: unknown,
  fields: Array<[string, string]>
) {
  if (!isRecord(value)) return;
  for (const [key, label] of fields) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string" && fieldValue.trim()) {
      pushPlainBlock(blocks, `${heading} — ${label}`, fieldValue);
    }
  }
}

/** Structured blocks for Improve AI section preview (tables + equations render in rich fields). */
export function buildSectionDisplayBlocks(
  section: SectionType,
  content: unknown
): ImproveAiDisplayBlock[] {
  if (!isRecord(content)) return [];

  const blocks: ImproveAiDisplayBlock[] = [];

  if (section === "define") {
    pushRichBlock(blocks, "Narrative", content.narrative);
  } else if (section === "measure") {
    pushRichBlock(blocks, "Narrative", content.narrative);
    pushPlainBlock(blocks, "Experiment number", content.experimentNumber);
    pushPlainBlock(blocks, "Experiment title", content.experimentTitle);
    pushRichBlock(blocks, "Experiment purpose", content.purpose);
    pushRichBlock(blocks, "Experiment conclusion", content.conclusion);
    pushPlainBlock(blocks, "Regulatory notification", content.regulatoryNotification);
  } else if (section === "analyze") {
    pushObjectFields(blocks, "6M", content.sixM, [
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
    pushRichBlock(blocks, "5-Why", fiveWhyCollapsed.narrative);
    pushRichBlock(
      blocks,
      "Investigation outcome",
      content.investigationOutcome
    );
    const rootCause = content.rootCause as AnalyzeSection["rootCause"] | undefined;
    pushRichBlock(blocks, "Root cause", rootCause?.narrative);
    pushRichBlock(blocks, "Impact assessment", content.impactAssessment);
  } else if (section === "improve") {
    pushRichBlock(blocks, "Corrective actions", content.correctiveActions);
    pushRichBlock(blocks, "Narrative", content.narrative);
  } else if (section === "control") {
    pushRichBlock(blocks, "Preventive actions", content.preventiveActions);
  } else if (section === "conclusion") {
    pushRichBlock(blocks, "Narrative", content.narrative);
  }

  return blocks;
}

export function sectionDisplayBlocksHaveContent(blocks: ImproveAiDisplayBlock[]): boolean {
  return blocks.some((block) =>
    block.kind === "plain"
      ? block.text.trim().length > 0
      : richJsonToPlainText(block.doc).trim().length > 0
  );
}

/** Flat text for prompts / legacy consumers (unchanged behavior). */
export function blocksToPromptText(blocks: ImproveAiDisplayBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.kind === "plain") {
      const cleaned = compactTextPreservingNewlines(block.text);
      if (!cleaned) continue;
      if (cleaned.includes("\n")) {
        lines.push(`${block.label}:\n${cleaned}`);
      } else {
        lines.push(`${block.label}: ${compactText(cleaned)}`);
      }
      continue;
    }
    const cleaned = compactTextPreservingNewlines(
      richJsonToPlainText(block.doc, { tableFormat: "markdown" })
    );
    if (!cleaned) continue;
    if (cleaned.includes("\n")) {
      lines.push(`${block.label}:\n${cleaned}`);
    } else {
      lines.push(`${block.label}: ${cleaned}`);
    }
  }
  return lines.join("\n");
}
