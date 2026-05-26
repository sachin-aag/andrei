import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import {
  CONTROL_SECTION_HEADER,
  CONTROL_SECTION_INTRO,
  IMPROVE_SECTION_HEADER,
  IMPROVE_SECTION_INTRO,
} from "@/lib/report-section-guidance";
import type { DocxExportContext } from "@/lib/export/docx-export-context";
import { narrativeToDocxXmlWithContext } from "@/lib/export/narrative-to-docx-xml";
import { linesToDoc } from "@/lib/tiptap/rich-text";

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim().toLowerCase();
}

function isFullBoldCheckpointLine(line: string, section: "improve" | "control"): boolean {
  const normalized = normalizeLine(line);
  const candidates =
    section === "improve"
      ? [
          IMPROVE_SECTION_HEADER,
          IMPROVE_SECTION_INTRO,
          IMPROVE_SECTION_HEADER.replace(/^Improve:\s*/i, ""),
          IMPROVE_SECTION_INTRO,
        ]
      : [
          CONTROL_SECTION_HEADER,
          CONTROL_SECTION_INTRO,
          CONTROL_SECTION_HEADER.replace(/^Control:\s*/i, ""),
          CONTROL_SECTION_INTRO,
        ];

  return candidates.some((candidate) => {
    const target = normalizeLine(candidate);
    return (
      normalized === target ||
      normalized.startsWith(target) ||
      target.startsWith(normalized)
    );
  });
}

/** Phrases bolded in the Word template checklist lines (longest first). */
const IMPROVE_BOLD_PHRASES = [
  "specific corrective Actions",
  "specific Corrective Actions",
  "Corrective Actions",
  "Corrective action",
  "state of control/compliance",
  "control/compliance",
  "state of control",
  "preventive action",
  "Preventive Action",
] as const;

const CONTROL_BOLD_PHRASES = [
  "Preventive Actions",
  "Preventive Action",
  "Preventive action",
  "preventive actions",
  "preventive action",
  "Interim Plan",
  "state the control",
  "state of control",
  "Final Comments",
  "Impact assessment",
  "Lot disposition",
] as const;

function boldPhrasePatterns(section: "improve" | "control"): readonly string[] {
  return section === "improve" ? IMPROVE_BOLD_PHRASES : CONTROL_BOLD_PHRASES;
}

function splitTextWithBoldPhrases(
  text: string,
  phrases: readonly string[]
): JSONContent[] {
  if (!text) return [];

  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const pattern = sorted
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!pattern) return [{ type: "text", text }];

  const re = new RegExp(`(${pattern})`, "gi");
  const nodes: JSONContent[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, index) });
    }
    nodes.push({
      type: "text",
      text: match[0],
      marks: [{ type: "bold" }],
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", text }];
}

function applyCheckpointBoldMarks(
  doc: JSONContent,
  section: "improve" | "control"
): JSONContent {
  const phrases = boldPhrasePatterns(section);

  function visit(node: JSONContent): JSONContent {
    if (node.type === "paragraph") {
      const line = (node.content ?? [])
        .filter((child) => child.type === "text")
        .map((child) => child.text ?? "")
        .join("");

      if (isFullBoldCheckpointLine(line, section)) {
        return {
          ...node,
          content: (node.content ?? []).map((child) =>
            child.type === "text"
              ? { ...child, marks: [...(child.marks ?? []), { type: "bold" }] }
              : child
          ),
        };
      }

      return {
        ...node,
        content: (node.content ?? []).flatMap((child) => {
          if (child.type !== "text" || !child.text) return [child];
          return splitTextWithBoldPhrases(child.text, phrases);
        }),
      };
    }

    if (node.type === "orderedList" || node.type === "bulletList") {
      return {
        ...node,
        content: (node.content ?? []).map((item) => visit(item)),
      };
    }

    if (node.type === "listItem") {
      return {
        ...node,
        content: (node.content ?? []).map((child) => visit(child)),
      };
    }

    if (node.content?.length) {
      return { ...node, content: node.content.map(visit) };
    }

    return node;
  }

  return visit(doc);
}

/** Plain improve/control checkpoint text → Word XML with template-matching bold. */
export function improveControlCheckpointsToDocxXml(
  text: string | undefined | null,
  section: Extract<SectionType, "improve" | "control">,
  ctx: DocxExportContext
): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return narrativeToDocxXmlWithContext(undefined, ctx).xml;
  }

  const doc = applyCheckpointBoldMarks(linesToDoc(trimmed), section);
  return narrativeToDocxXmlWithContext(doc, ctx).xml;
}
