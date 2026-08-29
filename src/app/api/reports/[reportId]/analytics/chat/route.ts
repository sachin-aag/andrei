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
  ANALYTICS_CHAT_STEP_BUDGET,
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
  flushLangfuseTraces,
  langfuseGenerateTextTelemetry,
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
import { sanitizeChatMessagesForModel } from "@/lib/ai/chat/image-parts";
import { repairChatToolCall } from "@/lib/ai/chat/repair-tool-call";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  CHAT_SERVER_ABORT_MS,
  consumeAssistantStreamWithBudget,
  formatChatLlmError,
  isFailedChatFinishReason,
  partsForPersistedAssistantTurn,
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
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
  const messages = sanitizeChatMessagesForModel(
    Array.isArray(body.messages) ? body.messages : []
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

  const userMsg = lastUserMessage(messages);
  const userText = messageText(userMsg);
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
  const mentions = resolveAnalyticsChatMentions(
    requestedMentions,
    documents,
    analytics
  );
  const pinnedAttachmentIds = mentionedAnalyticsAttachmentIds(mentions);
  const focusedSheetId = primaryTaggedSheetId(mentions);
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : "agent";
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
  });
  const tools = buildAnalyticsChatTools({
    reportId,
    canEdit: canWrite,
    documentType: report.documentType,
    searchGate,
    pinnedAttachmentIds,
    focusedSheetId,
    actor: auditActorFromUser(user),
  });
  const pace: ChatPace = isChatPace(body.pace) ? body.pace : DEFAULT_CHAT_PACE;
  const paceConfig = chatPaceConfig(pace);
  const model = isTestStubChat()
    ? await buildStubAnalyticsChatModel()
    : resolveChatLanguageModel(pace);

  const turnAbort = new AbortController();
  const cancelPoll = setInterval(() => {
    void isAssistantTurnCancelRequested(sessionId).then((requested) => {
      if (requested) turnAbort.abort();
    });
  }, 1_000);
  const stopCancelPoll = () => clearInterval(cancelPoll);
  let stoppedForStepBudget = false;

  let result;
  try {
    if (!isTestStubChat()) {
      await assertAiBudgetAvailable();
    }
    result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages),
      tools,
      experimental_repairToolCall: repairChatToolCall,
      stopWhen: async ({ steps }) => {
        if (await isAssistantTurnCancelRequested(sessionId)) return true;
        if (steps.length >= ANALYTICS_CHAT_STEP_BUDGET) {
          stoppedForStepBudget = true;
          return true;
        }
        return false;
      },
      prepareStep: ({ steps }) =>
        prepareAnalyticsChatStep({ steps, canEdit: canWrite, searchGate }),
      abortSignal: turnAbort.signal,
      timeout: { totalMs: CHAT_SERVER_ABORT_MS },
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
          taggedSheets: mentions.sheets.length,
          taggedAnalyses: mentions.analyses.length,
        },
      }),
    });
  } catch (err) {
    stopCancelPoll();
    await clearAssistantTurn(sessionId);
    if (isAiBudgetExceededError(err)) {
      return aiBudgetExceededResponse(err);
    }
    console.error("analytics-chat: failed to start assistant stream", {
      reportId,
      sessionId,
      error: formatChatLlmError(err),
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
    } finally {
      stopCancelPoll();
      await clearAssistantTurn(sessionId);
    }
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: false,
    consumeSseStream: ({ stream }) => {
      void drainSseStream(stream);
    },
    onError: (error) => {
      console.error("analytics-chat: assistant stream error", {
        reportId,
        sessionId,
        error: formatChatLlmError(error),
      });
      return CHAT_ASSISTANT_ERROR_MESSAGE;
    },
    onFinish: async ({ responseMessage, isAborted, finishReason }) => {
      stopCancelPoll();
      const persisted = partsForPersistedAssistantTurn({
        parts: responseMessage.parts,
        isAborted,
        stepBudgetExhausted: stoppedForStepBudget,
        finishReason,
      });
      if (persisted.interrupted) {
        console.warn("analytics-chat: interrupted assistant turn", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
          isAborted,
        });
      } else if (persisted.stepBudgetExhausted) {
        console.warn("analytics-chat: step budget exhausted", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
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
          }),
          authorId: null,
        });
        await touchChatSession(sessionId, null);
      } catch (err) {
        console.error("analytics-chat: failed to persist assistant message", err);
      } finally {
        await clearAssistantTurn(sessionId);
      }
    },
  });
}
