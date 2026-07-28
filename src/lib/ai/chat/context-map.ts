import type { SectionType } from "@/db/schema";
import { isAiSuggestionKind } from "@/lib/ai/suggestion-gating";
import {
  CHAT_EDITABLE_SECTIONS,
  primaryFieldForSection,
  sectionFieldPlainText,
  sectionLabel,
} from "@/lib/ai/chat/fields";
import {
  ANALYZE_METHOD_LABELS,
  detectAnalyzeMethod,
  methodFromToolsUsed,
} from "@/lib/analyze/method";

export type ContextMapReport = {
  deviationNo: string;
  date: Date | string;
  status: string;
  toolsUsed?: {
    sixM?: boolean;
    fiveWhy?: boolean;
    brainstorming?: boolean;
  } | null;
};

export type ContextMapEvaluation = {
  section: SectionType;
  status: string;
  bypassed?: boolean;
};

export type ContextMapComment = {
  section: SectionType | null;
  kind: string;
  status: string;
};

export type BuildContextMapInput = {
  report: ContextMapReport;
  /** Merged section content keyed by section type. */
  sections: Partial<Record<SectionType, Record<string, unknown>>>;
  evaluations: ContextMapEvaluation[];
  comments: ContextMapComment[];
};

function summarize(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "(empty)";
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

function evalSummary(evals: ContextMapEvaluation[]): string {
  const active = evals.filter((e) => !e.bypassed);
  if (active.length === 0) return "not evaluated";
  const counts = { met: 0, partially_met: 0, not_met: 0 };
  for (const e of active) {
    if (e.status === "met") counts.met++;
    else if (e.status === "partially_met") counts.partially_met++;
    else if (e.status === "not_met") counts.not_met++;
  }
  return `${counts.met} met / ${counts.partially_met} partial / ${counts.not_met} not-met`;
}

function analyzeMethodLine(
  content: Record<string, unknown>,
  toolsUsed: ContextMapReport["toolsUsed"]
): string {
  const fromContent = detectAnalyzeMethod(content);
  const fromHeader = methodFromToolsUsed(toolsUsed);
  if (!fromContent && !fromHeader) {
    return "    analyze method: not chosen";
  }
  const contentPart = fromContent
    ? `${ANALYZE_METHOD_LABELS[fromContent]} (from section content)`
    : null;
  const headerPart = fromHeader
    ? `header checkbox: ${ANALYZE_METHOD_LABELS[fromHeader]}`
    : null;
  if (contentPart && headerPart) {
    return `    analyze method: ${contentPart}; ${headerPart}`;
  }
  return `    analyze method: ${contentPart ?? headerPart}`;
}

/**
 * Compact per-section "map" injected into the chat system prompt. Lets the
 * agent know which sections exist, their fill state, a one-line gist, and
 * evaluation status WITHOUT loading every full section body (it calls
 * read_section to open a field just-in-time before editing).
 */
export function buildReportContextMap(input: BuildContextMapInput): string {
  const { report, sections, evaluations, comments } = input;
  const dateStr =
    typeof report.date === "string"
      ? report.date
      : report.date.toISOString().slice(0, 10);

  const lines: string[] = [
    `Report: deviation ${report.deviationNo || "(unset)"} · date ${dateStr} · status ${report.status}`,
    "Sections (open a field with read_section before editing it):",
  ];

  for (const section of CHAT_EDITABLE_SECTIONS) {
    const content = sections[section] ?? {};
    const primary = primaryFieldForSection(section);
    const text = sectionFieldPlainText(content, section, primary);
    const charCount = text.replace(/\s+/g, " ").trim().length;
    const state = charCount === 0 ? "empty" : charCount < 120 ? "partial" : "filled";
    const sectionEvals = evaluations.filter((e) => e.section === section);
    const openFixes = comments.filter(
      (c) =>
        c.section === section && isAiSuggestionKind(c.kind) && c.status === "open"
    ).length;

    lines.push(
      `- ${sectionLabel(section)} [${section}] — ${state} (${charCount} chars) · criteria: ${evalSummary(sectionEvals)}` +
        (openFixes > 0 ? ` · ${openFixes} open suggestion(s)` : "")
    );
    if (state !== "empty") {
      lines.push(`    ${primary}: "${summarize(text)}"`);
    }
    if (section === "analyze") {
      lines.push(analyzeMethodLine(content, report.toolsUsed));
    }
  }

  return lines.join("\n");
}
