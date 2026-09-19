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
import { isWorkspaceChrome } from "@/lib/ai/chat/edit-policy";
import type { WorkspaceChrome } from "@/components/report/workspace-chrome";
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
import {
  chatSectionsInScope,
  primaryFieldForSection,
  sectionHasTable,
} from "@/lib/ai/chat/fields";
import { getDocumentType } from "@/lib/document-types";
import { detectSectionIntentFromText } from "@/lib/ai/chat/section-intent";
import {
  DOCUMENT_WRITE_TOOLS,
  messageHasChatImage,
  recentAssistantMessageTexts,
  restrictToolsForIntent,
} from "@/lib/ai/chat/user-intent";
import {
  documentIntentFocus,
  resolveChatUserIntent,
} from "@/lib/ai/chat/resolve-user-intent";
import { alreadyDraftedGapHints } from "@/lib/ai/chat/already-drafted";
import {
  createChatSession,
  findChatSession,
  saveChatPendingPlan,
  touchChatSession,
} from "@/lib/ai/chat/sessions";
import {
  advancePlanAfterTurn,
  chatUserTurnIsAutoContinue,
  currentPlanTurnSections,
  inScopeEmptyInventoryNeedsReview,
  livePlanProgressFromParts,
  parseChatPendingPlan,
  persistablePendingPlan,
  planCoverageObjective,
  planKeepsComprehensive,
  resolvePlanAtTurnStart,
  type ChatPendingPlan,
} from "@/lib/ai/chat/pending-plan";
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
  getActiveTraceId,
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
import { detectCourseCorrection } from "@/lib/ai/chat/course-correction";
import {
  recordUserCourseCorrectScore,
  flushLangfuseScores,
} from "@/lib/observability/langfuse-scores";
import { auditActorFromUser } from "@/lib/audit";
import { listReadyDocumentsForReport } from "@/lib/attachments/retrieval";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import { getReportAnalytics } from "@/lib/statistical-analysis/store";
import { buildAutoEvidence } from "@/lib/ai/chat/auto-evidence";
import {
  isRetrievalPushback,
  recentUserMessageTexts,
} from "@/lib/ai/chat/retrieval-policy";
import {
  DocumentReviewSession,
  pickPlanModeChatTools,
  reviewContinueBudgetMs,
} from "@/lib/ai/chat/document-review";
import {
  rehydrateDocumentReviewIfCoverageUnchanged,
  retrievalPolicyAfterCoverageDelta,
} from "@/lib/ai/chat/document-review-rehydrate";
import { createSearchGate } from "@/lib/ai/chat/search-loop";
import { sanitizeChatMessagesForModel } from "@/lib/ai/chat/image-parts";
import { compactChatToolHistoryForModel, compactInTurnModelMessages } from "@/lib/ai/chat/compact-tool-history";
import { repairChatToolCall } from "@/lib/ai/chat/repair-tool-call";
import {
  captureChatAssistantFailure,
  captureChatTurnDeadlineAbort,
} from "@/lib/ai/chat/chat-failure-telemetry";
import {
  abortChatTurnForCancel,
  CHAT_ASSISTANT_ERROR_MESSAGE,
  chatUiStreamErrorText,
  consumeAssistantStreamWithBudget,
  formatChatLlmError,
  isChatTurnDeadlineReached,
  isFailedChatFinishReason,
  partsForPersistedAssistantTurn,
  remainingChatAbortMs,
  scheduleChatTurnDeadline,
} from "@/lib/ai/chat/assistant-turn";
import { prepareReportChatStep, lastStartNeedsAttachmentScope } from "@/lib/ai/chat/step-policy";
import { assembleChatTurnPlan } from "@/lib/ai/chat/turn-plan";
import {
  renderPlaceholderFillEvidence,
} from "@/lib/ai/chat/placeholder-fill";
import { searchPlaceholderFill } from "@/lib/ai/chat/placeholder-fill-search";
import {
  advertisedChatToolNames,
  withUnsupportedChatToolFallback,
} from "@/lib/ai/chat/unsupported-tool";
import {
  buildMentionBlock,
  mentionedAttachmentIds,
  mentionedSections,
  parseChatMentions,
  recoverDocumentMentionIds,
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
  // Vercel maxDuration starts here. The SDK timeout used to start at
  // streamText, so pre-stream work ate the persist margin.
  const turnStartedAtMs = Date.now();
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

  // Resolve the session (create one if the client didn't supply a valid id).
  let existingPlan: ChatPendingPlan | null = null;
  let sessionId = body.sessionId?.trim() || "";
  if (sessionId) {
    const found = await findChatSession(reportId, sessionId);
    if (!found) {
      sessionId = "";
    } else {
      existingPlan = parseChatPendingPlan(found.pendingPlan);
    }
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
  const autoContinue = chatUserTurnIsAutoContinue(userMsg?.metadata);
  if (userMsg) {
    try {
      await db.insert(chatMessages).values({
        reportId,
        sessionId,
        role: "user",
        parts: userMsg.parts ?? [],
        metadata: chatUserTurnMetadata("report", { autoContinue }),
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
  const requestedDocumentIds = new Set(
    requestedMentions
      .filter((mention) => mention.type === "document")
      .map((mention) => mention.id)
  );
  const recoveredDocumentIds = recoverDocumentMentionIds(userText, documents).filter(
    (id) => !requestedDocumentIds.has(id)
  );
  const mentionsForResolution = [
    ...requestedMentions,
    ...recoveredDocumentIds.map((id) => ({ type: "document" as const, id })),
  ];
  // Resolved against this report's ready documents only, so a tagged
  // attachment id from another report cannot pull in its evidence.
  const mentions = resolveChatMentions(
    mentionsForResolution,
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
  const intentFocus = documentIntentFocus({
    userText,
    sectionScope,
    documentType: report.documentType,
    sections: mergedSections,
  });
  let userIntent = await resolveChatUserIntent({
    userText,
    recentAssistantTexts: recentAssistantMessageTexts(messages),
    hasChatImages: messageHasChatImage(userMsg?.parts),
    mode,
    surface: "document",
    workspaceChrome,
    sectionLabel: intentFocus.sectionLabel,
    fillState: intentFocus.fillState,
    reportId,
    userId: user.id,
  });
  const switchToAnalytics = userIntent.switchToAnalytics === true;
  let pendingPlan: ChatPendingPlan | null = existingPlan;
  if (mode === "agent") {
    pendingPlan = resolvePlanAtTurnStart({
      existing: existingPlan,
      userText,
      autoContinue,
      writeIntent: userIntent.kind === "write",
      documentType: report.documentType,
      sections: mergedSections,
      promptVersion: CHAT_PROMPT_VERSION,
    });
    const toSave = persistablePendingPlan(pendingPlan);
    if (JSON.stringify(toSave) !== JSON.stringify(existingPlan)) {
      try {
        await saveChatPendingPlan(sessionId, toSave);
      } catch (err) {
        console.error("chat: failed to save pending plan", err);
      }
    }
    if (pendingPlan && !pendingPlan.paused && userIntent.kind !== "write") {
      userIntent = { ...userIntent, kind: "write", reason: "pending_section_plan" };
    }
  }

  // Detect course correction — user contradicting or overriding prior LLM output.
  const recentTexts = recentAssistantMessageTexts(messages);
  const courseCorrection = detectCourseCorrection({
    userText,
    recentAssistantTexts: recentTexts,
    hasPriorAssistantOutput: recentTexts.length > 0,
  });
  if (courseCorrection.detected) {
    const courseCorrectionTraceId = getActiveTraceId() ?? undefined;
    after(async () => {
      await recordUserCourseCorrectScore({
        traceId: courseCorrectionTraceId,
        sessionId,
        reportId,
        reason: courseCorrection.reason,
        previousAssistantText: recentTexts[0],
        userText,
      });
      await flushLangfuseScores();
    });
  }

  const turnPlan = assembleChatTurnPlan({
    userText,
    userIntent,
    sectionScope,
    documentType: report.documentType,
    recentUserTexts: recentUserMessageTexts(messages),
    mentionedPageCount,
    totalReadyPages,
    hasDocuments: documents.length > 0,
    sections: mergedSections,
  });
  const retrievalDecision = {
    policy: turnPlan.retrievalPolicy,
    reason: turnPlan.retrievalReason,
  };
  const documentReview = new DocumentReviewSession();
  const pushback = isRetrievalPushback(userText);
  const coverageObjective = planCoverageObjective(pendingPlan, userText, {
    sectionScope,
    documentType: report.documentType,
  });
  const coverageRehydrate = rehydrateDocumentReviewIfCoverageUnchanged({
    session: documentReview,
    messages,
    readyDocuments: documents.map((doc) => ({
      attachmentId: doc.attachmentId,
      pageCount: doc.pageCount ?? 0,
      ingestRunId: doc.ingestRunId,
    })),
    skipRestore: pushback,
    coverageObjective,
  });
  const inventoryTurnSections =
    pendingPlan && !pendingPlan.paused
      ? currentPlanTurnSections(pendingPlan, report.documentType).map(
          (item) => item.sectionKey as SectionType
        )
      : sectionScope && sectionScope !== "all"
        ? [sectionScope]
        : turnPlan.sectionIntent
          ? [turnPlan.sectionIntent]
          : [];
  const needsInventoryReview = inScopeEmptyInventoryNeedsReview({
    documentType: report.documentType,
    sections: mergedSections,
    sectionKeys: inventoryTurnSections,
    finishedCoverageKey: documentReview.finishedCoverageKey(),
    inventoryFinishSatisfiesDraft: documentReview.inventoryFinishSatisfiesDraft(),
  });
  // Coverage growth or explicit pushback can start a fresh comprehensive walk.
  // Queued ELR inventory and empty inventory fills keep comprehensive so a
  // finished qualification walk cannot downgrade the next calibration turn.
  let retrievalPolicy = retrievalPolicyAfterCoverageDelta({
    policy: retrievalDecision.policy,
    coverageUnchanged: coverageRehydrate.restored,
    keepComprehensive:
      pushback || planKeepsComprehensive(pendingPlan, report.documentType),
  });
  if (needsInventoryReview && retrievalPolicy !== "comprehensive") {
    retrievalPolicy = "comprehensive";
  }
  const retrieval = {
    ...retrievalDecision,
    policy: retrievalPolicy,
  };

  const alreadyDrafted = turnPlan.alreadyDrafted;
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
    metadata:
      report.metadata &&
      typeof report.metadata === "object" &&
      !Array.isArray(report.metadata)
        ? (report.metadata as Record<string, unknown>)
        : undefined,
    analyticsPlots: analytics?.analyses ?? [],
  });

  const placeholderFill =
    retrieval.policy === "adaptive" &&
    retrieval.reason === "placeholder_fill" &&
    documents.length > 0
      ? await searchPlaceholderFill({
          reportId,
          sections: mergedSections,
          attachmentIds:
            pinnedAttachmentIds.length > 0 ? pinnedAttachmentIds : undefined,
        })
      : { queries: [], hits: [] };
  const focusedEvidence =
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
  const autoEvidenceBlock = [
    focusedEvidence,
    renderPlaceholderFillEvidence(placeholderFill.hits),
  ]
    .filter((block) => block.trim().length > 0)
    .join("\n\n");

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
    intent: userIntent.kind,
    switchToAnalytics,
    pendingPlan,
  });

  const searchGate = createSearchGate();
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
    reviewCoverageObjective: coverageObjective,
    searchGate,
    reviewContinueBudgetMs: reviewContinueBudgetMs(
      remainingChatAbortMs(turnStartedAtMs)
    ),
    seedCitationHits: placeholderFill.hits.map((hit) => ({
      filename: hit.filename,
      pageNumber: hit.pageNumber,
      attachmentId: hit.attachmentId,
      quote: hit.quote || hit.text,
      citationId: hit.citationId,
      sourceSha256: hit.sourceSha256,
    })),
  });
  const scopedTools: ToolSet =
    mode === "plan"
      ? (pickPlanModeChatTools(allTools) as ToolSet)
      : allTools;
  // Agent keeps write tools registered on a read turn so a remapped
  // unsupported_tool can unlock them mid-turn. Ask still strips them.
  const tools: ToolSet = withUnsupportedChatToolFallback(
    userIntent.kind === "social"
      ? restrictToolsForIntent(scopedTools, "social", "document")
      : mode === "agent"
        ? scopedTools
        : restrictToolsForIntent(scopedTools, userIntent.kind, "document")
  );
  const advertisedTools = advertisedChatToolNames(
    restrictToolsForIntent(tools, userIntent.kind, "document")
  );
  const registeredWriteTools = DOCUMENT_WRITE_TOOLS.filter(
    (name) => name in tools
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
  // only an explicit Cancel (DB flag) or the wall-clock deadline stops it.
  const turnAbort = new AbortController();
  const stopDeadline = scheduleChatTurnDeadline(turnAbort, turnStartedAtMs);
  const cancelPoll = setInterval(() => {
    void isAssistantTurnCancelRequested(sessionId).then((requested) => {
      if (requested) abortChatTurnForCancel(turnAbort);
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
          section_id: sectionScope ?? "",
          user_course_corrected: courseCorrection.detected,
        },
      },
      () =>
        streamText({
      model,
      system,
      messages: modelMessages,
      tools,
      activeTools: advertisedTools,
      experimental_repairToolCall: repairChatToolCall,
      stopWhen: async () => {
        // Cancel or wall-clock deadline. No tool-step cap. Loop guards
        // live in prepareStep.
        if (isChatTurnDeadlineReached(turnStartedAtMs)) return true;
        return isAssistantTurnCancelRequested(sessionId);
      },
      prepareStep: ({ steps, messages }) => {
        const inventoryReviewInput = {
          documentType: report.documentType,
          sections: mergedSections,
          sectionKeys: inventoryTurnSections,
          finishedCoverageKey: documentReview.finishedCoverageKey(),
        };
        const decision = prepareReportChatStep({
          advertisedTools,
          steps,
          userIntentKind: userIntent.kind,
          alreadyDrafted: alreadyDrafted != null,
          hasReadSectionTool: Boolean(tools.read_section),
          inScopeHasTable: chatSectionsInScope(
            sectionScope ?? "all",
            report.documentType
          ).some((section) => sectionHasTable(mergedSections[section], section)),
          retrievalPolicy: retrieval.policy,
          reviewPhase: documentReview.phase(),
          requireInventoryReview:
            alreadyDrafted != null
              ? false
              : inScopeEmptyInventoryNeedsReview({
                  ...inventoryReviewInput,
                  inventoryFinishSatisfiesDraft:
                    documentReview.inventoryFinishSatisfiesDraft(),
                }),
          restartInventoryReview:
            alreadyDrafted != null
              ? false
              : inScopeEmptyInventoryNeedsReview(inventoryReviewInput),
          searchGate,
          forceListAttachments: lastStartNeedsAttachmentScope(steps),
          forceFinishReview:
            reviewContinueBudgetMs(remainingChatAbortMs(turnStartedAtMs)) === 0,
          registeredWriteTools,
        });
        return {
          ...decision,
          messages: compactInTurnModelMessages(messages),
        };
      },
      abortSignal: turnAbort.signal,
      // Remaining time from request start so persist still runs.
      timeout: { totalMs: Math.max(1, remainingChatAbortMs(turnStartedAtMs)) },
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
          recoveredDocumentTags: recoveredDocumentIds.length,
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
          section_id: sectionScope ?? "",
          user_course_corrected: courseCorrection.detected,
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
    console.error("chat: failed to start assistant stream", {
      reportId,
      sessionId,
      error: formatChatLlmError(err),
    });
    await captureChatAssistantFailure({
      error: err,
      userId: user.id,
      reportId,
      sessionId,
      surface: "report",
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
        console.error("chat: consumeStream exceeded budget", {
          reportId,
          sessionId,
        });
        await captureChatAssistantFailure({
          error: new Error("consumeStream exceeded budget"),
          userId: user.id,
          reportId,
          sessionId,
          surface: "report",
          site: "consume_timeout",
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
      stopTurnGuards();
      await clearAssistantTurn(sessionId);
    }
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Stream thought summaries to the chat activity UI (expandable Thought lines).
    sendReasoning: true,
    messageMetadata: () => ({
      chatTarget: "report" as const,
      ...(switchToAnalytics ? { switchToAnalytics: true as const } : {}),
    }),
    // Drain the teed SSE now. Wrapping this in Next `after()` waits until the
    // HTTP response finishes — and the tee only finishes if this copy is
    // already being read. That deadlock wedged `next start` after a client
    // dropped mid-turn (Playwright teardown, tab close, or + in another chat).
    consumeSseStream: ({ stream }) => {
      void drainSseStream(stream);
    },
    onError: (error) => {
      const formatted = chatUiStreamErrorText(error);
      if (formatted.recoverable) {
        console.warn("chat: unavailable tool in stream", {
          reportId,
          sessionId,
          error: formatChatLlmError(error),
        });
        return formatted.text;
      }
      console.error("chat: assistant stream error", {
        reportId,
        sessionId,
        error: formatChatLlmError(error),
      });
      const reportFailure = () =>
        captureChatAssistantFailure({
          error,
          userId: user.id,
          reportId,
          sessionId,
          surface: "report",
          site: "stream_error",
        });
      try {
        after(reportFailure);
      } catch {
        void reportFailure();
      }
      return formatted.text;
    },
    onFinish: async ({ responseMessage, isAborted, finishReason }) => {
      stopTurnGuards();
      const persisted = partsForPersistedAssistantTurn({
        parts: responseMessage.parts,
        isAborted,
        finishReason,
      });
      const deadlineAbort = await captureChatTurnDeadlineAbort({
        startedAtMs: turnStartedAtMs,
        abortReason: turnAbort.signal.reason,
        isAborted,
        finishReason,
        userId: user.id,
        reportId,
        sessionId,
        surface: "report",
      });
      if (deadlineAbort) {
        console.warn("chat: wall-clock deadline abort", {
          reportId,
          sessionId,
          finishReason: finishReason ?? "unknown",
          isAborted,
          durationMs: Date.now() - turnStartedAtMs,
        });
      } else if (persisted.interrupted) {
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
        await captureChatAssistantFailure({
          error: new Error("empty or failed assistant turn"),
          userId: user.id,
          reportId,
          sessionId,
          surface: "report",
          site: "empty_turn",
          extra: {
            finishReason: finishReason ?? "unknown",
            emptyFailure: persisted.emptyFailure,
          },
        });
      }
      try {
        const live = livePlanProgressFromParts(persisted.parts);
        const advanced =
          mode === "agent" && pendingPlan && !pendingPlan.paused
            ? advancePlanAfterTurn({
                plan: pendingPlan,
                documentType: report.documentType,
                draftedSectionKeys: live.draftedSectionKeys,
                parts: persisted.parts,
              })
            : null;
        if (advanced) {
          try {
            await saveChatPendingPlan(
              sessionId,
              persistablePendingPlan(advanced.plan)
            );
          } catch (err) {
            console.error("chat: failed to save pending plan", err);
          }
        }
        const assistantMetadata = () =>
          chatAssistantTurnMetadata({
            pace,
            mode,
            promptVersion: CHAT_PROMPT_VERSION,
            chatTarget: "report",
            switchToAnalytics,
            continuation: advanced?.continuation ?? undefined,
          });
        await db.insert(chatMessages).values({
          reportId,
          sessionId,
          role: "assistant",
          parts: persisted.parts,
          metadata: assistantMetadata(),
          authorId: null,
        });
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
