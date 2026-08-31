import type { DocumentType, SectionType } from "@/db/schema";
import { CHAT_PROMPT_VERSION } from "@/lib/ai/chat/system-prompt";
import {
  buildSuggestionSystemPrompt,
  buildSuggestionUserPrompt,
  SUGGEST_PROMPT_VERSION,
} from "@/lib/ai/suggest-prompts";
import {
  buildEvaluationSystemPromptForType,
  citationsAtEndOfSectionFor,
  evaluationCapabilityFor,
  getDocumentType,
  getEvaluatableSections,
  listDocumentTypes,
} from "@/lib/document-types";

export type AdminPromptBlock = {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
};

export type AdminDocumentPromptCatalog = {
  documentType: DocumentType;
  label: string;
  versions: {
    eval: string;
    chat: string;
    suggest: string;
  };
  blocks: AdminPromptBlock[];
};

const SHARED_CHAT_RULES_NOTE = `This document type's persona and drafting guidance (below) are combined at runtime with shared chat rules (mode, retrieval, tools, citation policy). Shared shell version: ${CHAT_PROMPT_VERSION}. Source: src/lib/ai/chat/system-prompt.ts`;

function pushIfNonEmpty(
  blocks: AdminPromptBlock[],
  block: Omit<AdminPromptBlock, "body"> & { body: string | undefined | null }
) {
  const body = block.body?.trim();
  if (!body) return;
  blocks.push({ ...block, body });
}

export function buildAdminDocumentPromptCatalog(
  documentType: DocumentType
): AdminDocumentPromptCatalog {
  const def = getDocumentType(documentType);
  const evaluatable = getEvaluatableSections(documentType);
  const citationsAtEnd = citationsAtEndOfSectionFor(documentType);
  const blocks: AdminPromptBlock[] = [];

  pushIfNonEmpty(blocks, {
    id: "versions",
    title: "Prompt versions",
    subtitle: "Cache-busting identifiers for eval, chat, and suggestions",
    body: [
      `AI Check (eval): ${def.prompts.promptVersion}`,
      `Chat shell: ${CHAT_PROMPT_VERSION}`,
      `Suggest fixes: ${SUGGEST_PROMPT_VERSION}`,
    ].join("\n"),
  });

  pushIfNonEmpty(blocks, {
    id: "chat-shared",
    title: "Chat — shared shell",
    subtitle: "Appended to every document type at runtime",
    body: SHARED_CHAT_RULES_NOTE,
  });

  pushIfNonEmpty(blocks, {
    id: "chat-persona",
    title: "Chat — persona",
    subtitle: "Opening paragraphs of the document chat system prompt",
    body: def.chat.persona,
  });

  pushIfNonEmpty(blocks, {
    id: "chat-drafting",
    title: "Chat — drafting guidance",
    subtitle: "Recipe and section rules appended to the chat system prompt",
    body: def.chat.draftingGuidance,
  });

  const exampleLines = [
    ...def.chat.examplePrompts.plan.map((p) => `Ask: ${p}`),
    ...def.chat.examplePrompts.agent.map((p) => `Agent: ${p}`),
  ];
  if (exampleLines.length > 0) {
    pushIfNonEmpty(blocks, {
      id: "chat-examples",
      title: "Chat — example composer chips",
      subtitle: "Empty-state prompts shown in Document chat",
      body: exampleLines.join("\n"),
    });
  }

  if (evaluationCapabilityFor(def).kind === "criteria") {
    pushIfNonEmpty(blocks, {
      id: "eval-base",
      title: "AI Check — base system prompt",
      subtitle: "Shared across all sections for this template",
      body: def.prompts.base,
    });

    for (const section of evaluatable) {
      const addition = def.prompts.perSection[section.key]?.trim();
      const combined = buildEvaluationSystemPromptForType(
        documentType,
        section.key
      );
      pushIfNonEmpty(blocks, {
        id: `eval-${section.key}`,
        title: `AI Check — ${section.label}`,
        subtitle: addition
          ? "Base prompt plus section role (combined below)"
          : "Uses base prompt only",
        body: combined,
      });
    }

    const firstSection = evaluatable[0]?.key as SectionType | undefined;
    if (firstSection) {
      pushIfNonEmpty(blocks, {
        id: "suggest-system",
        title: "Suggest fixes — system prompt",
        subtitle: firstSection
          ? `Representative (${firstSection}); matrix sections may include extra table rules`
          : undefined,
        body: buildSuggestionSystemPrompt(firstSection, {
          citationsAtEndOfSection: citationsAtEnd,
        }),
      });

      pushIfNonEmpty(blocks, {
        id: "suggest-user",
        title: "Suggest fixes — user prompt template",
        subtitle: "Filled per run with section content and failing criteria",
        body: buildSuggestionUserPrompt({
          section: firstSection,
          contentStr: "[Section content inserted at runtime]",
          priorBlock: "",
          failingCriteria: [
            {
              key: "example.criterion",
              label: "Example criterion label",
              reasoning: "Example evaluation reasoning from AI Check.",
              status: "not_met",
            },
          ],
          citationsAtEndOfSection: citationsAtEnd,
        }),
      });
    }
  }

  return {
    documentType,
    label: def.label,
    versions: {
      eval: def.prompts.promptVersion,
      chat: CHAT_PROMPT_VERSION,
      suggest: SUGGEST_PROMPT_VERSION,
    },
    blocks,
  };
}

export function listAdminDocumentPromptCatalogs(): AdminDocumentPromptCatalog[] {
  return listDocumentTypes().map((def) =>
    buildAdminDocumentPromptCatalog(def.key)
  );
}
