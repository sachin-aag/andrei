import type { SectionType } from "@/db/schema";
import type { CriterionDefinition } from "@/lib/document-types";
import { hashContent } from "@/lib/ai/content-hash";
import { cleanSectionContentForEval } from "@/lib/tiptap/strip-pending-suggestions";

export type AllSectionsContent = Partial<Record<SectionType, unknown>>;

/**
 * Hash inputs for evaluation cache: section content + every dependsOn section
 * + prompt version. Cross-section criteria must invalidate when a dependency changes.
 */
export function evaluationContentHash({
  section,
  content,
  allSections,
  criteria,
  promptVersion,
}: {
  section: string;
  content: unknown;
  allSections?: AllSectionsContent;
  criteria: CriterionDefinition[];
  promptVersion: string;
}): string {
  const dependencyKeys = [
    ...new Set(criteria.flatMap((c) => c.dependsOn ?? [])),
  ].toSorted();
  const dependencies: Record<string, unknown> = {};
  for (const key of dependencyKeys) {
    dependencies[key] = allSections?.[key] ?? null;
  }
  return hashContent(
    {
      section,
      content: cleanSectionContentForEval(section, content),
      dependencies,
    },
    promptVersion
  );
}
