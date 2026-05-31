import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import { findPlaceholders, findPlaceholdersInPlainText, type Placeholder } from "./find";
import {
  listPlainTextFieldsForSection,
} from "./plain-text-fields";
import type { JSONContent } from "@tiptap/core";

export function collectPlaceholders(
  sections: Partial<SectionContentMap>
): Placeholder[] {
  const all: Placeholder[] = [];

  for (const [key, content] of Object.entries(sections)) {
    if (!content) continue;
    const section = key as SectionType;

    if (
      typeof content === "object" &&
      !Array.isArray(content) &&
      "narrative" in content &&
      content.narrative
    ) {
      const narrative = content.narrative as JSONContent;
      if (narrative?.type === "doc") {
        all.push(...findPlaceholders(narrative, section, "narrative"));
      }
    }

    for (const { contentPath, text } of listPlainTextFieldsForSection(
      section,
      content
    )) {
      all.push(...findPlaceholdersInPlainText(text, section, contentPath));
    }
  }

  return all;
}
