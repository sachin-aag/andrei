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
import { deriveChatEditPolicy, isWorkspaceChrome } from "@/lib/ai/chat/edit-policy";
import type { TurnEditItem } from "@/lib/ai/chat/commit-edit";
import type { WorkspaceChrome } from "@/components/report/workspace-chrome";
import { snapshotDocumentRevision } from "@/lib/document-revisions/snapshot";
import {
  CHAT_EXTRACT_GOOGLE_MODEL_ID,
  chatAssistantTurnMetadata,
  chatPaceConfig,
  resolveChatLanguageModel,
} from "@/lib/ai/chat/model";
import { chatUserTurnMetadata } from "@/lib/ai/chat/message-target";
import {
  DEFAULT_CHAT_PACE,
  isChatPace,
  type ChatPace,
} from "@/lib/ai/chat/pace";
import { buildStubChatModel } from "@/lib/ai/chat/stub-model";
import { primaryFieldForSection } from "@/lib/ai/chat/fields";
import { getDocumentType } from "@/lib/document-types";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";
import {
  classifyChatUserIntent,
  messageHasChatImage,
  recentAssistantMessageTexts,
  restrictToolsForIntent,
} from "@/lib/ai/chat/user-intent";
import {
  alreadyDraftedGapHints,
  detectAlreadyDraftedSection,
  alreadyDraftedReadStep,
} from "@/lib/ai/chat/already-drafted";
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
import { auditActorFromUser } from "@/lib/audit";
import { listReadyDocumentsForReport } from "@/lib/attachments/retrieval";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import { getReportAnalytics } from "@/lib/statistical-analysis/store";
import { buildAutoEvidence } from "@/lib/ai/chat/auto-evidence";
import {
  classifyRetrievalPolicy,
  recentUserMessageTexts,
} from "@/lib/ai/chat/retrieval-policy";
import {
  DocumentReviewSession,
  pickPlanModeChatTools,
  prepareDocumentReviewStep,
} from "@/lib/ai/chat/document-review";
import { sanitizeChatMessagesForModel } from "@/lib/ai/chat/image-parts";
import { compactChatToolHistoryForModel } from "@/lib/ai/chat/compact-tool-history";
import { repairChatToolCall } from "@/lib/ai/chat/repair-tool-call";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  CHAT_SERVER_ABORT_MS,
  consumeAssistantStreamWithBudget,
  formatChatLlmError,
  isFailedChatFinishReason,
  partsForPersistedAssistantTurn,
} from "@/lib/ai/chat/assistant-turn";
import { tableEditLoopDirective } from "@/lib/ai/chat/table-edit-loop";
import {
  buildMentionBlock,
  mentionedAttachmentIds,
  mentionedSections,
  parseChatMentions,
  resolveChatMentions,
  sectionScopeFromMentions,
} from "@/lib/ai/chat/mentions";

/** Must stay in sync with `CHAT_FUNCTION_MAX_DURATION_SEC`. */
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

