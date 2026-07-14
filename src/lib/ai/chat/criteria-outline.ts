import { CRITERIA_BY_SECTION } from "@/lib/ai/criteria";
import { CHAT_EDITABLE_SECTIONS, sectionLabel } from "@/lib/ai/chat/fields";

/**
 * Compact per-section list of the quality criteria the report is graded on.
 * Injected into the chat prompt so Plan mode asks questions that close real
 * criteria gaps and Agent mode drafts toward them (rather than generic prose).
 */
export function buildCriteriaOutline(): string {
  const lines: string[] = [];
  for (const section of CHAT_EDITABLE_SECTIONS) {
    const criteria = CRITERIA_BY_SECTION[section] ?? [];
    if (criteria.length === 0) continue;
    lines.push(`- ${sectionLabel(section)} [${section}]:`);
    for (const c of criteria) {
      lines.push(`    • ${c.label}`);
    }
  }
  return lines.join("\n");
}
