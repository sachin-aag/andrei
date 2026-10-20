import { hashContent } from "@/lib/ai/content-hash";
import { cleanSectionContentForEval } from "@/lib/tiptap/strip-pending-suggestions";
import type { AllSectionsContent } from "@/lib/ai/evaluation-content-hash";

/** Stable hash of the live report body used to mark a check run out of date. */
export function reviewContentHash(
  sections: AllSectionsContent,
  salt: string
): string {
  const cleaned: Record<string, unknown> = {};
  for (const [section, content] of Object.entries(sections).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    cleaned[section] = cleanSectionContentForEval(section, content);
  }
  return hashContent(cleaned, salt);
}
