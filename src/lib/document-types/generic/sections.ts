import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";

export const GENERIC_DOCUMENT_SECTION = "body" as const;

export type GenericDocumentSectionKey = typeof GENERIC_DOCUMENT_SECTION;

export type GenericDocumentContent = {
  narrative: JSONContent;
};

export const EMPTY_GENERIC_DOCUMENT_CONTENT: GenericDocumentContent = {
  narrative: emptyDoc(),
};

export const GENERIC_DOCUMENT_SECTION_LABEL = "Document";
