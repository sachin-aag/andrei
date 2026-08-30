import type { DocumentType } from "@/db/schema";
import { coerceChatMode } from "@/lib/ai/chat/composer-prefs";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";
import {
  getDocumentType,
  resolveDocumentType,
} from "@/lib/document-types";
import type { DocumentChatExamplePrompts } from "@/lib/document-types/types";

export const ANALYTICS_EXAMPLE_PROMPTS: Record<ChatMode, string[]> = {
  plan: [
    "Where is TABLE NO. 01 for the 60 L fermenter in the Seed-2 BMRs?",
    "What assay LSL and USL are named in the attachments?",
    "Summarize the worksheet columns and any saved sixpacks.",
  ],
  agent: [
    "Extract assay measurements from the attachments into a worksheet column.",
    "Run a Normal Capability Sixpack on the Assay column with LSL 90 and USL 110.",
    "Run one-way ANOVA of Assay by Lot.",
    "Plot measurements for M3-SYS-FN-037 from the attachments.",
    "Plot OD660 vs Cumulative Glucose from the worksheet.",
    "Plot Assay from the worksheet, colored by Lot.",
  ],
};

export function examplePromptsForDocument(
  documentType: DocumentType | null | undefined
): DocumentChatExamplePrompts {
  return getDocumentType(resolveDocumentType(documentType)).chat.examplePrompts;
}

/** Empty-state chips. Invalid mode (Radix "" after a remount) must not throw. */
export function examplePromptsForMode(
  mode: unknown,
  documentType: DocumentType | null | undefined = "investigation_report"
): readonly string[] {
  return examplePromptsForDocument(documentType)[coerceChatMode(mode)];
}

export function analyticsExamplePromptsForMode(mode: unknown): string[] {
  return ANALYTICS_EXAMPLE_PROMPTS[coerceChatMode(mode)];
}

/** Document-chat empty-state intro. Analytics copy stays in ChatPanel. */
export function documentEmptyChatIntro(args: {
  mode: unknown;
  workspaceChrome: "document" | "agent";
  documentType: DocumentType | null | undefined;
}): string {
  const { documentNoun } = getDocumentType(
    resolveDocumentType(args.documentType)
  );
  if (coerceChatMode(args.mode) === "plan") {
    return `I'll answer questions about this ${documentNoun} using the report and attachments. I won't edit the document in Ask mode. Type @ to tag a document or section.`;
  }
  return args.workspaceChrome === "agent"
    ? "Ask me to draft or improve any section. I'll apply edits directly to the document. Type @ to tag a document or section."
    : `Ask me to draft or improve any section of this ${documentNoun}. I read the report and propose targeted edits you accept or reject. Type @ to tag a document or section.`;
}
