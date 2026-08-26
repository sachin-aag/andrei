import {
  getCriteria,
  getDocumentType,
  getWorkspaceSections,
} from "@/lib/document-types";
import type { DocumentType, SectionType } from "@/db/schema";
import {
  type ChatSectionScope,
  chatSectionsInScope,
  sectionLabel,
} from "@/lib/ai/chat/fields";

/**
 * Compact per-section list of the quality criteria the report is graded on.
 * Injected into the chat prompt so Ask mode can reference quality criteria and
 * Agent mode drafts toward them (rather than generic prose).
 */
export function buildCriteriaOutline(
  scope: ChatSectionScope = "all",
  documentType: DocumentType = "investigation_report"
): string {
  const lines: string[] = [];
  const sections =
    scope === "all"
      ? getWorkspaceSections(documentType)
          .filter((s) => s.evaluable)
          .map((s) => s.key)
      : chatSectionsInScope(scope, documentType);

  for (const section of sections) {
    const criteria = getCriteria(documentType, section);
    if (criteria.length === 0) continue;
    const label =
      getDocumentType(documentType).sections.find((s) => s.key === section)
        ?.label ?? sectionLabel(section);
    lines.push(`- ${label} [${section}]:`);
    for (const c of criteria) {
      lines.push(`    • ${c.label}`);
    }
  }
  if (lines.length === 0) {
    return scope === "all"
      ? "(no criteria loaded)"
      : `- ${sectionLabel(scope as SectionType)} [${scope}]: (no criteria loaded)`;
  }
  return lines.join("\n");
}
