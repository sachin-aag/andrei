import { NextResponse, after } from "next/server";
import {
  streamText,
  convertToModelMessages,
  type ToolSet,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  reportSections,
  criteriaEvaluations,
  comments,
  chatMessages,
} from "@/db/schema";
import type { DocumentType, SectionType } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { mergeSection } from "@/lib/sections-merge";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { canSaveReportSection } from "@/lib/reports/access";
import { buildReportContextMap } from "@/lib/ai/chat/context-map";
import { investigationToolsUsed } from "@/types/report";
import {
  buildChatSystemPrompt,
  isChatMode,
  CHAT_PROMPT_VERSION,
  type ChatMode,
} from "@/lib/ai/chat/system-prompt";
import { buildCriteriaOutline } from "@/lib/ai/chat/criteria-outline";
import { buildChatTools } from "@/lib/ai/chat/tools";
import {
  CHAT_EXTRACT_GOOGLE_MODEL_ID,
  CHAT_GOOGLE_MODEL_ID,
  resolveChatLanguageModel,
} from "@/lib/ai/chat/model";
import { buildStubChatModel } from "@/lib/ai/chat/stub-model";
import {
  parseChatSectionScope,
  primaryFieldForSection,
  type ChatSectionScope,
} from "@/lib/ai/chat/fields";
import { getDocumentType } from "@/lib/document-types";
import {
  detectSectionIntentFromText,
  detectSectionScopeMismatch,
} from "@/lib/ai/chat/section-intent";
import {
  createChatSession,
  findChatSession,
  touchChatSession,
} from "@/lib/ai/chat/sessions";
import { buildGeminiThoughtSummaryProviderOptions } from "@/lib/eval/eval-generation-options";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import {
  flushLangfuseTraces,
  langfuseGenerateTextTelemetry,
} from "@/lib/observability/langfuse";
import { auditActorFromUser } from "@/lib/audit";
import { listReadyDocumentsForReport } from "@/lib/attachments/retrieval";
import { buildAutoEvidence } from "@/lib/ai/chat/auto-evidence";
import {
  chatThinkingLevel,
  classifyRetrievalPolicy,
  recentUserMessageTexts,
} from "@/lib/ai/chat/retrieval-policy";
import {
  DocumentReviewSession,
  pickPlanModeChatTools,
  prepareDocumentReviewStep,
  shouldStopChatSteps,
} from "@/lib/ai/chat/document-review";
import { sanitizeChatMessagesForModel } from "@/lib/ai/chat/image-parts";
import {
  buildMentionBlock,
  mentionedAttachmentIds,
  mentionedSections,
  parseChatMentions,
  resolveChatMentions,
} from "@/lib/ai/chat/mentions";

export const maxDuration = 300;

function lastUserMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i]!;
  }
  return null;
}

