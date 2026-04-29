import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import { findPlaceholders, type Placeholder } from "./find";
import type { JSONContent } from "@tiptap/core";

export function collectPlaceholders(
  sections: Partial<SectionContentMap>
): Placeholder[] {
  const all: Placeholder[] = [];

  for (const [key, content] of Object.entries(sections)) {
    if (!content) continue;
    const section = key as SectionType;
    
    // We only scan narrative sections for now, since those are Tiptap docs.
    // Analyze section has plain text which could also contain placeholders,
    // but the UI jump-to features rely on Tiptap positions. If needed, we
    // can extend this to plain text fields.
    if ("narrative" in content && content.narrative) {
      all.push(
        ...findPlaceholders(
          content.narrative as JSONContent,
          section,
          "narrative"
        )
      );
    }
  }

  return all;
}
