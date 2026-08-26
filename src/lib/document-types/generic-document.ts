import path from "node:path";
import { countImagesInDoc } from "@/lib/ai/chat/section-images";
import { normalizeRichField, richJsonToPlainText } from "@/lib/tiptap/rich-text";
import type { DocumentTypeDefinition } from "./types";
import {
  EMPTY_GENERIC_DOCUMENT_CONTENT,
  GENERIC_DOCUMENT_SECTION,
  GENERIC_DOCUMENT_SECTION_LABEL,
} from "./generic/sections";

const GENERIC_PROMPT_VERSION = "generic-document-v2";

const GENERIC_DRAFTING_GUIDANCE = `## Document structure (required)
When drafting or rewriting the body, emit real markdown structure — not a wall of bold labels:
- Start with one \`#\` document title, then \`##\` for major sections and \`###\` for subsections. Example: \`# Software Design Verification Deviations\` then \`## Deviation 01\` then \`### Description\`.
- Use markdown lists (\`-\` or \`1.\`) and GFM tables. Do not fake headings with \`- **Plan Requirement:**\` or similar bold+dash lines.
- Field/value pairs belong under a heading, as a short list or definition lines — never as the only structure in the document.
- Keep body prose readable. Citations stay as [filename, p. N] immediately after the supported statement; the application numbers them and parks sources under Citations: at the end.`;

function genericPersona(): string {
  return `You are the drafting assistant for a free-form Word-like document. There is one continuous body — not DMAIC sections or a design-verification checklist.

Help the engineer write, restructure, and tighten the document. Always use markdown headings (\`#\` / \`##\` / \`###\`) for the title and section structure — do not wait to be asked. Do not invent regulated facts, batch numbers, dates, or citations the engineer has not provided.

There is no traffic-light criteria check on this document type. Your job is drafting and revision, not grading against SOP criteria.

You never write to the document directly. Every change is a PROPOSAL that appears as an inline tracked-change (red delete / green insert). When the engineer accepts a proposal, the revision stays as a Word tracked change on export — it is not silently finalized.`;
}

function mergeGenericSection(key: string, raw: unknown): unknown {
  if (key !== GENERIC_DOCUMENT_SECTION) return raw ?? {};
  if (!raw || typeof raw !== "object") {
    return { narrative: EMPTY_GENERIC_DOCUMENT_CONTENT.narrative };
  }
  const o = raw as { narrative?: unknown };
  return {
    narrative: normalizeRichField(o.narrative, { preserveHeadings: true }),
  };
}

function genericBodyHasContent(content: unknown): boolean {
  if (!content || typeof content !== "object") return false;
  const narrative = (content as { narrative?: unknown }).narrative;
  if (!narrative || typeof narrative !== "object") return false;
  const doc = narrative as Parameters<typeof richJsonToPlainText>[0];
  if (richJsonToPlainText(doc).trim().length > 0) return true;
  if (countImagesInDoc(doc) > 0) return true;
  return JSON.stringify(doc).includes('"type":"table"');
}

export const genericDocumentDefinition: DocumentTypeDefinition = {
  key: "generic_document",
  label: "Document",
  documentNoun: "document",
  documentNoLabel: "Document Number",
  documentNoPlaceholder: "e.g. DOC-2026-001",
  wordImport: { kind: "generic_body" },
  workspacePresentation: { kind: "continuous_document", outline: true },
  evaluation: { kind: "none" },
  suggestionApplyMode: "tracked_change",
  editorProfile: "generic_document",
  sections: [
    {
      key: GENERIC_DOCUMENT_SECTION,
      label: GENERIC_DOCUMENT_SECTION_LABEL,
      order: 0,
      editable: true,
      evaluable: false,
      emptyContent: EMPTY_GENERIC_DOCUMENT_CONTENT,
    },
  ],
  criteriaBySection: {},
  prompts: {
    base: "",
    perSection: {},
    promptVersion: GENERIC_PROMPT_VERSION,
  },
  chat: {
    persona: genericPersona(),
    draftingGuidance: GENERIC_DRAFTING_GUIDANCE,
    draftOrder: [GENERIC_DOCUMENT_SECTION],
    sectionIntentPatterns: [
      [
        GENERIC_DOCUMENT_SECTION,
        [
          /\bdocument\b/i,
          /\bbody\b/i,
          /\bnarrative\b/i,
          /\bheading\b/i,
          /\bsection\b/i,
        ],
      ],
    ],
  },
  suggestTargetFieldPatterns: { [GENERIC_DOCUMENT_SECTION]: ["narrative"] },
  richFieldPaths: { [GENERIC_DOCUMENT_SECTION]: ["narrative"] },
  mergeSection: mergeGenericSection,
  export: {
    templatePath: path.join(
      process.cwd(),
      "templates",
      "generic-document-template.docx"
    ),
    buildTemplateData: ({ report, sections }) => {
      const body = sections.find((s) => s.section === GENERIC_DOCUMENT_SECTION);
      const content = body?.content as { narrative?: unknown } | undefined;
      return {
        documentNo: report.documentNo,
        bodyXml: content?.narrative ?? null,
      };
    },
  },
  submitValidation: ({ sections }) => {
    const body = sections.find((s) => s.section === GENERIC_DOCUMENT_SECTION);
    if (!genericBodyHasContent(body?.content)) {
      return {
        ok: false,
        message: "Add document content before submitting.",
      };
    }
    return { ok: true };
  },
  defaultMetadata: {},
};