function messageText(message: UIMessage | null): string {
  if (!message) return "";
  return (message.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/** Naive keyword routing for the test stub (no LLM). */
function pickStubSection(
  text: string,
  documentType: DocumentType
): SectionType {
  const fallback = getDocumentType(documentType).chat.draftOrder[0] ?? "define";
  return detectSectionIntentFromText(text, documentType) ?? fallback;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[];
    sessionId?: string;
    mode?: string;
    sectionScope?: string;
    mentions?: unknown;
  };
  const messages = sanitizeChatMessagesForModel(
    Array.isArray(body.messages) ? body.messages : []
  );
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : "agent";
  const accessEarly = await loadAccessibleReport(reportId, user);
  if (!accessEarly) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sectionScope: ChatSectionScope = parseChatSectionScope(
    body.sectionScope,
    accessEarly.report.documentType
  );
  const requestedMentions = parseChatMentions(
    body.mentions,
    accessEarly.report.documentType
  );

  const access = accessEarly;
  const { report } = access;
  // Plan mode never edits; Agent mode only when section content is still writable.
  const canEdit = mode === "agent" && canSaveReportSection(user, report);

  // Resolve the session (create one if the client didn't supply a valid id).
  let sessionId = body.sessionId?.trim() || "";
  if (sessionId) {
    const found = await findChatSession(reportId, sessionId);
    if (!found) sessionId = "";
  }
  if (!sessionId) {
    sessionId = (await createChatSession(reportId)).id;
  }

  // Persist the newest user turn. A failure here silently breaks the thread
  // (this masked a missing chat_messages.session_id column in prod), so fail
  // loudly: return 500 so the client's onError toast fires instead of
  // streaming a reply that would never be saved to history.
  const userMsg = lastUserMessage(messages);
  const userText = messageText(userMsg);
  const scopeMismatch = detectSectionScopeMismatch(
    sectionScope,
    userText,
    accessEarly.report.documentType
  );
  if (userMsg) {
    try {
      await db.insert(chatMessages).values({
        reportId,
        sessionId,
        role: "user",
        parts: userMsg.parts ?? [],
        authorId: user.id,
      });
      await touchChatSession(sessionId, userText || null);
    } catch (err) {
      console.error("chat: failed to persist user message", err);
      return NextResponse.json(
        { error: "Failed to save your message. Please try again." },
        { status: 500 }
      );
    }
  }

  // Build the compact context map from current report state.
  const [sectionRows, evaluations, commentRows, documents] = await Promise.all([
    db.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
    db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.reportId, reportId)),
    db.select().from(comments).where(eq(comments.reportId, reportId)),
    listReadyDocumentsForReport(reportId),
  ]);
  const mergedSections: Partial<Record<SectionType, Record<string, unknown>>> = {};
  for (const row of sectionRows) {
    mergedSections[row.section] = mergeSection(row.section, row.content) as Record<
      string,
      unknown
    >;
  }
  // Resolved against this report's ready documents only, so a tagged
  // attachment id from another report cannot pull in its evidence.
  const mentions = resolveChatMentions(requestedMentions, documents);
  const pinnedAttachmentIds = mentionedAttachmentIds(mentions);
  const mentionedPageCount = documents
    .filter((doc) => pinnedAttachmentIds.includes(doc.attachmentId))
    .reduce((sum, doc) => sum + (doc.pageCount ?? 0), 0);
  const totalReadyPages = documents.reduce(
    (sum, doc) => sum + (doc.pageCount ?? 0),
    0
  );
  const retrieval = classifyRetrievalPolicy({
    userText,
    recentUserTexts: recentUserMessageTexts(messages),
    sectionScope,
    documentType: report.documentType,
    mentionedPageCount,
    hasDocuments: documents.length > 0,
  });
  const documentReview = new DocumentReviewSession();
  const reviewPageCount =
    mentionedPageCount > 0 ? mentionedPageCount : totalReadyPages;

  const contextMap = buildReportContextMap({
    report: {
      documentNo: report.documentNo,
      date: report.date,
      status: report.status,
      toolsUsed: investigationToolsUsed(report),
    },
    sections: mergedSections,
    evaluations: evaluations.map((e) => ({
      section: e.section,
      status: e.status,
      bypassed: e.bypassed,
    })),
    comments: commentRows.map((c) => ({
      section: c.section,
      kind: c.kind,
      status: c.status,
    })),
    documents,
    documentType: report.documentType,
  });

  const autoEvidenceBlock =
    retrieval.policy === "focused"
      ? await buildAutoEvidence({
    reportId,
    userText,
    sections: mergedSections,
    evaluations: evaluations.map((e) => ({
      section: e.section,
      status: e.status,
      bypassed: e.bypassed,
      criterionKey: e.criterionKey,
      criterionLabel: e.criterionLabel,
    })),
    sectionScope,
    documentType: report.documentType,
    documentNo: report.documentNo,
    pinnedAttachmentIds,
    hasDocuments: documents.length > 0,
  })
    : "";

  const system = buildChatSystemPrompt({
    contextMap,
    criteriaOutline: buildCriteriaOutline(sectionScope, report.documentType),
    mode,
    sectionScope,
    documentType: report.documentType,
    scopeMismatch,
    mentionBlock: buildMentionBlock(mentions),
    autoEvidenceBlock,
    retrievalPolicy: retrieval.policy,
  });

  const allTools = buildChatTools({
    reportId,
    canEdit,
    sectionScope,
    documentType: report.documentType,
    actor: auditActorFromUser(user),
    pinnedAttachmentIds,
    mentionedSections: mentionedSections(mentions),
    retrievalPolicy: retrieval.policy,
    documentReview,
  });
  const tools: ToolSet =
    mode === "plan"
      ? (pickPlanModeChatTools(allTools) as ToolSet)
      : allTools;

  const stubSection =
    sectionScope === "all"
      ? pickStubSection(userText, report.documentType)
      : sectionScope;
  const model = isTestStubChat()
    ? await buildStubChatModel({
        mode,
        section: stubSection,
        targetField: primaryFieldForSection(stubSection),
        scopeMismatch,
        insertText: `Stubbed drafting insertion addressing "${userText.slice(0, 80)}". [Replace with real content once a Gemini credential is configured.]`,
        reasoning: "Demo stub proposal.",
      })
    : resolveChatLanguageModel();

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: ({ steps }) =>
      shouldStopChatSteps({
        stepsTaken: steps.length,
        mode,
        policy: retrieval.policy,
        reviewPhase: documentReview.phase(),
        totalPages: documentReview.progress().totalPages || reviewPageCount,
      }),
    prepareStep: () => {
      const prepared = prepareDocumentReviewStep({
        policy: retrieval.policy,
        phase: documentReview.phase(),
        availableTools: Object.keys(tools),
      });
      if (!prepared) return undefined;
      return {
        activeTools: prepared.activeTools,
        ...(prepared.toolChoice ? { toolChoice: prepared.toolChoice } : {}),
      };
    },
    // Thought summaries for Langfuse. Thinking is minimal: it runs on every
    // tool step, and continue/finish are server-locked during a page walk.
    providerOptions: buildGeminiThoughtSummaryProviderOptions({
      thinkingLevel: chatThinkingLevel(retrieval.policy),
    }),
    ...langfuseGenerateTextTelemetry({
      functionId: "report-chat",
      metadata: {
        reportId,
        sessionId,
        mode,
        sectionScope,
        canEdit,
        taggedDocuments: mentions.documents.length,
        taggedSections: mentions.sections.length,
        chatPromptVersion: CHAT_PROMPT_VERSION,
        chatModelId: CHAT_GOOGLE_MODEL_ID,
        chatExtractModelId: CHAT_EXTRACT_GOOGLE_MODEL_ID,
        retrievalPolicy: retrieval.policy,
        retrievalPolicyReason: retrieval.reason,
      },
    }),
  });

  after(flushLangfuseTraces);

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Keep Gemini thought summaries in Langfuse (ai.response.reasoning) only —
    // do not stream or persist them as chat message parts.
    sendReasoning: false,
    onFinish: async ({ responseMessage }) => {
      try {
        await db.insert(chatMessages).values({
          reportId,
          sessionId,
          role: "assistant",
          parts: responseMessage.parts ?? [],
          authorId: null,
        });
        await touchChatSession(sessionId, null);
      } catch (err) {
        // The reply already streamed to the client, so we can only log here —
        // a failure means it's missing from history on reload, nothing more.
        console.error("chat: failed to persist assistant message", err);
      }
    },
  });
}
