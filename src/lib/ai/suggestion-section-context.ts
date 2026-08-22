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

/** Flatten one block subtree to a single collapsed line (matches locator text). */
function blockLine(node: JSONContent): string {
  return flattenForAnchor(node).text.replace(/\s+/g, " ").trim();
}

/**
 * Render a table as an explicit coordinate grid so the model can target a cell
 * by tableIndex + [row,col]. Every cell is tagged with its 0-based [r,c];
 * the visible cell text is exactly the locator's per-cell match string.
 */
function renderTableGrid(table: JSONContent, tableIndex: number): string {
  const rows = (table.content ?? []).filter((r) => r.type === "tableRow");
  const lines: string[] = [
    `Table tableIndex=${tableIndex} — each cell is tagged [row,col] (0-based). Row 0 is the header and cannot be deleted; row 1 is the first data row. Use edit_table with this tableIndex. Do not quote the [row,col] tags.`,
  ];
  rows.forEach((row, r) => {
    const cells = (row.content ?? []).filter(
      (c) => c.type === "tableCell" || c.type === "tableHeader"
    );
    cells.forEach((c, col) => {
      const text = blockLine(c);
      lines.push(`[${r},${col}] ${text || "(empty)"}`);
    });
  });
  return lines.join("\n");
}

/** Render a list with 0-based item indices for scope {kind:"listItem",index}. */
function renderListItems(list: JSONContent): string {
  const items = (list.content ?? []).filter((i) => i.type === "listItem");
  const lines: string[] = [
    'List — items are indexed (0-based). Edit one item with scope {kind:"listItem",index}; do not quote the [index] tag.',
  ];
  items.forEach((it, i) => {
    lines.push(`[${i}] ${blockLine(it) || "(empty)"}`);
  });
  return lines.join("\n");
}

/**
 * Serialize a rich doc for the prompt, rendering tables as coordinate grids and
 * lists with item indices while leaving prose as the canonical flattened text.
 * Table/list ordinals follow document order, matching `flattenForAnchor` (so
 * the first table is tableIndex 0, etc. — the scope default).
 */
export function renderStructuredFieldView(doc: JSONContent): string {
  const out: string[] = [];
  let tableIndex = 0;

  function walk(nodes: JSONContent[]) {
    for (const node of nodes) {
      if (node.type === "table") {
        out.push(renderTableGrid(node, tableIndex));
        tableIndex += 1;
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        out.push(renderListItems(node));
      } else if (node.type === "blockquote" && node.content?.length) {
        walk(node.content);
      } else {
        const t = flattenForAnchor(node).text;
        if (t.trim()) out.push(t);
      }
    }
  }

  walk(doc.content ?? []);
  return out.join("\n");
}

function canonicalRichText(value: unknown): string {
  const doc = normalizeRichField(value) as JSONContent;
  return renderStructuredFieldView(doc);
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
  } else if (section === "traceability" || section === "test_results") {
    pushCanonicalBlock(lines, "Table", canonicalRichText(content.table));
  } else if (section === "testers_dates") {
    pushCanonicalBlock(lines, "Testers", canonicalRichText(content.testers));
  } else if (section === "test_equipment") {
    pushCanonicalBlock(lines, "Table", canonicalRichText(content.table));
  } else if (section === "results_and_discussions") {
    pushCanonicalNarrative(lines, section, content);
    pushCanonicalBlock(lines, "Table", canonicalRichText(content.table));
  } else {
    if ("narrative" in content) {
      pushCanonicalNarrative(lines, section, content);
    }
    if ("table" in content) {
      pushCanonicalBlock(lines, "Table", canonicalRichText(content.table));
    }
  }

  return lines.length ? lines.join("\n") : fallbackContextForPrompt(content);
}

/** Compact helper for tests / drop-rate measurement. */
export function compactCanonical(value: string): string {
  return compactText(value);
}
