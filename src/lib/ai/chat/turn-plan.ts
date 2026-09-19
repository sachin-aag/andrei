import type { DocumentType, SectionType } from "@/db/schema";
import {
  detectAlreadyDraftedSection,
  type AlreadyDraftedSection,
} from "@/lib/ai/chat/already-drafted";
import type { ChatSectionScope } from "@/lib/ai/chat/fields";
import { planCoverageObjective } from "@/lib/ai/chat/pending-plan";
import {
  classifyRetrievalPolicy,
  type RetrievalPolicy,
} from "@/lib/ai/chat/retrieval-policy";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";
import { hasPopulatedTablePlaceholders } from "@/lib/ai/chat/placeholder-fill";
import type {
  ChatUserIntentDecision,
  ChatUserIntentKind,
} from "@/lib/ai/chat/user-intent";
import { classifyChatUserIntent } from "@/lib/ai/chat/user-intent";

export type ChatTurnPlan = {
  intent: ChatUserIntentKind;
  intentReason: string;
  retrievalPolicy: RetrievalPolicy;
  retrievalReason: string;
  reviewObjective: string;
  alreadyDrafted: AlreadyDraftedSection | null;
  sectionIntent: SectionType | null;
};

export type AssembleChatTurnPlanInput = {
  userText: string;
  /** Already-resolved intent (rules + optional Flash-Lite). */
  userIntent: ChatUserIntentDecision;
  sectionScope?: ChatSectionScope;
  documentType?: DocumentType;
  recentUserTexts?: readonly string[];
  mentionedPageCount?: number;
  totalReadyPages?: number;
  outlineSiblingCount?: number;
  hasDocuments?: boolean;
  sections?: Partial<Record<SectionType, Record<string, unknown>>>;
};

/**
 * One turn-start snapshot. Downstream (retrieval, already-drafted gate,
 * review coverage) consume this instead of re-deriving from the same text.
 */
export function assembleChatTurnPlan(
  input: AssembleChatTurnPlanInput
): ChatTurnPlan {
  const documentType = input.documentType ?? "investigation_report";
  const retrieval = classifyRetrievalPolicy({
    userText: input.userText,
    recentUserTexts: input.recentUserTexts,
    sectionScope: input.sectionScope,
    documentType,
    mentionedPageCount: input.mentionedPageCount,
    totalReadyPages: input.totalReadyPages,
    outlineSiblingCount: input.outlineSiblingCount,
    hasDocuments: input.hasDocuments,
    hasPopulatedPlaceholders: input.sections
      ? hasPopulatedTablePlaceholders(input.sections)
      : undefined,
  });
  const sectionIntent = detectSectionIntentFromText(
    input.userText,
    documentType
  );
  const alreadyDrafted = detectAlreadyDraftedSection({
    userText: input.userText,
    userIntentKind: input.userIntent.kind,
    sectionScope: input.sectionScope,
    documentType,
    sections: input.sections ?? {},
  });
  const reviewObjective = planCoverageObjective(null, input.userText, {
    sectionScope: input.sectionScope,
    documentType,
  });
  return {
    intent: input.userIntent.kind,
    intentReason: input.userIntent.reason,
    retrievalPolicy: retrieval.policy,
    retrievalReason: retrieval.reason,
    reviewObjective,
    alreadyDrafted,
    sectionIntent,
  };
}

/** Rules-only plan for characterization fixtures (no Flash-Lite). */
export function assembleRulesChatTurnPlan(
  input: Omit<AssembleChatTurnPlanInput, "userIntent"> & {
    mode?: "plan" | "agent";
  }
): ChatTurnPlan {
  const userIntent = classifyChatUserIntent({
    userText: input.userText,
    mode: input.mode ?? "agent",
  });
  return assembleChatTurnPlan({ ...input, userIntent });
}
