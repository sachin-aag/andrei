import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import { RICH_FIELD_PATHS } from "@/lib/ai/suggest-target-fields";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { findPlaceholders, findPlaceholdersInPlainText, type Placeholder } from "./find";
import { listPlainTextFieldsForSection } from "./plain-text-fields";

export function collectPlaceholders(
  sections: Partial<SectionContentMap>
): Placeholder[] {
  const all: Placeholder[] = [];

  for (const [key, content] of Object.entries(sections)) {
    if (!content) continue;
    const section = key as SectionType;
    const record = content as Record<string, unknown>;

    for (const contentPath of RICH_FIELD_PATHS[section] ?? []) {
      const doc = getRichFieldValue(record, contentPath);
      if (doc.type === "doc") {
        all.push(...findPlaceholders(doc, section, contentPath));
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