async function handleChatPost(
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
    pace?: string;
    mentions?: unknown;
    workspaceChrome?: unknown;
  };
  const messages = compactChatToolHistoryForModel(
    sanitizeChatMessagesForModel(
      Array.isArray(body.messages) ? body.messages : []
    )
  );
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : "agent";
  const pace: ChatPace = isChatPace(body.pace) ? body.pace : DEFAULT_CHAT_PACE;
  const paceConfig = chatPaceConfig(pace);
  const accessEarly = await loadAccessibleReport(reportId, user);
  if (!accessEarly) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const requestedMentions = parseChatMentions(
    body.mentions,
    accessEarly.report.documentType
  );
  const sectionScope = sectionScopeFromMentions(
    requestedMentions,
    accessEarly.report.documentType
  );

  const access = accessEarly;
  const { report } = access;
  // Plan mode never edits; Agent mode only when section content is still writable.
  const canEdit = mode === "agent" && canSaveReportSection(user, report);
  const workspaceChrome: WorkspaceChrome = isWorkspaceChrome(body.workspaceChrome)
    ? body.workspaceChrome
    : "document";
  const editPolicy = deriveChatEditPolicy({ workspaceChrome, canEdit });
  const turnEdits: TurnEditItem[] = [];

  // Resolve the session (create one if the client didn't supply a valid id).
  let sessionId = body.sessionId?.trim() || "";
  if (sessionId) {
    const found = await findChatSession(reportId, sessionId);
    if (!found) sessionId = "";
  }
  if (!sessionId) {
    sessionId = (await createChatSession(reportId, "report")).id;
  }

  const claimed = await tryMarkAssistantTurnRunning(sessionId);
  if (!claimed) {
    return NextResponse.json(
      { error: "The assistant is still working on the previous reply." },
      { status: 409 }
    );
  }

  // Persist the newest user turn. A failure here silently breaks the thread
  // (this masked a missing chat_messages.session_id column in prod), so fail
  // loudly: return 500 so the client's onError toast fires instead of
  // streaming a reply that would never be saved to history.
  const userMsg = lastUserMessage(messages);
  const userText = messageText(userMsg);
  const userIntent = classifyChatUserIntent({
    userText,
    recentAssistantTexts: recentAssistantMessageTexts(messages),
    hasChatImages: messageHasChatImage(userMsg?.parts),
  });
  if (userMsg) {
    try {
      await db.insert(chatMessages).values({
        reportId,
        sessionId,
        role: "user",
        parts: userMsg.parts ?? [],
        metadata: chatUserTurnMetadata("report"),
        authorId: user.id,
      });
      await touchChatSession(sessionId, userText || null);
    } catch (err) {
      console.error("chat: failed to persist user message", err);
      await clearAssistantTurn(sessionId);
      return NextResponse.json(
        { error: "Failed to save your message. Please try again." },
        { status: 500 }
      );
    }
  }

  // Build the compact context map from current report state.
  const [sectionRows, evaluations, commentRows, documents, analytics] =
    await Promise.all([
      db.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
      db
        .select()
        .from(criteriaEvaluations)
        .where(eq(criteriaEvaluations.reportId, reportId)),
      db.select().from(comments).where(eq(comments.reportId, reportId)),
      listReadyDocumentsForReport(reportId),
      isStatisticalAnalysisEnabled()
        ? getReportAnalytics(reportId)
        : Promise.resolve(null),
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
  const mentions = resolveChatMentions(
    requestedMentions,
    documents,
    analytics?.analyses ?? []
  );
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
    totalReadyPages,
    hasDocuments: documents.length > 0,
  });
  const documentReview = new DocumentReviewSession();

  const alreadyDrafted = detectAlreadyDraftedSection({
    userText,
    sectionScope,
    documentType: report.documentType,
    sections: mergedSections,
  });
  const alreadyDraftedGapHintsForPrompt = alreadyDrafted
    ? alreadyDraftedGapHints(alreadyDrafted.section, evaluations)
    : undefined;
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
    analyticsPlots: analytics?.analyses ?? [],
  });

  const autoEvidenceBlock =
    retrieval.policy === "focused" && userIntent.kind !== "social"
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
    alreadyDrafted,
    alreadyDraftedGapHints: alreadyDraftedGapHintsForPrompt,
    mentionBlock: buildMentionBlock(mentions),
    autoEvidenceBlock,
    retrievalPolicy: retrieval.policy,
    editPolicy,
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
    messages,
    editPolicy,
    turnEdits,
  });
  const scopedTools: ToolSet =
    mode === "plan"
      ? (pickPlanModeChatTools(allTools) as ToolSet)
      : allTools;
  const tools: ToolSet = restrictToolsForIntent(
    scopedTools,
    userIntent.kind,
    "document"
  );

  const stubSection =
    sectionScope === "all"
      ? pickStubSection(userText, report.documentType)
      : sectionScope;
  const model = isTestStubChat()
    ? await buildStubChatModel({
        mode,
        section: stubSection,
        targetField: primaryFieldForSection(stubSection),
        insertText: `Stubbed drafting insertion addressing "${userText.slice(0, 80)}". [Replace with real content once a Gemini credential is configured.]`,
        reasoning: "Demo stub proposal.",
        allowEdits: userIntent.kind === "write",
        intent: userIntent.kind,
      })
    : resolveChatLanguageModel(pace);

  // Tab close / refresh abort the HTTP request. Keep generating anyway —
  // only an explicit Cancel (DB flag) or the deadline stops the model.
  const turnAbort = new AbortController();
  const cancelPoll = setInterval(() => {
    void isAssistantTurnCancelRequested(sessionId).then((requested) => {
      if (requested) turnAbort.abort();
    });
  }, 1_000);
  const stopCancelPoll = () => clearInterval(cancelPoll);

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
        sectionScope,
        userText: userText.slice(0, 500),
      },
    });
    result = withPropagatedAttributes(
      {
        sessionId,
        userId: user.id,
        traceName: "report-chat",
        tags: ["document-chat", mode, pace],
        metadata: {
          reportId,
          documentNo: String(report.documentNo ?? ""),
          documentType: report.documentType,
          mode,
          pace,
          workspaceChrome,
          canEdit,
          sectionScope: sectionScope ?? "",
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
        // Cancel only. No tool-step cap — `CHAT_SERVER_ABORT_MS` is the
        // abnormal-condition stop. Loop guards live in prepareStep.
        return isAssistantTurnCancelRequested(sessionId);
      },
      prepareStep: ({ steps }) => {
        if (userIntent.kind === "social") {
          return { activeTools: [] };
        }
        const tableEditDirective = tableEditLoopDirective(steps);
        if (tableEditDirective === "finish") {
          // Force a plain-language explanation after the second failed table
          // edit instead of allowing a costly retry loop.
          return { activeTools: [] };
        }
        if (tableEditDirective === "reread" && tools.read_section) {
          return {
            activeTools: ["read_section"],
            toolChoice: { type: "tool", toolName: "read_section" },
          };
        }

        const alreadyDraftedActive = alreadyDrafted != null;
        const alreadyDraftedStep = alreadyDraftedReadStep({
          stepsTaken: steps.length,
          alreadyDrafted: alreadyDraftedActive,
          hasReadSectionTool: Boolean(tools.read_section),
        });
        if (alreadyDraftedStep) return alreadyDraftedStep;

        const prepared = prepareDocumentReviewStep({
          policy: alreadyDraftedActive ? "adaptive" : retrieval.policy,
          phase: documentReview.phase(),
          availableTools: Object.keys(tools),
        });
        if (!prepared) return undefined;
        return {
          activeTools: prepared.activeTools,
          ...(prepared.toolChoice ? { toolChoice: prepared.toolChoice } : {}),
        };
      },
      abortSignal: turnAbort.signal,
      // Leave time to persist an interrupted row before Vercel kills the isolate.
      timeout: { totalMs: CHAT_SERVER_ABORT_MS },
      // Gemini 3.x: thinkingLevel only. Do not set temperature / topP / topK /
      // seed — Google warns that sampling overrides degrade reasoning.
      // includeThoughts stays on for Langfuse; UI does not stream them.
      providerOptions: buildGeminiThoughtSummaryProviderOptions({
        thinkingLevel: paceConfig.thinkingLevel,
      }),
      onError: ({ error }) => {
        console.error("chat: llm stream error", {
          reportId,
          sessionId,
          mode,
          pace,
          sectionScope,
          error: formatChatLlmError(error),
        });
      },
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
          taggedAnalyses: mentions.analyses.length,
          chatPromptVersion: CHAT_PROMPT_VERSION,
          pace,
          chatModelId: paceConfig.modelId,
          chatThinkingLevel: paceConfig.thinkingLevel,
          chatExtractModelId: CHAT_EXTRACT_GOOGLE_MODEL_ID,
          retrievalPolicy: retrieval.policy,
          retrievalPolicyReason: retrieval.reason,
          userIntent: userIntent.kind,
          userIntentReason: userIntent.reason,
        },
      }),
    })
    );
  } catch (err) {
    stopCancelPoll();
    endActiveLangfuseObservation();
    await clearAssistantTurn(sessionId);
    if (isAiBudgetExceededError(err)) {
      return aiBudgetExceededResponse(err);
    }
    console.error("chat: failed to start assistant stream", {
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
        console.error("chat: consumeStream exceeded budget", {
          reportId,
          sessionId,
        });
      } else if (!isTestStubChat()) {
        const usage = await result.totalUsage;
        await recordAiUsage({
          feature: "document_chat",
          modelId: paceConfig.modelId,
          usage,
          reportId,
          userId: user.id,
        });
      }
      await flushLangfuseTraces();
      endActiveLangfuseObservation();
    } finally {
      stopCancelPoll();
      await clearAssistantTurn(sessionId);
    }
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Stream thought summaries to the chat activity UI (expandable Thought lines).
    sendReasoning: true,
    messageMetadata: () => ({ chatTarget: "report" as const }),
    // Drain the teed SSE now. Wrapping this in Next `after()` waits until the
    // HTTP response finishes — and the tee only finishes if this copy is
    // already being read. That deadlock wedged `next start` after a client
    // dropped mid-turn (Playwright teardown, tab close, or + in another chat).
    consumeSseStream: ({ stream }) => {
      void drainSseStream(stream);
    },
    onError: (error) => {
      console.error("chat: assistant stream error", {
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
        finishReason,
      });
      if (persisted.interrupted) {
        console.warn("chat: interrupted assistant turn", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
          isAborted,
          partTypes: (responseMessage.parts ?? []).map((part) => part.type),
        });
      } else if (persisted.incomplete) {
        console.warn("chat: incomplete assistant turn", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
          partTypes: (responseMessage.parts ?? []).map((part) => part.type),
        });
      } else if (
        persisted.emptyFailure ||
        isFailedChatFinishReason(finishReason)
      ) {
        console.error("chat: empty or failed assistant turn", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
          isAborted,
          emptyFailure: persisted.emptyFailure,
          partTypes: (responseMessage.parts ?? []).map((part) => part.type),
        });
      }
      try {
        const changeItems = turnEdits.map((item) => ({
          section: item.section,
          targetField: item.targetField,
          reasoning: item.reasoning,
        }));
        const [inserted] = await db
          .insert(chatMessages)
          .values({
            reportId,
            sessionId,
            role: "assistant",
            parts: persisted.parts,
            metadata: chatAssistantTurnMetadata({
              pace,
              mode,
              promptVersion: CHAT_PROMPT_VERSION,
              chatTarget: "report",
              changeSummary:
                changeItems.length > 0 ? { items: changeItems } : undefined,
            }),
            authorId: null,
          })
          .returning({ id: chatMessages.id });

        if (changeItems.length > 0 && inserted) {
          try {
            const revision = await snapshotDocumentRevision({
              reportId,
              documentType: report.documentType,
              summary: changeItems
                .map((item) => item.reasoning.trim() || item.targetField)
                .filter(Boolean)
                .join("; "),
              createdBy: user.id,
              chatSessionId: sessionId,
              chatMessageId: inserted.id,
            });
            await db
              .update(chatMessages)
              .set({
                metadata: chatAssistantTurnMetadata({
                  pace,
                  mode,
                  promptVersion: CHAT_PROMPT_VERSION,
                  chatTarget: "report",
                  changeSummary: {
                    items: changeItems,
                    revisionNo: revision.revisionNo,
                  },
                }),
              })
              .where(eq(chatMessages.id, inserted.id));
          } catch (err) {
            console.error("chat: failed to snapshot document revision", err);
          }
        }
        await touchChatSession(sessionId, null);
      } catch (err) {
        // The reply already streamed to the client, so we can only log here —
        // a failure means it's missing from history on reload, nothing more.
        console.error("chat: failed to persist assistant message", err);
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

export const POST = observeRouteHandler("report-chat", handleChatPost, {
  endOnExit: false,
});
