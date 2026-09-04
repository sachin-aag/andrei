import { NextResponse, after } from "next/server";
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { buildAnalyticsChatSystemPrompt } from "@/lib/statistical-analysis/chat-prompt";
import { ANALYTICS_CHAT_PROMPT_VERSION } from "@/lib/statistical-analysis/chat-prompt";
import { buildAnalyticsChatTools } from "@/lib/statistical-analysis/chat-tools";
import { auditActorFromUser } from "@/lib/audit";
import {
  createAnalyticsSearchGate,
  prepareAnalyticsChatStep,
} from "@/lib/statistical-analysis/search-loop";
import { getOrCreateReportAnalytics } from "@/lib/statistical-analysis/store";
import { buildStubAnalyticsChatModel } from "@/lib/statistical-analysis/stub-chat-model";
import {
  CHAT_EXTRACT_GOOGLE_MODEL_ID,
  chatAssistantTurnMetadata,
  chatPaceConfig,
  resolveChatLanguageModel,
} from "@/lib/ai/chat/model";
import { chatUserTurnMetadata } from "@/lib/ai/chat/message-target";
import { DEFAULT_CHAT_PACE, isChatPace, type ChatPace } from "@/lib/ai/chat/pace";
import {
  isChatMode,
  type ChatMode,
} from "@/lib/ai/chat/system-prompt";
import {
  createChatSession,
  findChatSession,
  touchChatSession,
} from "@/lib/ai/chat/sessions";
import {
  clearAssistantTurn,
  drainSseStream,
  isAssistantTurnCancelRequested,
  tryMarkAssistantTurnRunning,
} from "@/lib/ai/chat/background-turn";
import { buildGeminiThoughtSummaryProviderOptions } from "@/lib/eval/eval-generation-options";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import {
  endActiveLangfuseObservation,
  flushLangfuseTraces,
  langfuseGenerateTextTelemetry,
  observeRouteHandler,
  setRouteObservationIO,
  withPropagatedAttributes,
} from "@/lib/observability/langfuse";
import {
  aiBudgetExceededResponse,
  assertAiBudgetAvailable,
  isAiBudgetExceededError,
  recordAiUsage,
} from "@/lib/ai/usage";
import { listReadyDocumentsForReport } from "@/lib/attachments/retrieval";
import {
  buildAnalyticsMentionBlock,
  mentionedAnalyticsAttachmentIds,
  parseAnalyticsChatMentions,
  primaryTaggedSheetId,
  resolveAnalyticsChatMentions,
} from "@/lib/statistical-analysis/mentions";
import { recoverDocumentMentionIds } from "@/lib/ai/chat/mentions";
import { sanitizeChatMessagesForModel } from "@/lib/ai/chat/image-parts";
import { compactChatToolHistoryForModel } from "@/lib/ai/chat/compact-tool-history";
import { repairChatToolCall } from "@/lib/ai/chat/repair-tool-call";
import {
  messageHasChatImage,
  recentAssistantMessageTexts,
  restrictToolsForIntent,
} from "@/lib/ai/chat/user-intent";
import { resolveChatUserIntent } from "@/lib/ai/chat/resolve-user-intent";
import { captureChatAssistantFailure } from "@/lib/ai/chat/chat-failure-telemetry";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  consumeAssistantStreamWithBudget,
  formatChatLlmError,
  isChatTurnDeadlineReached,
  isFailedChatFinishReason,
  partsForPersistedAssistantTurn,
  remainingChatAbortMs,
  scheduleChatTurnDeadline,
} from "@/lib/ai/chat/assistant-turn";

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

