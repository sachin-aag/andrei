import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function compactText(value: string, maxChars = 1200): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

export function tiptapText(value: unknown): string {
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
  value: unknown,
  maxChars?: number
) {
  if (typeof value !== "string") return;
  const text = compactText(value, maxChars);
  if (text) lines.push(`${label}: ${text}`);
}

export function pushNarrativeLine(lines: string[], content: Record<string, unknown>) {
  const text = tiptapText(content.narrative);
  if (text) lines.push(`Narrative excerpt: ${compactText(text, 1600)}`);
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
      fieldLines.push(`${label}: ${compactText(fieldValue, 500)}`);
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
    pushNarrativeLine(lines, content);
  } else if (section === "measure") {
    pushNarrativeLine(lines, content);
    pushTextLine(lines, "Regulatory notification", content.regulatoryNotification);
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
    pushObjectFields(lines, "5-Why", content.fiveWhy, [
      ["narrative", "Chain"],
      ["conclusion", "Conclusion"],
    ]);
    pushTextLine(lines, "Investigation outcome", content.investigationOutcome);
    pushObjectFields(lines, "Root cause", content.rootCause, [
      ["narrative", "Narrative"],
      ["primaryLevel1", "Level 1"],
      ["secondaryLevel2", "Level 2"],
      ["thirdLevel3", "Level 3"],
    ]);
    pushObjectFields(lines, "Impact assessment", content.impactAssessment, [
      ["system", "System"],
      ["document", "Document"],
      ["product", "Product"],
      ["equipment", "Equipment"],
      ["patientSafety", "Patient safety"],
    ]);
  } else if (section === "improve") {
    pushNarrativeLine(lines, content);
    const actions = Array.isArray(content.correctiveActions)
      ? content.correctiveActions
      : [];
    actions.slice(0, 8).forEach((action, index) => {
      if (!isRecord(action)) return;
      const parts: string[] = [];
      pushTextLine(parts, "description", action.description, 600);
      pushTextLine(parts, "responsible", action.responsiblePerson, 250);
      pushTextLine(parts, "due", action.dueDate, 120);
      pushTextLine(parts, "outcome", action.expectedOutcome, 350);
      pushTextLine(parts, "effectiveness", action.effectivenessVerification, 350);
      if (parts.length) lines.push(`Corrective action ${index + 1}: ${parts.join("; ")}`);
    });
    if (actions.length > 8) lines.push(`[${actions.length - 8} more corrective actions omitted]`);
  } else if (section === "control") {
    pushNarrativeLine(lines, content);
    pushTextLine(lines, "Preventive actions", content.preventiveActions, 1800);
    pushTextLine(lines, "Interim plan", content.interimPlan);
    pushTextLine(lines, "Final comments", content.finalComments);
    pushTextLine(lines, "Regulatory impact", content.regulatoryImpact);
    pushTextLine(lines, "Product quality", content.productQuality);
    pushTextLine(lines, "Validation", content.validation);
    pushTextLine(lines, "Stability", content.stability);
    pushTextLine(lines, "Market/clinical", content.marketClinical);
    pushTextLine(lines, "Lot disposition", content.lotDisposition);
    pushTextLine(lines, "Conclusion", content.conclusion, 1800);
  }

  return lines.length ? lines.join("\n") : fallbackContextForPrompt(content);
}
