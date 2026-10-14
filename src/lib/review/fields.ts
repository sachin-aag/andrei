import type { JSONContent } from "@tiptap/core";
import type { DocumentType, SectionType } from "@/db/schema";
import { RICH_FIELD_PATHS } from "@/lib/ai/suggest-target-fields";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { getWorkspaceSections } from "@/lib/document-types";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { listPlainTextFieldsForSection } from "@/lib/placeholders/plain-text-fields";
import type { AllSectionsContent } from "@/lib/ai/evaluation-content-hash";

export type ReviewField = {
  section: SectionType;
  contentPath: string;
  text: string;
  rich: boolean;
  doc: JSONContent | null;
};

export function iterReportFields(
  documentType: DocumentType,
  sections: AllSectionsContent
): ReviewField[] {
  const fields: ReviewField[] = [];
  for (const sectionDef of getWorkspaceSections(documentType)) {
    if (!sectionDef.editable) continue;
    const content = sections[sectionDef.key];
    if (!content || typeof content !== "object") continue;
    const record = content as Record<string, unknown>;
    const seen = new Set<string>();

    for (const contentPath of RICH_FIELD_PATHS[sectionDef.key] ?? []) {
      if (seen.has(contentPath)) continue;
      seen.add(contentPath);
      const doc = getRichFieldValue(record, contentPath);
      const text = flattenForAnchor(doc).text;
      if (!text.trim()) continue;
      fields.push({
        section: sectionDef.key,
        contentPath,
        text,
        rich: true,
        doc,
      });
    }

    for (const { contentPath, text } of listPlainTextFieldsForSection(
      sectionDef.key,
      content
    )) {
      if (seen.has(contentPath) || !text.trim()) continue;
      seen.add(contentPath);
      fields.push({
        section: sectionDef.key,
        contentPath,
        text,
        rich: false,
        doc: null,
      });
    }

    if (fields.some((f) => f.section === sectionDef.key)) continue;
    const fallback = getPlainTextFieldValue(record, "narrative");
    if (fallback.trim() && isRichTargetField(sectionDef.key, "narrative")) {
      const doc = getRichFieldValue(record, "narrative");
      fields.push({
        section: sectionDef.key,
        contentPath: "narrative",
        text: flattenForAnchor(doc).text,
        rich: true,
        doc,
      });
    }
  }
  return fields;
}