async function handleAnalyticsChatPost(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const turnStartedAtMs = Date.now();
  const { reportId } = await params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;
  const { user, report, canEdit } = access;

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[];
    sessionId?: string;
    pace?: unknown;
    mode?: unknown;
    mentions?: unknown;
  };
  const messages = compactChatToolHistoryForModel(
    sanitizeChatMessagesForModel(
      Array.isArray(body.messages) ? body.messages : []
    )
  );
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }

  let sessionId = body.sessionId?.trim() || "";
  if (sessionId) {
    const found = await findChatSession(
      reportId,
      sessionId
    );
    if (!found) sessionId = "";
  }
  if (!sessionId) {
    sessionId = (await createChatSession(reportId)).id;
  }

  const claimed = await tryMarkAssistantTurnRunning(sessionId);
  if (!claimed) {
    return NextResponse.json(
      { error: "The assistant is still working on the previous reply." },
      { status: 409 }
    );
  }

  const mode: ChatMode = isChatMode(body.mode) ? body.mode : "agent";
  const userMsg = lastUserMessage(messages);
  const userText = messageText(userMsg);
  const userIntent = await resolveChatUserIntent({
    userText,
    recentAssistantTexts: recentAssistantMessageTexts(messages),
    hasChatImages: messageHasChatImage(userMsg?.parts),
    surface: "analytics",
    mode,
    reportId,
    userId: user.id,
  });
  if (userMsg) {
    try {
      await db.insert(chatMessages).values({
        reportId,
        sessionId,
        role: "user",
        parts: userMsg.parts ?? [],
        metadata: chatUserTurnMetadata("analytics"),
        authorId: user.id,
      });
      await touchChatSession(sessionId, userText || null);
    } catch (err) {
      console.error("analytics-chat: failed to persist user message", err);
      await clearAssistantTurn(sessionId);
      return NextResponse.json(
        { error: "Failed to save your message. Please try again." },
        { status: 500 }
      );
    }
  }

  const [documents, analytics] = await Promise.all([
    listReadyDocumentsForReport(reportId),
    getOrCreateReportAnalytics(reportId),
  ]);

  const requestedMentions = parseAnalyticsChatMentions(body.mentions);
  const requestedDocumentIds = new Set(
    requestedMentions
      .filter((mention) => mention.type === "document")
      .map((mention) => mention.id)
  );
  const recoveredDocumentIds = recoverDocumentMentionIds(userText, documents).filter(
    (id) => !requestedDocumentIds.has(id)
  );
  const mentions = resolveAnalyticsChatMentions(
    [
      ...requestedMentions,
      ...recoveredDocumentIds.map((id) => ({ type: "document" as const, id })),
    ],
    documents,
    analytics
  );
  const pinnedAttachmentIds = mentionedAnalyticsAttachmentIds(mentions);
  const focusedSheetId = primaryTaggedSheetId(mentions);
  const canWrite = mode === "agent" && canEdit;
  const searchGate = createAnalyticsSearchGate();
  const system = buildAnalyticsChatSystemPrompt({
    documentNo: report.documentNo,
    status: report.status,
    documents,
    analytics,
    canEdit,
    mode,
    mentionBlock: buildAnalyticsMentionBlock(mentions),
    intent: userIntent.kind,
  });
  const tools = restrictToolsForIntent(
    buildAnalyticsChatTools({
      reportId,
      canEdit: canWrite,
      documentType: report.documentType,
      searchGate,
      pinnedAttachmentIds,
      focusedSheetId,
      actor: auditActorFromUser(user),
    }),
    userIntent.kind,
    "analytics"
  );
  const pace: ChatPace = isChatPace(body.pace) ? body.pace : DEFAULT_CHAT_PACE;
  const paceConfig = chatPaceConfig(pace);
  const model = isTestStubChat()
    ? await buildStubAnalyticsChatModel()
    : resolveChatLanguageModel(pace);

  const turnAbort = new AbortController();
  const stopDeadline = scheduleChatTurnDeadline(turnAbort, turnStartedAtMs);
  const cancelPoll = setInterval(() => {
    void isAssistantTurnCancelRequested(sessionId).then((requested) => {
      if (requested) turnAbort.abort();
    });
  }, 1_000);
  const stopTurnGuards = () => {
    stopDeadline();
    clearInterval(cancelPoll);
  };

  let result;
  try {
    if (!isTestStubChat()) {
      await assertAiBudgetAvailable();
    }
    const modelMessages = await convertToModelMessages(messages);
    setRouteObservationIO({
      input: {
        reportId,
        sessionId,
        mode,
        pace,
        userText: userText.slice(0, 500),
      },
    });
    result = withPropagatedAttributes(
      {
        sessionId,
        userId: user.id,
        traceName: "analytics-chat",
        tags: ["analytics-chat", mode, pace],
        metadata: {
          reportId,
          documentNo: String(report.documentNo ?? ""),
          documentType: report.documentType,
          mode,
          pace,
          canEdit: canWrite,
        },
      },
      () =>
        streamText({
      model,
      system,
      messages: modelMessages,
      tools,
      experimental_repairToolCall: repairChatToolCall,
      stopWhen: async () => {
        // Cancel or wall-clock deadline. No tool-step cap. Loop guards
        // live in prepareStep.
        if (isChatTurnDeadlineReached(turnStartedAtMs)) return true;
        return isAssistantTurnCancelRequested(sessionId);
      },
      prepareStep: ({ steps }) => {
        const prepared = prepareAnalyticsChatStep({
          steps,
          canEdit: canWrite,
          searchGate,
          intent: userIntent.kind,
          intentReason: userIntent.reason,
        });
        if (!prepared) return undefined;
        return {
          activeTools: prepared.activeTools,
          ...(prepared.toolChoice ? { toolChoice: prepared.toolChoice } : {}),
        };
      },
      abortSignal: turnAbort.signal,
      timeout: { totalMs: Math.max(1, remainingChatAbortMs(turnStartedAtMs)) },
      providerOptions: buildGeminiThoughtSummaryProviderOptions({
        thinkingLevel: paceConfig.thinkingLevel,
      }),
      onError: ({ error }) => {
        console.error("analytics-chat: llm stream error", {
          reportId,
          sessionId,
          error: formatChatLlmError(error),
        });
      },
      ...langfuseGenerateTextTelemetry({
        functionId: "analytics-chat",
        metadata: {
          reportId,
          sessionId,
          canEdit: canWrite,
          mode,
          chatPromptVersion: ANALYTICS_CHAT_PROMPT_VERSION,
          pace,
          chatModelId: paceConfig.modelId,
          chatThinkingLevel: paceConfig.thinkingLevel,
          chatExtractModelId: CHAT_EXTRACT_GOOGLE_MODEL_ID,
          taggedDocuments: mentions.documents.length,
          recoveredDocumentTags: recoveredDocumentIds.length,
          taggedSheets: mentions.sheets.length,
          taggedAnalyses: mentions.analyses.length,
          userIntent: userIntent.kind,
          userIntentReason: userIntent.reason,
        },
      }),
    })
    );
  } catch (err) {
    stopTurnGuards();
    endActiveLangfuseObservation();
    await clearAssistantTurn(sessionId);
    if (isAiBudgetExceededError(err)) {
      return aiBudgetExceededResponse(err);
    }
    console.error("analytics-chat: failed to start assistant stream", {
      reportId,
      sessionId,
      error: formatChatLlmError(err),
    });
    captureChatAssistantFailure({
      error: err,
      userId: user.id,
      reportId,
      sessionId,
      surface: "analytics",
      site: "stream_start",
    });
    return NextResponse.json(
      { error: CHAT_ASSISTANT_ERROR_MESSAGE },
      { status: 500 }
    );
  }

  after(async () => {
    try {
      const outcome = await consumeAssistantStreamWithBudget(() =>
        result.consumeStream()
      );
      if (outcome === "timed_out") {
        console.error("analytics-chat: consumeStream exceeded budget", {
          reportId,
          sessionId,
        });
      } else if (!isTestStubChat()) {
        const usage = await result.totalUsage;
        await recordAiUsage({
          feature: "analytics_chat",
          modelId: paceConfig.modelId,
          usage,
          reportId,
          userId: user.id,
        });
      }
      await flushLangfuseTraces();
      endActiveLangfuseObservation();
    } finally {
      stopTurnGuards();
      await clearAssistantTurn(sessionId);
    }
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    messageMetadata: () => ({ chatTarget: "analytics" as const }),
    consumeSseStream: ({ stream }) => {
      void drainSseStream(stream);
    },
    onError: (error) => {
      console.error("analytics-chat: assistant stream error", {
        reportId,
        sessionId,
        error: formatChatLlmError(error),
      });
      captureChatAssistantFailure({
        error,
        userId: user.id,
        reportId,
        sessionId,
        surface: "analytics",
        site: "stream_error",
      });
      return CHAT_ASSISTANT_ERROR_MESSAGE;
    },
    onFinish: async ({ responseMessage, isAborted, finishReason }) => {
      stopTurnGuards();
      const persisted = partsForPersistedAssistantTurn({
        parts: responseMessage.parts,
        isAborted,
        finishReason,
      });
      if (persisted.interrupted) {
        console.warn("analytics-chat: interrupted assistant turn", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
          isAborted,
        });
      } else if (persisted.incomplete) {
        console.warn("analytics-chat: incomplete assistant turn", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
        });
      } else if (
        persisted.emptyFailure ||
        isFailedChatFinishReason(finishReason)
      ) {
        console.error("analytics-chat: empty or failed assistant turn", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
          emptyFailure: persisted.emptyFailure,
        });
      }
      try {
        await db.insert(chatMessages).values({
          reportId,
          sessionId,
          role: "assistant",
          parts: persisted.parts,
          metadata: chatAssistantTurnMetadata({
            pace,
            mode,
            promptVersion: ANALYTICS_CHAT_PROMPT_VERSION,
            chatTarget: "analytics",
          }),
          authorId: null,
        });
        await touchChatSession(sessionId, null);
      } catch (err) {
        console.error("analytics-chat: failed to persist assistant message", err);
      } finally {
        setRouteObservationIO({
          output: {
            reportId,
            sessionId,
            finishReason: finishReason ?? null,
            isAborted,
          },
        });
        endActiveLangfuseObservation();
        await clearAssistantTurn(sessionId);
      }
    },
  });
}

export const POST = observeRouteHandler(
  "analytics-chat",
  handleAnalyticsChatPost,
  { endOnExit: false }
);
