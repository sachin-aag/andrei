import type { SectionType } from "@/db/schema";
import { sectionLabel } from "@/lib/ai/chat/fields";

export type ChatChangeItem = {
  section: string;
  targetField: string;
  reasoning: string;
};

export type EngineerFacingChangeLine = {
  section: string;
  label: string;
  reasoning: string;
};

function trimReasoning(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Engineer-facing "Changes this turn" lines: one row per section, no
 * targetField keys (narrative / hardwareTable) and no recipe internals.
 */
export function engineerFacingChangeLines(
  items: readonly ChatChangeItem[]
): EngineerFacingChangeLine[] {
  const lines: EngineerFacingChangeLine[] = [];
  const indexBySection = new Map<string, number>();
  for (const item of items) {
    const section = item.section.trim();
    if (!section) continue;
    const reasoning = trimReasoning(item.reasoning);
    const existing = indexBySection.get(section);
    if (existing === undefined) {
      indexBySection.set(section, lines.length);
      lines.push({
        section,
        label: sectionLabel(section as SectionType),
        reasoning,
      });
      continue;
    }
    if (!lines[existing]!.reasoning && reasoning) {
      lines[existing]!.reasoning = reasoning;
    }
  }
  return lines;
}

/** History snapshot one-liner. Falls back to the section label, never a field key. */
export function engineerFacingHistorySummary(
  items: readonly ChatChangeItem[]
): string {
  return engineerFacingChangeLines(items)
    .map((line) =>
      line.reasoning ? `${line.label} — ${line.reasoning}` : line.label
    )
    .join("; ");
}
