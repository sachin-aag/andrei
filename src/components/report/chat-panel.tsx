"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  isFileUIPart,
  type FileUIPart,
  type UIMessage,
  type UIMessagePart,
} from "ai";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUp,
  Sparkles,
  PencilLine,
  Table2,
  BookOpen,
  FileText,
  Loader2,
  Plus,
  History,
  ClipboardList,
  Wrench,
  Check,
  ImagePlus,
  ImageMinus,
  LineChart,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChatVoiceButton } from "@/components/report/chat-voice-button";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { ChatMessageTargetTag } from "@/components/report/chat-message-target-tag";
import {
  chatMessageTargetLabel,
  tagChatMessages,
  type ChatMessageTarget,
} from "@/lib/ai/chat/message-target";
import {
  isRedundantInsertImageChip,
  type InsertImageChipInfo,
} from "@/components/report/chat-insert-image-chips";
import {
  AskUserForm,
  type AskUserQuestionInput,
} from "@/components/report/chat-ask-user-form";
import {
  ANALYTICS_CHAT_MODE_OPTIONS,
  CHAT_PACE_OPTIONS,
  CHAT_WORK_PRODUCT_OPTIONS,
  ChatBusyStatus,
  ComposerSelect,
  DOCUMENT_CHAT_MODE_OPTIONS,
} from "@/components/report/chat-composer-controls";
import {
  chatWorkProductTarget,
  isWorkProductView,
  type WorkProductView,
  type WorkspaceChrome,
} from "@/components/report/workspace-chrome";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import { useUserDirectory } from "@/providers/user-directory-provider";
import { useReportData } from "@/providers/report-provider";
import {
  aiSuggestionLockReason,
  canSaveReportSection,
} from "@/lib/reports/access";
import type { DocumentType, SectionType } from "@/db/schema";
import {
  chatEditableSections,
  sectionLabel as chatSectionLabel,
} from "@/lib/ai/chat/fields";
import { isChatPace, type ChatPace } from "@/lib/ai/chat/pace";
import {
  DEFAULT_CHAT_COMPOSER_PREFS,
  readChatComposerPrefs,
  subscribeChatComposerPrefs,
  writeChatComposerPrefs,
} from "@/lib/ai/chat/composer-prefs";
import {
  examplePromptsForMode,
  analyticsExamplePromptsForMode,
  documentEmptyChatIntro,
} from "@/lib/ai/chat/example-prompts";
import { isChatMode, type ChatMode } from "@/lib/ai/chat/system-prompt";
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_MAX_IMAGES_PER_MESSAGE,
  isAllowedChatImageMediaType,
} from "@/lib/ai/chat/image-parts";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  chatWatchdogPhase,
  shouldShowEmptyAssistantError,
} from "@/lib/ai/chat/assistant-turn";
import {
  dropBackgroundSession,
  forgetMountedSession,
  nextMountedSessionId,
  rememberBackgroundSession,
  rememberMountedSession,
  runningChatSessionIds,
  waitForValue,
  type MountedChatSession,
} from "@/lib/ai/chat/session-runtime";
import type { ChatSessionSummary } from "@/lib/ai/chat/sessions";
import {
  buildChatSessionTabItems,
  chatSessionTabSnapshot,
  sessionTabSnapshotsEqual,
  type SessionTabSnapshot,
} from "@/lib/ai/chat/session-tab";
import {
  applyMentionToInput,
  filterMentionCandidates,
  findMentionQuery,
  mentionKey,
  syncMentionCandidateLabels,
  type MentionCandidate,
  type MentionQuery,
} from "@/lib/ai/chat/mention-search";
import { compressImageFile } from "@/lib/images/compress-image";
import {
  ChatSessionHost,
  IDLE_CHAT_RUNTIME,
  type ChatSessionRuntime,
} from "@/components/report/chat-session-host";
import { ChatSessionTabs } from "@/components/report/chat-session-tabs";
import { DocumentReviewProgress } from "@/components/report/document-review-progress";
import {
  DocumentUploadingNotice,
  useDocumentUploadingNotice,
} from "@/components/report/document-uploading-notice";
import {
  isDocumentReviewToolName,
  type DocumentReviewToolPart,
} from "@/lib/ai/chat/document-review-ui";
import {
  CHAT_VISIBLE_TAIL,
  nextVisibleCount,
  shouldLoadOlderMessages,
  visibleMessageStartIndex,
} from "@/components/report/chat-visible-messages";
import {
  captureChatScrollPosition,
  isChatScrollerLaidOut,
  pinChatScrollerToBottom,
  restoreChatScrollPosition,
  shouldReapplyChatScroll,
  shouldStickChatToBottom,
  type ChatScrollPosition,
} from "@/components/report/chat-scroll-position";
import { getDocumentType } from "@/lib/document-types";
import { formatReplacedOlderSuggestionsNote } from "@/lib/suggestions/supersession";
import { readAgentDonePrefs } from "@/lib/notifications/agent-done-prefs";
import {
  agentDoneNotificationCopy,
  elapsedSince,
  notifyAgentDone,
  requestAgentDoneNotificationPermission,
  shouldAnnounceAgentDone,
  shouldShowAgentDonePendingHint,
  unlockAgentDoneAudio,
} from "@/lib/notifications/notify-agent-done";
import {
  AnalyticsChatToolChip,
  isAnalyticsWorksheetMutationTool,
} from "@/components/statistical-analysis/analytics-chat-tool-chip";
import { getReportAnalytics } from "@/lib/statistical-analysis/client";
import {
  analyticsSheetMentionCandidates,
  type AnalyticsMentionSheet,
} from "@/lib/statistical-analysis/mentions";
import { analysisListSubtitle } from "@/lib/statistical-analysis/stale";
import { listGraphAnalyses } from "@/lib/statistical-analysis/insertable-graphs";
import type { ReportAnalyticsView } from "@/lib/statistical-analysis/types";
import { dataSheets } from "@/lib/statistical-analysis/worksheet";

type PendingChatImage = {
  id: string;
  part: FileUIPart;
};

function announceCompletedAssistantTurn(
  startedAt: number | null,
  ctx: {
    currentUserId: string;
    documentNo: string;
    documentType: DocumentType;
  }
): void {
  const elapsedMs = elapsedSince(startedAt);
  if (!shouldAnnounceAgentDone({ elapsedMs })) return;
  const { documentNoun } = getDocumentType(ctx.documentType);
  notifyAgentDone(
    readAgentDonePrefs(ctx.currentUserId),
    agentDoneNotificationCopy({
      documentNoun,
      documentNo: ctx.documentNo,
    })
  );
}

type ToolPartInfo = {
  toolName: string;
  state: string;
  toolCallId: string | undefined;
  input: Record<string, unknown> | undefined;
  output: Record<string, unknown> | undefined;
  errorText: string | undefined;
};

function readToolPart(part: UIMessagePart<never, never>): ToolPartInfo | null {
  if (typeof part.type !== "string" || !part.type.startsWith("tool-")) return null;
  const p = part as unknown as {
    type: string;
    state?: string;
    toolCallId?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    errorText?: string;
  };
  return {
    toolName: p.type.slice("tool-".length),
    state: p.state ?? "",
    toolCallId: typeof p.toolCallId === "string" ? p.toolCallId : undefined,
    input: p.input,
    output: p.output,
    errorText: p.errorText,
  };
}

type AssistantPartGroup =
  | { kind: "text"; text: string }
  | { kind: "document-review"; parts: DocumentReviewToolPart[] }
  | { kind: "other"; part: UIMessagePart<never, never> };

function groupAssistantParts(
  parts: UIMessage["parts"]
): AssistantPartGroup[] {
  const groups: AssistantPartGroup[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      groups.push({ kind: "text", text: (part as { text: string }).text });
      continue;
    }
    const tool = readToolPart(part as UIMessagePart<never, never>);
    if (tool && isDocumentReviewToolName(tool.toolName)) {
      const reviewPart: DocumentReviewToolPart = {
        toolName: tool.toolName,
        state: tool.state,
        input: tool.input,
        output: tool.output,
      };
      const existing = groups.find(
        (group): group is Extract<AssistantPartGroup, { kind: "document-review" }> =>
          group.kind === "document-review"
      );
      if (existing) {
        existing.parts.push(reviewPart);
      } else {
        groups.push({ kind: "document-review", parts: [reviewPart] });
      }
      continue;
    }
    groups.push({ kind: "other", part: part as UIMessagePart<never, never> });
  }
  return groups;
}

function sectionLabel(section: unknown): string {
  if (typeof section === "string") return chatSectionLabel(section as SectionType);
  return "section";
}

function replacedOlderSuffix(output: { supersededSuggestionIds?: unknown } | undefined): string {
  const ids = output?.supersededSuggestionIds;
  if (!Array.isArray(ids)) return "";
  return formatReplacedOlderSuggestionsNote(ids.length);
}

function parseAskUserQuestions(input: Record<string, unknown> | undefined): AskUserQuestionInput[] {
  if (!Array.isArray(input?.questions)) return [];
  return input.questions.flatMap((q) => {
    if (typeof q !== "object" || q === null) return [];
    const question = (q as { question?: unknown }).question;
    if (typeof question !== "string" || !question.trim()) return [];
    const hint = (q as { hint?: unknown }).hint;
    return [{ question, hint: typeof hint === "string" ? hint : undefined }];
  });
}

function appliedEditsFromParts(
  parts: UIMessage["parts"] | undefined
): Array<{ section: string; targetField: string; reasoning: string }> {
  const items: Array<{ section: string; targetField: string; reasoning: string }> =
    [];
  for (const part of parts ?? []) {
    const tool = readToolPart(part as UIMessagePart<never, never>);
    if (!tool?.output) continue;
    const status = tool.output.status;
    if (status !== "applied") continue;
    const section =
      typeof tool.output.section === "string" ? tool.output.section : "";
    const targetField =
      typeof tool.output.targetField === "string" ? tool.output.targetField : "";
    const reasoning =
      typeof tool.output.summary === "string" ? tool.output.summary : "";
    if (!section) continue;
    items.push({ section, targetField, reasoning });
  }
  return items;
}

/** Document proposals and Agent commits — refresh report state as soon as a card exists. */
function persistedEditCountFromParts(
  parts: UIMessage["parts"] | undefined
): number {
  let count = 0;
  for (const part of parts ?? []) {
    const tool = readToolPart(part as UIMessagePart<never, never>);
    if (!tool?.output) continue;
    const status = tool.output.status;
    if (status === "applied" || status === "proposed" || status === "drafted") {
      count += 1;
    }
  }
  return count;
}

function ToolChip({
  info,
  askUserActive,
  onAnswerQuestions,
}: {
  info: ToolPartInfo;
  askUserActive?: boolean;
  onAnswerQuestions?: (message: string) => void;
}) {
  const pending = info.state === "input-streaming" || info.state === "input-available";

  if (isDocumentReviewToolName(info.toolName)) return null;

  if (info.toolName === "read_section") {
    const section = sectionLabel(info.input?.section);
    return (
      <ToolLine icon={<BookOpen className="size-3.5" />}>
        {pending ? "Reading" : "Read"} {section || "section"}
      </ToolLine>
    );
  }

  if (info.toolName === "propose_edit") {
    const section = sectionLabel(info.input?.section);
    const field = typeof info.input?.targetField === "string" ? info.input.targetField : "";
    if (pending) {
      return (
        <ToolLine icon={<PencilLine className="size-3.5" />}>
          Proposing edit to {section}…
        </ToolLine>
      );
    }
    const status = info.output?.status;
    if (status === "applied") {
      return (
        <ToolLine icon={<PencilLine className="size-3.5 text-emerald-500" />} tone="success">
          Applied to {section}
          {field ? ` · ${field}` : ""}
        </ToolLine>
      );
    }
    if (status === "proposed") {
      return (
        <ToolLine icon={<PencilLine className="size-3.5 text-emerald-500" />} tone="success">
          Proposed edit to {section}
          {field ? ` · ${field}` : ""} — review it in the document.{replacedOlderSuffix(info.output)}
        </ToolLine>
      );
    }
    const hint =
      typeof info.output?.hint === "string"
        ? info.output.hint
        : typeof info.output?.message === "string"
          ? info.output.message
          : info.errorText
            ? info.errorText
            : "Could not place this edit.";
    return (
      <ToolLine icon={<PencilLine className="size-3.5 text-amber-500" />} tone="warn">
        Edit not applied: {hint}
      </ToolLine>
    );
  }

  if (info.toolName === "insert_image") {
    const section = sectionLabel(info.input?.section);
    const field = typeof info.input?.targetField === "string" ? info.input.targetField : "";
    if (pending) {
      return (
        <ToolLine icon={<ImagePlus className="size-3.5" />}>
          Inserting image in {section}…
        </ToolLine>
      );
    }
    if (info.output?.status === "applied") {
      return (
        <ToolLine icon={<ImagePlus className="size-3.5 text-emerald-500" />} tone="success">
          Applied image in {section}
          {field ? ` · ${field}` : ""}
        </ToolLine>
      );
    }
    if (info.output?.status === "proposed") {
      return (
        <ToolLine icon={<ImagePlus className="size-3.5 text-emerald-500" />} tone="success">
          Proposed image in {section}
          {field ? ` · ${field}` : ""} — review it in the document.{replacedOlderSuffix(info.output)}
        </ToolLine>
      );
    }
    if (info.output?.status === "available_plots") {
      return (
        <ToolLine icon={<ImagePlus className="size-3.5" />}>
          No figure was inserted — listing available Analytics plots.
        </ToolLine>
      );
    }
    const hint =
      typeof info.output?.hint === "string"
        ? info.output.hint
        : typeof info.output?.message === "string"
          ? info.output.message
          : info.errorText
            ? info.errorText
            : "Could not place this image.";
    return (
      <ToolLine icon={<ImagePlus className="size-3.5 text-amber-500" />} tone="warn">
        Image not inserted: {hint}
      </ToolLine>
    );
  }

  if (info.toolName === "remove_image") {
    const section = sectionLabel(info.input?.section);
    const field = typeof info.input?.targetField === "string" ? info.input.targetField : "";
    if (pending) {
      return (
        <ToolLine icon={<ImageMinus className="size-3.5" />}>
          Removing image in {section}…
        </ToolLine>
      );
    }
    if (info.output?.status === "applied") {
      return (
        <ToolLine icon={<ImageMinus className="size-3.5 text-emerald-500" />} tone="success">
          Removed figure in {section}
          {field ? ` · ${field}` : ""}
        </ToolLine>
      );
    }
    if (info.output?.status === "proposed") {
      return (
        <ToolLine icon={<ImageMinus className="size-3.5 text-emerald-500" />} tone="success">
          Proposed figure removal in {section}
          {field ? ` · ${field}` : ""} — review it in the document.{replacedOlderSuffix(info.output)}
        </ToolLine>
      );
    }
    const hint =
      typeof info.output?.hint === "string"
        ? info.output.hint
        : typeof info.output?.message === "string"
          ? info.output.message
          : info.errorText
            ? info.errorText
            : "Could not remove this image.";
    return (
      <ToolLine icon={<ImageMinus className="size-3.5 text-amber-500" />} tone="warn">
        Image not removed: {hint}
      </ToolLine>
    );
  }

  if (info.toolName === "edit_table") {
    const section = sectionLabel(info.input?.section);
    const field = typeof info.input?.targetField === "string" ? info.input.targetField : "";
    if (pending) {
      return (
        <ToolLine icon={<Table2 className="size-3.5" />}>
          Editing table in {section}…
        </ToolLine>
      );
    }
    if (info.output?.status === "applied") {
      return (
        <ToolLine icon={<Table2 className="size-3.5 text-emerald-500" />} tone="success">
          Applied table edit to {section}
          {field ? ` · ${field}` : ""}
        </ToolLine>
      );
    }
    if (info.output?.status === "proposed") {
      return (
        <ToolLine icon={<Table2 className="size-3.5 text-emerald-500" />} tone="success">
          Proposed table edit to {section}
          {field ? ` · ${field}` : ""} — review it in the document.{replacedOlderSuffix(info.output)}
        </ToolLine>
      );
    }
    const hint =
      typeof info.output?.hint === "string"
        ? info.output.hint
        : typeof info.output?.message === "string"
          ? info.output.message
          : info.errorText
            ? info.errorText
            : "Could not place this table edit.";
    return (
      <ToolLine icon={<Table2 className="size-3.5 text-amber-500" />} tone="warn">
        Table edit not applied: {hint}
      </ToolLine>
    );
  }

  if (info.toolName === "draft_field") {
    const section = sectionLabel(info.input?.section);
    const field = typeof info.input?.targetField === "string" ? info.input.targetField : "";
    if (pending) {
      return (
        <ToolLine icon={<FileText className="size-3.5" />}>
          Drafting {section}
          {field ? ` · ${field}` : ""}…
        </ToolLine>
      );
    }
    if (info.output?.status === "applied") {
      return (
        <ToolLine icon={<FileText className="size-3.5 text-emerald-500" />} tone="success">
          Applied draft to {section}
          {field ? ` · ${field}` : ""}
        </ToolLine>
      );
    }
    if (info.output?.status === "drafted") {
      return (
        <ToolLine icon={<FileText className="size-3.5 text-emerald-500" />} tone="success">
          Drafted {section}
          {field ? ` · ${field}` : ""} — review the full draft in the document.{replacedOlderSuffix(info.output)}
        </ToolLine>
      );
    }
    if (info.output?.status === "not_a_rewrite") {
      return (
        <ToolLine icon={<FileText className="size-3.5" />}>
          Switching to a targeted edit on {section}
          {field ? ` · ${field}` : ""}…
        </ToolLine>
      );
    }
    const message =
      typeof info.output?.message === "string"
        ? info.output.message
        : typeof info.output?.hint === "string"
          ? info.output.hint
          : info.errorText
            ? info.errorText
            : "Could not create this draft.";
    return (
      <ToolLine icon={<FileText className="size-3.5 text-amber-500" />} tone="warn">
        Draft not created: {message}
      </ToolLine>
    );
  }

  if (info.toolName === "ask_user") {
    const questions = parseAskUserQuestions(info.input);
    if (questions.length === 0) return null;
    return (
      <AskUserForm
        questions={questions}
        disabled={!askUserActive || !onAnswerQuestions}
        onSubmit={(message) => onAnswerQuestions?.(message)}
      />
    );
  }

  const analyticsChip = AnalyticsChatToolChip({ info });
  if (analyticsChip) return analyticsChip;

  return <ToolLine icon={<Wrench className="size-3.5" />}>{info.toolName}</ToolLine>;
}

function ToolLine({
  icon,
  tone = "muted",
  children,
}: {
  icon: React.ReactNode;
  tone?: "muted" | "success" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "warn" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "muted" &&
          "border-[var(--border)] bg-[var(--secondary)]/40 text-[var(--muted-foreground)]"
      )}
    >
      {icon}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function mentionIcon(type: MentionCandidate["type"]) {
  switch (type) {
    case "document":
      return FileText;
    case "sheet":
      return Table2;
    case "analysis":
      return LineChart;
    default:
      return ClipboardList;
  }
}

function MentionChips({
  mentions,
  onRemove,
}: {
  mentions: MentionCandidate[];
  onRemove: (candidate: MentionCandidate) => void;
}) {
  if (mentions.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {mentions.map((mention) => {
        const Icon = mentionIcon(mention.type);
        return (
          <span
            key={mentionKey(mention.type, mention.id)}
            className="flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--secondary)]/50 py-0.5 pl-2 pr-1 text-[11px]"
          >
            <Icon className="size-3 shrink-0 text-[var(--primary)]" aria-hidden="true" />
            <span
              className={cn(
                "max-w-40 truncate",
                mention.type === "document" && "font-mono tracking-tight"
              )}
              title={mention.label}
            >
              {mention.label}
            </span>
            <button
              type="button"
              onClick={() => onRemove(mention)}
              aria-label={`Remove ${mention.label} tag`}
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

function MentionMenu({
  matches,
  activeIndex,
  onSelect,
}: {
  matches: MentionCandidate[];
  activeIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
}) {
  return (
    <div
      id="chat-mention-menu"
      role="listbox"
      aria-label="Tag a document or section"
      className="absolute bottom-full left-0 z-50 mb-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl"
    >
      {matches.map((candidate, index) => {
        const Icon = mentionIcon(candidate.type);
        return (
          <button
            key={mentionKey(candidate.type, candidate.id)}
            id={`chat-mention-option-${index}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            // Keep focus in the textarea so the caret position stays valid.
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(candidate);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--secondary)]",
              index === activeIndex && "bg-[var(--secondary)]"
            )}
          >
            <Icon
              className="size-3.5 shrink-0 text-[var(--primary)]"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{candidate.label}</span>
              {candidate.sublabel ? (
                <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                  {candidate.sublabel}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              {candidate.type}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const MessageTurn = memo(function MessageTurn({
  message,
  chatTarget,
  askUserActive,
  onAnswerQuestions,
  streaming = false,
}: {
  message: UIMessage;
  chatTarget: ChatMessageTarget | null;
  askUserActive?: boolean;
  onAnswerQuestions?: (message: string) => void;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const targetLabel = chatTarget ? chatMessageTargetLabel(chatTarget) : null;

  if (isUser) {
    const parts = message.parts ?? [];
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    const images = parts.filter(
      (p): p is FileUIPart => isFileUIPart(p) && p.mediaType.startsWith("image/")
    );
    if (!text && images.length === 0) return null;
    return (
      <div
        className="flex justify-end"
        aria-label={
          targetLabel ? `Your message · ${targetLabel}` : "Your message"
        }
      >
        <div className="flex max-w-[92%] flex-col items-end gap-1">
          <ChatMessageTargetTag target={chatTarget} />
          <div className="space-y-2 rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-sm text-[var(--primary-foreground)]">
            {images.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {images.map((image, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- chat data-URL previews
                  <img
                    key={`${image.filename ?? "image"}-${i}`}
                    src={image.url}
                    alt={image.filename ?? "Attached image"}
                    className="max-h-40 max-w-full rounded-md border border-white/20 object-contain"
                  />
                ))}
              </div>
            ) : null}
            {text ? <div className="whitespace-pre-wrap">{text}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  // Assistant turn: full-width, no bubble (Cursor-style), tool chips inline.
  const parts = message.parts ?? [];
  const showEmptyError = shouldShowEmptyAssistantError({
    parts,
    streaming,
  });
  return (
    <div
      className="flex flex-col gap-2"
      aria-label={
        targetLabel ? `Assistant message · ${targetLabel}` : "Assistant message"
      }
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
        <Sparkles className="size-3 text-[var(--primary)]" />
        Assistant
        {targetLabel ? (
          <>
            <span aria-hidden="true">·</span>
            <ChatMessageTargetTag target={chatTarget} />
          </>
        ) : null}
      </div>
      {showEmptyError ? (
        <p className="text-sm text-red-600">{CHAT_ASSISTANT_ERROR_MESSAGE}</p>
      ) : (
        (() => {
          const shownInsertImage: InsertImageChipInfo[] = [];
          return groupAssistantParts(parts).map((group, i) => {
            if (group.kind === "text") {
              if (!group.text.trim()) return null;
              return <ChatMarkdown key={i}>{group.text}</ChatMarkdown>;
            }
            if (group.kind === "document-review") {
              return <DocumentReviewProgress key={i} parts={group.parts} />;
            }
            const tool = readToolPart(group.part as UIMessagePart<never, never>);
            if (!tool) return null;
            if (isRedundantInsertImageChip(shownInsertImage, tool)) {
              shownInsertImage.push(tool);
              return null;
            }
            shownInsertImage.push(tool);
            return (
              <ToolChip
                key={i}
                info={tool}
                askUserActive={askUserActive}
                onAnswerQuestions={onAnswerQuestions}
              />
            );
          });
        })()
      )}
      <TurnChangeSummary
        parts={parts}
        metadata={
          "metadata" in message
            ? (message as { metadata?: unknown }).metadata
            : undefined
        }
      />
    </div>
  );
});

function TurnChangeSummary({
  parts,
  metadata,
}: {
  parts: UIMessage["parts"];
  metadata: unknown;
}) {
  const items = appliedEditsFromParts(parts);
  if (items.length === 0) return null;
  const revisionNo =
    metadata &&
    typeof metadata === "object" &&
    "changeSummary" in metadata &&
    metadata.changeSummary &&
    typeof metadata.changeSummary === "object" &&
    "revisionNo" in metadata.changeSummary &&
    typeof metadata.changeSummary.revisionNo === "number"
      ? metadata.changeSummary.revisionNo
      : null;
  return (
    <div
      data-testid="chat-change-summary"
      className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 px-3 py-2"
    >
      <p className="text-[11px] font-semibold text-[var(--foreground)]">
        Changes this turn
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted-foreground)]">
        {items.map((item, i) => (
          <li key={`${item.section}-${item.targetField}-${i}`}>
            {sectionLabel(item.section)}
            {item.targetField ? ` · ${item.targetField}` : ""}
            {item.reasoning ? ` — ${item.reasoning}` : ""}
          </li>
        ))}
      </ul>
      {revisionNo != null ? (
        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          Saved as version {revisionNo}
        </p>
      ) : null}
    </div>
  );
}

function emptyChatIntro(args: {
  targetingAnalytics: boolean;
  mode: ChatMode;
  workspaceChrome: WorkspaceChrome;
  documentType: DocumentType;
}): string {
  if (args.targetingAnalytics) {
    if (args.mode === "plan") {
      return "I read this report's attachments and the worksheet. I don't fill columns or run plots in Ask mode — switch to Agent for that. I don't draft the document. Type @ to tag a sheet, plot, or file.";
    }
    return "I fill the worksheet, run a sixpack or one-way ANOVA, and plot a worksheet scatter (Y required, X optional, optional legend to color by group) or a measurement scatter from attachments (one series vs index). Serial numbers cannot be X — use them as the legend. I don't draft the document. Type @ to tag a sheet, plot, or file.";
  }
  return documentEmptyChatIntro({
    mode: args.mode,
    workspaceChrome: args.workspaceChrome,
    documentType: args.documentType,
  });
}

function composerPlaceholder(args: {
  targetingAnalytics: boolean;
  mode: ChatMode;
  statsEnabled: boolean;
}): string {
  if (args.targetingAnalytics) {
    return args.mode === "plan"
      ? "Ask about measurements in the attachments… type @ to tag a sheet or plot"
      : "Extract numbers, run a sixpack or ANOVA, or plot… type @ to tag a sheet or plot";
  }
  const tags = args.statsEnabled
    ? "a document, section, or plot"
    : "a document or section";
  if (args.mode === "plan") {
    return `Ask about the report or attachments… type @ to tag ${tags}`;
  }
  return `Ask the assistant to draft or improve a section… type @ to tag ${tags}`;
}

function subscribeNoop() {
  return () => {};
}

export function ChatPanel({
  workspaceChrome = "agent",
  statsEnabled = false,
  visible = true,
  onWorksheetChanged,
  onAgentBusyChange,
  onAnalyticsFocusSheet,
  onAnalyticsFocusAnalysis,
  analyticsReloadEpoch = 0,
  mentionSheets = [],
}: {
  workspaceChrome?: WorkspaceChrome;
  statsEnabled?: boolean;
  /** False while the sidebar is collapsed or another tab is showing. */
  visible?: boolean;
  onWorksheetChanged?: () => void;
  onAgentBusyChange?: (busy: boolean) => void;
  onAnalyticsFocusSheet?: (sheetId: string) => void;
  onAnalyticsFocusAnalysis?: (analysisId: string) => void;
  analyticsReloadEpoch?: number;
  mentionSheets?: AnalyticsMentionSheet[];
}) {
  const {
    report,
    refresh,
    readOnly,
    currentUserId,
    flushPendingSectionSaves,
    setAgentCommitInFlight,
  } = useReportData();
  const { getUser } = useUserDirectory();
  const user = getUser(currentUserId);
  const role = user?.role;
  const accessUser =
    role != null && user
      ? { id: currentUserId, role, email: user.email }
      : null;
  const canProposeAiEdits =
    accessUser != null && canSaveReportSection(accessUser, report);
  const editLockReason =
    accessUser != null
      ? aiSuggestionLockReason(accessUser, report)
      : "You can't propose edits on this report right now.";
  const { attachments } = useReportAttachments();
  const [input, setInput] = useState("");
  const inputRef = useRef(input);
  inputRef.current = input;
  const showUploadingNotice = useDocumentUploadingNotice(input);
  const [mentions, setMentions] = useState<MentionCandidate[]>([]);
  const [mentionRange, setMentionRange] = useState<MentionQuery | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [analyticsSnapshot, setAnalyticsSnapshot] =
    useState<ReportAnalyticsView | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const [attaching, setAttaching] = useState(false);
  const storedComposerPrefs = useSyncExternalStore(
    subscribeChatComposerPrefs,
    () =>
      currentUserId
        ? readChatComposerPrefs(currentUserId, report.id)
        : DEFAULT_CHAT_COMPOSER_PREFS,
    () => DEFAULT_CHAT_COMPOSER_PREFS
  );
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const composerPrefsReady = isClient && currentUserId != null;
  const composerChatTarget: WorkProductView =
    storedComposerPrefs.chatTarget ?? "report";
  const chatTarget = chatWorkProductTarget({
    agentTarget: composerChatTarget,
    statsEnabled,
  });
  const targetingAnalytics = chatTarget === "analytics";
  useEffect(() => {
    if (!statsEnabled) return;
    let cancelled = false;
    void getReportAnalytics(report.id)
      .then((snapshot) => {
        if (!cancelled) setAnalyticsSnapshot(snapshot);
      })
      .catch(() => {
        if (!cancelled) setAnalyticsSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [analyticsReloadEpoch, report.id, statsEnabled]);
  const modeOptions = useMemo(() => {
    const source = targetingAnalytics
      ? ANALYTICS_CHAT_MODE_OPTIONS
      : DOCUMENT_CHAT_MODE_OPTIONS;
    return source.map((option) =>
      option.value === "agent" && !canProposeAiEdits
        ? {
            ...option,
            disabled: true,
            description: editLockReason ?? option.description,
          }
        : option
    );
  }, [canProposeAiEdits, editLockReason, targetingAnalytics]);
  const mode =
    role != null && !canProposeAiEdits && storedComposerPrefs.mode === "agent"
      ? "plan"
      : storedComposerPrefs.mode;
  const pace = storedComposerPrefs.pace;
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [mountedSessions, setMountedSessions] = useState<MountedChatSession[]>(
    []
  );
  const [backgroundSessionIds, setBackgroundSessionIds] = useState<string[]>([]);
  const [tabSnapshots, setTabSnapshots] = useState<
    Record<string, SessionTabSnapshot>
  >({});
  const [runtime, setRuntime] = useState<ChatSessionRuntime>(IDLE_CHAT_RUNTIME);
  const [sessionsReportId, setSessionsReportId] = useState(report.id);
  if (sessionsReportId !== report.id) {
    setSessionsReportId(report.id);
    setMountedSessions([]);
    setBackgroundSessionIds([]);
    setTabSnapshots({});
    setRuntime(IDLE_CHAT_RUNTIME);
  }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const sessionWindowKey = `${report.id}:${currentSessionId ?? ""}`;
  const [windowedSessionKey, setWindowedSessionKey] = useState(sessionWindowKey);
  const [visibleCount, setVisibleCount] = useState(CHAT_VISIBLE_TAIL);
  if (windowedSessionKey !== sessionWindowKey) {
    setWindowedSessionKey(sessionWindowKey);
    setVisibleCount(CHAT_VISIBLE_TAIL);
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const olderScrollRestoreRef = useRef<{ height: number; top: number } | null>(
    null
  );
  const savedScrollRef = useRef<ChatScrollPosition | null>(null);
  const savedScrollSessionKeyRef = useRef(sessionWindowKey);
  const visibleRef = useRef(visible);
  const restoringScrollRef = useRef(false);
  visibleRef.current = visible;
  if (savedScrollSessionKeyRef.current !== sessionWindowKey) {
    savedScrollSessionKeyRef.current = sessionWindowKey;
    savedScrollRef.current = null;
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const runtimeBySessionRef = useRef(new Map<string, ChatSessionRuntime>());
  const lastSendTargetRef = useRef<WorkProductView>("report");
  const [lastSendTarget, setLastSendTarget] = useState<WorkProductView>("report");
  const seenWriteIdsRef = useRef(new Set<string>());

  const base = `/api/reports/${report.id}/chat`;
  const {
    messages,
    status,
    error,
    stopTurn,
    streamBusy,
    backgroundTurn,
    busy,
    elapsedMs,
    silentMs,
  } = runtime;
  const hostReady = runtime !== IDLE_CHAT_RUNTIME;
  const voice = useVoiceDictation({
    reportId: report.id,
    getPrefix: () => inputRef.current,
    onComposerValue: setInput,
    disabled: busy || initializing || attaching || !hostReady,
  });
  const voiceLock = voice.recording || voice.status === "requesting";
  const watchdog = chatWatchdogPhase({
    busy: streamBusy,
    elapsedMs,
    silentMs,
  });
  const runningSessionIds = runningChatSessionIds(
    backgroundSessionIds,
    currentSessionId,
    busy
  );

  const persistedEditCount = useMemo(
    () =>
      messages.reduce(
        (sum, message) => sum + persistedEditCountFromParts(message.parts),
        0
      ),
    [messages]
  );
  const persistedEditCountRef = useRef(0);
  useEffect(() => {
    if (!busy) {
      setAgentCommitInFlight(false);
    }
  }, [busy, setAgentCommitInFlight]);
  useEffect(() => {
    onAgentBusyChange?.(busy && lastSendTargetRef.current === "analytics");
  }, [busy, onAgentBusyChange]);
  useEffect(() => {
    return () => onAgentBusyChange?.(false);
  }, [onAgentBusyChange]);
  useEffect(() => {
    if (!onWorksheetChanged) return;
    let found = false;
    for (const message of messages) {
      for (const part of message.parts ?? []) {
        const info = readToolPart(part as UIMessagePart<never, never>);
        if (!info || info.state !== "output-available") continue;
        if (!isAnalyticsWorksheetMutationTool(info.toolName)) continue;
        const id = info.toolCallId ?? `${info.toolName}:${JSON.stringify(info.output)}`;
        if (seenWriteIdsRef.current.has(id)) continue;
        seenWriteIdsRef.current.add(id);
        found = true;
      }
    }
    if (found) onWorksheetChanged();
  }, [messages, onWorksheetChanged]);
  useEffect(() => {
    if (persistedEditCount <= persistedEditCountRef.current) {
      persistedEditCountRef.current = persistedEditCount;
      return;
    }
    persistedEditCountRef.current = persistedEditCount;
    void refresh();
  }, [persistedEditCount, refresh]);

  // Only ready documents are taggable — an attachment still being ingested has
  // no chunks, so scoping search to it would return nothing.
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const documents = attachments
      .filter((attachment) => attachment.processingStatus === "ready")
      .map((attachment) => {
        const description = attachment.description?.trim();
        const pages =
          typeof attachment.pageCount === "number" && attachment.pageCount > 0
            ? `${attachment.pageCount} page${attachment.pageCount === 1 ? "" : "s"}`
            : undefined;
        return {
          type: "document" as const,
          id: attachment.id,
          label: attachment.filename,
          sublabel: description || pages,
        };
      });
    if (targetingAnalytics) {
      const sheets =
        mentionSheets.length > 0
          ? analyticsSheetMentionCandidates(mentionSheets)
          : analyticsSnapshot
            ? analyticsSheetMentionCandidates(
                dataSheets(analyticsSnapshot.worksheet).map((sheet) => ({
                  sheetId: sheet.id,
                  name: sheet.name,
                  columnCount: sheet.columns.length,
                }))
              )
            : [];
      const analyses = (analyticsSnapshot?.analyses ?? []).map((item) => ({
        type: "analysis" as const,
        id: item.id,
        label: item.title,
        sublabel: analysisListSubtitle(item),
      }));
      return [...sheets, ...analyses, ...documents];
    }
    const sections = chatEditableSections(report.documentType).map((section) => ({
      type: "section" as const,
      id: section,
      label: sectionLabel(section),
    }));
    const analyses = statsEnabled
      ? listGraphAnalyses(analyticsSnapshot?.analyses ?? []).map((item) => ({
          type: "analysis" as const,
          id: item.id,
          label: item.title,
          sublabel: analysisListSubtitle(item),
        }))
      : [];
    return [...documents, ...sections, ...analyses];
  }, [
    analyticsSnapshot,
    attachments,
    mentionSheets,
    report.documentType,
    statsEnabled,
    targetingAnalytics,
  ]);
  const labeledMentions = syncMentionCandidateLabels(
    mentions,
    mentionCandidates
  );
  if (labeledMentions !== mentions) {
    setMentions(labeledMentions);
  }

  const mentionMatches = mentionRange
    ? filterMentionCandidates(mentionCandidates, mentionRange.query)
    : [];
  const mentionMenuOpen = mentionMatches.length > 0;
  const activeMentionIndex = Math.min(
    mentionIndex,
    Math.max(mentionMatches.length - 1, 0)
  );

  const persistComposerPrefs = useCallback(
    (next: {
      mode: ChatMode;
      pace: ChatPace;
      chatTarget?: WorkProductView;
    }) => {
      if (!currentUserId) return;
      writeChatComposerPrefs(currentUserId, report.id, {
        mode: next.mode,
        pace: next.pace,
        ...(next.chatTarget
          ? { chatTarget: next.chatTarget }
          : storedComposerPrefs.chatTarget
            ? { chatTarget: storedComposerPrefs.chatTarget }
            : {}),
      });
    },
    [currentUserId, report.id, storedComposerPrefs.chatTarget]
  );

  const setMode = useCallback(
    (next: ChatMode) => {
      if (!isChatMode(next)) return;
      persistComposerPrefs({ mode: next, pace: storedComposerPrefs.pace });
    },
    [persistComposerPrefs, storedComposerPrefs.pace]
  );

  const setPace = useCallback(
    (next: ChatPace) => {
      if (!isChatPace(next)) return;
      persistComposerPrefs({ mode: storedComposerPrefs.mode, pace: next });
    },
    [persistComposerPrefs, storedComposerPrefs.mode]
  );

  const setComposerChatTarget = useCallback(
    (next: WorkProductView) => {
      if (!isWorkProductView(next)) return;
      persistComposerPrefs({
        mode: storedComposerPrefs.mode,
        pace: storedComposerPrefs.pace,
        chatTarget: next,
      });
    },
    [persistComposerPrefs, storedComposerPrefs.mode, storedComposerPrefs.pace]
  );

  const applyMentionFocus = useCallback(
    (candidate: MentionCandidate) => {
      if (candidate.type === "sheet") onAnalyticsFocusSheet?.(candidate.id);
      if (candidate.type === "analysis") onAnalyticsFocusAnalysis?.(candidate.id);
    },
    [onAnalyticsFocusAnalysis, onAnalyticsFocusSheet]
  );

  // Restore the caret after a mention replaces the in-progress @ token.
  useEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret == null) return;
    pendingCaretRef.current = null;
    const element = textareaRef.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(caret, caret);
  }, [input]);

  const updateMentionQuery = useCallback((value: string, caret: number) => {
    setMentionRange(findMentionQuery(value, caret));
    setMentionIndex(0);
  }, []);

  const selectMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionRange) return;
      applyMentionFocus(candidate);
      setInput((current) => {
        const next = applyMentionToInput(current, mentionRange, candidate);
        pendingCaretRef.current = next.caret;
        return next.text;
      });
      setMentions((prev) =>
        prev.some(
          (mention) =>
            mentionKey(mention.type, mention.id) ===
            mentionKey(candidate.type, candidate.id)
        )
          ? prev
          : [...prev, candidate]
      );
      setMentionRange(null);
      setMentionIndex(0);
    },
    [applyMentionFocus, mentionRange]
  );

  const removeMention = useCallback((candidate: MentionCandidate) => {
    setMentions((prev) =>
      prev.filter(
        (mention) =>
          mentionKey(mention.type, mention.id) !==
          mentionKey(candidate.type, candidate.id)
      )
    );
  }, []);

  const loadSessions = useCallback(async (): Promise<ChatSessionSummary[]> => {
    try {
      const res = await fetch(`${base}/sessions`);
      if (!res.ok) return [];
      const data = (await res.json()) as { sessions?: ChatSessionSummary[] };
      const next = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(next);
      return next;
    } catch {
      return [];
    }
  }, [base]);

  const onFinishTurn = useCallback(() => {
    setAgentCommitInFlight(false);
    // Pull newly-proposed ai_fix comments (document chrome) or committed
    // section content (agent chrome) into report state.
    void refresh();
    void loadSessions();
    if (lastSendTargetRef.current === "analytics") {
      onWorksheetChanged?.();
    }
  }, [loadSessions, onWorksheetChanged, refresh, setAgentCommitInFlight]);

  const onTurnCompleted = useCallback(
    (startedAt: number | null) => {
      announceCompletedAssistantTurn(startedAt, {
        currentUserId,
        documentNo: report.documentNo,
        documentType: report.documentType,
      });
    },
    [currentUserId, report.documentNo, report.documentType]
  );

  const mountSession = useCallback((sessionId: string, hydrateOnMount: boolean) => {
    setMountedSessions((prev) =>
      rememberMountedSession(prev, sessionId, hydrateOnMount)
    );
  }, []);

  const openSession = useCallback(
    (sessionId: string) => {
      if (sessionId !== currentSessionId && currentSessionId && busy) {
        setBackgroundSessionIds((prev) =>
          rememberBackgroundSession(prev, currentSessionId)
        );
      }
      currentSessionIdRef.current = sessionId;
      mountSession(sessionId, true);
      setRuntime(runtimeBySessionRef.current.get(sessionId) ?? IDLE_CHAT_RUNTIME);
      setCurrentSessionId(sessionId);
      setHistoryOpen(false);
    },
    [busy, currentSessionId, mountSession]
  );

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${base}/sessions`, { method: "POST" });
      if (!res.ok) return null;
      const data = (await res.json()) as { session: ChatSessionSummary };
      setSessions((prev) => [data.session, ...prev]);
      return data.session.id;
    } catch {
      return null;
    }
  }, [base]);

  const startBlankChat = useCallback(async () => {
    setHistoryOpen(false);
    const id = await createSession();
    if (!id) {
      toast.error("Could not start a new chat.");
      return;
    }
    currentSessionIdRef.current = id;
    mountSession(id, false);
    setRuntime(IDLE_CHAT_RUNTIME);
    setCurrentSessionId(id);
    setInput("");
    setPendingImages([]);
    setMentions([]);
    setMentionRange(null);
  }, [createSession, mountSession]);

  const newChat = useCallback(async () => {
    if (currentSessionId && busy) {
      setBackgroundSessionIds((prev) =>
        rememberBackgroundSession(prev, currentSessionId)
      );
    }
    await startBlankChat();
  }, [busy, currentSessionId, startBlankChat]);

  const closeChatTab = useCallback(
    (sessionId: string) => {
      const mountedIds = mountedSessions.map((session) => session.id);
      const closingCurrent = currentSessionId === sessionId;
      const nextId = closingCurrent
        ? nextMountedSessionId(mountedIds, sessionId)
        : null;

      setMountedSessions((prev) => forgetMountedSession(prev, sessionId));
      setBackgroundSessionIds((prev) => dropBackgroundSession(prev, sessionId));
      setTabSnapshots((prev) => {
        if (!(sessionId in prev)) return prev;
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      runtimeBySessionRef.current.delete(sessionId);

      if (!closingCurrent) return;

      if (nextId) {
        currentSessionIdRef.current = nextId;
        setRuntime(
          runtimeBySessionRef.current.get(nextId) ?? IDLE_CHAT_RUNTIME
        );
        setCurrentSessionId(nextId);
        return;
      }

      currentSessionIdRef.current = null;
      setCurrentSessionId(null);
      setRuntime(IDLE_CHAT_RUNTIME);
      void startBlankChat();
    },
    [currentSessionId, mountedSessions, startBlankChat]
  );

  const onSessionSettled = useCallback((sessionId: string) => {
    setBackgroundSessionIds((prev) => dropBackgroundSession(prev, sessionId));
  }, []);

  const onSessionRuntime = useCallback(
    (sessionId: string, next: ChatSessionRuntime) => {
      runtimeBySessionRef.current.set(sessionId, next);
      const snapshot = chatSessionTabSnapshot(
        next.status,
        next.messages,
        next.backgroundTurn
      );
      setTabSnapshots((prev) => {
        if (sessionTabSnapshotsEqual(prev[sessionId], snapshot)) return prev;
        return { ...prev, [sessionId]: snapshot };
      });
      if (sessionId !== currentSessionIdRef.current) return;
      setRuntime(next);
    },
    []
  );

  const visibleStartIndex = visibleMessageStartIndex(
    messages.length,
    visibleCount
  );
  const taggedMessages = useMemo(
    () =>
      tagChatMessages(messages, {
        inFlightTarget: busy ? lastSendTarget : null,
      }),
    [busy, lastSendTarget, messages]
  );
  const visibleMessages = taggedMessages.slice(visibleStartIndex);
  const hiddenCount = visibleStartIndex;

  const loadOlderMessages = useCallback(() => {
    if (loadingOlderRef.current) return;
    if (visibleCount >= messages.length) return;
    const el = scrollRef.current;
    if (el) {
      olderScrollRestoreRef.current = {
        height: el.scrollHeight,
        top: el.scrollTop,
      };
    }
    loadingOlderRef.current = true;
    setVisibleCount((current) => nextVisibleCount(current, messages.length));
  }, [messages.length, visibleCount]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const restore = olderScrollRestoreRef.current;
    if (el && restore != null) {
      olderScrollRestoreRef.current = null;
      el.scrollTop = el.scrollHeight - restore.height + restore.top;
      const captured = captureChatScrollPosition(el);
      if (captured != null) savedScrollRef.current = captured;
    }
    loadingOlderRef.current = false;
  }, [visibleCount]);

  const captureVisibleScroll = useCallback(() => {
    if (!visibleRef.current || restoringScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const captured = captureChatScrollPosition(el);
    if (captured != null) savedScrollRef.current = captured;
  }, []);

  const onMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!visibleRef.current || restoringScrollRef.current) return;
    captureVisibleScroll();
    if (
      shouldLoadOlderMessages(el.scrollTop, visibleCount, messages.length)
    ) {
      loadOlderMessages();
    }
  }, [captureVisibleScroll, loadOlderMessages, messages.length, visibleCount]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Initialize: load sessions, open the most recent or create the first.
  useEffect(() => {
    let cancelled = false;
    runtimeBySessionRef.current = new Map();
    void (async () => {
      const existing = await loadSessions();
      if (cancelled) return;
      if (existing.length > 0) {
        await openSession(existing[0]!.id);
      } else {
        const id = await createSession();
        if (!cancelled && id) {
          currentSessionIdRef.current = id;
          mountSession(id, false);
          setCurrentSessionId(id);
        }
      }
      if (!cancelled) setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!visible) {
      restoringScrollRef.current = true;
      return;
    }
    if (!el) return;
    restoringScrollRef.current = true;
    restoreChatScrollPosition(el, savedScrollRef.current);
    // Cover the sidebar width transition so intermediate reflows cannot
    // overwrite the saved offset as "bottom".
    const timeout = window.setTimeout(() => {
      restoringScrollRef.current = false;
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [visible]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!visibleRef.current || !el || !isChatScrollerLaidOut(el)) return;
    if (!shouldStickChatToBottom(savedScrollRef.current)) return;
    pinChatScrollerToBottom(el);
    savedScrollRef.current = { kind: "bottom" };
  }, [messages, status]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let wasLaidOut = isChatScrollerLaidOut(el);
    let previousWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (!visibleRef.current) {
        wasLaidOut = false;
        previousWidth = 0;
        return;
      }
      const nowLaidOut = isChatScrollerLaidOut(el);
      const currentWidth = el.clientWidth;
      if (
        shouldReapplyChatScroll({
          wasLaidOut,
          nowLaidOut,
          previousWidth,
          currentWidth,
        })
      ) {
        restoringScrollRef.current = true;
        restoreChatScrollPosition(el, savedScrollRef.current);
        restoringScrollRef.current = false;
      } else if (
        nowLaidOut &&
        shouldStickChatToBottom(savedScrollRef.current)
      ) {
        pinChatScrollerToBottom(el);
      }
      wasLaidOut = nowLaidOut;
      previousWidth = currentWidth;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Close history dropdown on outside click.
  useEffect(() => {
    if (!historyOpen) return;
    const onClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [historyOpen]);

  const addImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) => isAllowedChatImageMediaType(file.type));
      if (imageFiles.length === 0) {
        toast.error("Please attach a PNG, JPEG, WebP, or GIF image.");
        return;
      }

      const remaining = CHAT_MAX_IMAGES_PER_MESSAGE - pendingImages.length;
      if (remaining <= 0) {
        toast.error(
          `You can attach up to ${CHAT_MAX_IMAGES_PER_MESSAGE} images per message.`
        );
        return;
      }
      if (imageFiles.length > remaining) {
        toast.error(
          `You can attach up to ${CHAT_MAX_IMAGES_PER_MESSAGE} images per message.`
        );
      }

      setAttaching(true);
      try {
        const next: PendingChatImage[] = [];
        for (const file of imageFiles.slice(0, remaining)) {
          try {
            const compressed = await compressImageFile(file, {
              maxWidthPx: 1280,
              maxBytes: CHAT_IMAGE_MAX_BYTES,
              jpegQuality: 0.8,
            });
            next.push({
              id: crypto.randomUUID(),
              part: {
                type: "file",
                mediaType: compressed.mimeType,
                filename: file.name || "image",
                url: compressed.dataUrl,
              },
            });
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : `Could not attach ${file.name}`
            );
          }
        }

        if (next.length > 0) {
          setPendingImages((prev) =>
            [...prev, ...next].slice(0, CHAT_MAX_IMAGES_PER_MESSAGE)
          );
        }
      } finally {
        setAttaching(false);
      }
    },
    [pendingImages.length]
  );

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => prev.filter((image) => image.id !== id));
  }, []);

  const send = useCallback(
    async (text: string, images?: PendingChatImage[]) => {
      const attached = images ?? pendingImages;
      const trimmed = text.trim();
      const files = attached.map((image) => image.part);
      if (
        (!trimmed && files.length === 0) ||
        busy ||
        initializing ||
        attaching ||
        voiceLock
      ) {
        return;
      }
      const agentDonePrefs = readAgentDonePrefs(currentUserId);
      if (agentDonePrefs.sound) {
        unlockAgentDoneAudio();
      }
      if (agentDonePrefs.notifications) {
        void requestAgentDoneNotificationPermission();
      }
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = await createSession();
        if (!sessionId) {
          toast.error("Could not start a chat session.");
          return;
        }
        currentSessionIdRef.current = sessionId;
        mountSession(sessionId, false);
        setCurrentSessionId(sessionId);
      }
      const sessionRuntime = await waitForValue(() =>
        runtimeBySessionRef.current.get(sessionId)
      );
      if (!sessionRuntime) {
        toast.error("Could not start a chat session.");
        return;
      }
      if (sessionRuntime.busy) return;
      lastSendTargetRef.current = chatTarget;
      setLastSendTarget(chatTarget);
      savedScrollRef.current = { kind: "bottom" };
      if (
        workspaceChrome === "agent" &&
        mode === "agent" &&
        chatTarget !== "analytics"
      ) {
        try {
          await flushPendingSectionSaves();
        } catch {
          toast.error(
            "Could not save your latest edits before the assistant ran."
          );
          return;
        }
        setAgentCommitInFlight(true);
      }
      setInput("");
      setPendingImages([]);
      setMentionRange(null);
      const tagsForRequest = mentions;
      setMentions([]);
      for (const mention of tagsForRequest) {
        applyMentionFocus(mention);
      }
      const body: Record<string, unknown> = {
        sessionId,
        mode,
        pace,
        workspaceChrome,
        chatTarget,
      };
      if (tagsForRequest.length > 0) {
        body.mentions = tagsForRequest.map((mention) => ({
          type: mention.type,
          id: mention.id,
        }));
      }
      const metadata = { chatTarget };
      if (trimmed && files.length > 0) {
        void sessionRuntime.sendMessage(
          { text: trimmed, files, metadata },
          { body }
        );
      } else if (files.length > 0) {
        void sessionRuntime.sendMessage({ files, metadata }, { body });
      } else {
        void sessionRuntime.sendMessage({ text: trimmed, metadata }, { body });
      }
    },
    [
      attaching,
      busy,
      initializing,
      voiceLock,
      currentSessionId,
      createSession,
      mountSession,
      mode,
      pace,
      chatTarget,
      pendingImages,
      mentions,
      applyMentionFocus,
      currentUserId,
      workspaceChrome,
      flushPendingSectionSaves,
      setAgentCommitInFlight,
    ]
  );

  const currentTitle =
    sessions.find((s) => s.id === currentSessionId)?.title ?? "Investigation assistant";
  const sessionTabs = useMemo(
    () =>
      buildChatSessionTabItems({
        mountedIds: mountedSessions.map((session) => session.id),
        sessions,
        snapshots: tabSnapshots,
        runningIds: runningSessionIds,
      }),
    [mountedSessions, runningSessionIds, sessions, tabSnapshots]
  );

  return (
    <div className="flex h-full flex-col" aria-busy={initializing}>
      {mountedSessions.map((session) => (
        <ChatSessionHost
          key={session.id}
          reportId={report.id}
          sessionId={session.id}
          api={base}
          hydrateOnMount={session.hydrateOnMount}
          onFinishTurn={onFinishTurn}
          onTurnCompleted={onTurnCompleted}
          onSettled={onSessionSettled}
          onRuntime={onSessionRuntime}
        />
      ))}
      {/* Header: session tabs + new chat + history */}
      <div className="relative flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Sparkles className="size-4 shrink-0 text-[var(--primary)]" />
        {sessionTabs.length > 0 ? (
          <ChatSessionTabs
            items={sessionTabs}
            currentId={currentSessionId}
            onSelect={openSession}
            onClose={closeChatTab}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={currentTitle}>
            {currentTitle}
          </span>
        )}
        <button
          type="button"
          onClick={newChat}
          aria-label="New chat"
          title="New chat"
          className="flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        >
          <Plus className="size-4" />
        </button>
        <div ref={historyRef} className="relative">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-label="Chat history"
            aria-expanded={historyOpen}
            title="Chat history"
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]",
              historyOpen && "bg-[var(--secondary)] text-[var(--foreground)]"
            )}
          >
            <History className="size-4" />
          </button>
          {historyOpen && (
            <div className="absolute right-0 top-9 z-50 max-h-80 w-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl">
              {sessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  No conversations yet.
                </p>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSession(s.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--secondary)]",
                      s.id === currentSessionId && "bg-[var(--secondary)]"
                    )}
                  >
                    <span className="mt-0.5 shrink-0">
                      {s.id === currentSessionId ? (
                        <Check className="size-3.5 text-[var(--primary)]" />
                      ) : (
                        <span className="block size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block min-w-0 truncate text-xs font-medium text-[var(--foreground)]">
                          {s.title}
                        </span>
                        {runningSessionIds.has(s.id) ? (
                          <Loader2
                            className="size-3 shrink-0 animate-spin text-[var(--primary)]"
                            aria-label="Chat still running"
                          />
                        ) : null}
                      </span>
                      <span className="block text-[10px] text-[var(--muted-foreground)]">
                        {runningSessionIds.has(s.id)
                          ? "Still working"
                          : `${s.messageCount} message${s.messageCount === 1 ? "" : "s"}`}
                        {" · "}
                        {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        data-testid="chat-message-scroller"
        className="flex-1 space-y-5 overflow-y-auto p-4"
        onScroll={onMessagesScroll}
      >
        {hiddenCount > 0 ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={loadOlderMessages}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
            >
              Show earlier messages
            </button>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              {emptyChatIntro({
                targetingAnalytics,
                mode,
                workspaceChrome,
                documentType: report.documentType,
              })}
            </p>
            <div className="space-y-1.5">
              {(targetingAnalytics
                ? analyticsExamplePromptsForMode(mode)
                : examplePromptsForMode(mode, report.documentType)
              ).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy || initializing || voiceLock || !hostReady}
                  onClick={() => void send(p, [])}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--secondary)]/30 px-3 py-2 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          visibleMessages.map((m, i) => (
            <MessageTurn
              key={m.id}
              message={m}
              chatTarget={m.chatTarget}
              askUserActive={
                visibleStartIndex + i === messages.length - 1 &&
                !busy &&
                !initializing
              }
              onAnswerQuestions={(answerText) => void send(answerText, [])}
              streaming={
                busy &&
                visibleStartIndex + i === messages.length - 1 &&
                m.role === "assistant"
              }
            />
          ))
        )}
        {busy ? (
          <ChatBusyStatus
            mode={mode}
            stale={watchdog === "stale" || watchdog === "give_up"}
            background={backgroundTurn && !streamBusy}
            willNotify={shouldShowAgentDonePendingHint({
              notifications: readAgentDonePrefs(currentUserId).notifications,
              elapsedMs,
            })}
            onCancel={stopTurn}
          />
        ) : null}
        {error && (
          <p className="text-xs text-red-500">{CHAT_ASSISTANT_ERROR_MESSAGE}</p>
        )}
      </div>

      {/* Composer */}
      <form
        className="border-t border-[var(--border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (voiceLock) return;
          void send(input);
        }}
      >
        {statsEnabled ? (
          <div className="mb-2 flex items-center gap-1.5">
            <ComposerSelect
              value={composerChatTarget}
              options={CHAT_WORK_PRODUCT_OPTIONS}
              onChange={setComposerChatTarget}
              disabled={busy}
              ariaLabel="Work product"
              className="w-[7.5rem]"
              testId="chat-work-product-target"
            />
          </div>
        ) : null}
        {!canProposeAiEdits ? (
          <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
            {targetingAnalytics
              ? `${editLockReason ?? "You can't change the worksheet on this report right now."} Ask mode can still search attachments.`
              : `${editLockReason ?? "You can't propose edits on this report right now."} Ask mode can still discuss the report.`}
          </p>
        ) : readOnly && mode === "agent" && !targetingAnalytics ? (
          <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
            This report is read-only — the assistant can still discuss it, but proposed
            edits cannot be accepted.
          </p>
        ) : null}
        {showUploadingNotice ? <DocumentUploadingNotice /> : null}
        <MentionChips mentions={mentions} onRemove={removeMention} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void addImageFiles(files);
          }}
        />
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] focus-within:ring-1 focus-within:ring-[var(--ring)]">
          {pendingImages.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {pendingImages.map((image) => (
                <div
                  key={image.id}
                  className="relative size-16 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--secondary)]/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- chat data-URL previews */}
                  <img
                    src={image.part.url}
                    alt={image.part.filename ?? "Attached image"}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(image.id)}
                    aria-label={`Remove ${image.part.filename ?? "image"}`}
                    className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/80"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="relative">
            {mentionMenuOpen ? (
              <MentionMenu
                matches={mentionMatches}
                activeIndex={activeMentionIndex}
                onSelect={selectMention}
              />
            ) : null}
            <textarea
              ref={textareaRef}
              value={input}
              data-testid={targetingAnalytics ? "analytics-chat-input" : undefined}
              role="combobox"
              aria-expanded={mentionMenuOpen}
              aria-controls={mentionMenuOpen ? "chat-mention-menu" : undefined}
              aria-activedescendant={
                mentionMenuOpen
                  ? `chat-mention-option-${activeMentionIndex}`
                  : undefined
              }
              onChange={(e) => {
                if (voiceLock) return;
                const value = e.target.value;
                setInput(value);
                updateMentionQuery(value, e.target.selectionStart ?? value.length);
              }}
              onPaste={(event) => {
                const items = Array.from(event.clipboardData?.items ?? []);
                const imageFiles = items
                  .filter(
                    (item) => item.kind === "file" && item.type.startsWith("image/")
                  )
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => file != null);
                if (imageFiles.length === 0) return;
                event.preventDefault();
                void addImageFiles(imageFiles);
              }}
              onKeyDown={(e) => {
                if (mentionMenuOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((index) => (index + 1) % mentionMatches.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex(
                      (index) =>
                        (index - 1 + mentionMatches.length) % mentionMatches.length
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    const candidate = mentionMatches[activeMentionIndex];
                    if (candidate) selectMention(candidate);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionRange(null);
                    return;
                  }
                }
                if (voiceLock) {
                  e.preventDefault();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={3}
              disabled={initializing}
              readOnly={voiceLock}
              placeholder={composerPlaceholder({
                targetingAnalytics,
                mode,
                statsEnabled,
              })}
              className="min-h-[4.5rem] max-h-40 w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-sm outline-none placeholder:text-[var(--muted-foreground)] disabled:opacity-50"
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-0.5">
              {composerPrefsReady ? (
                <>
                  <ComposerSelect
                    value={mode}
                    options={modeOptions}
                    onChange={setMode}
                    disabled={busy}
                    ariaLabel="Assistant mode"
                    variant="pill"
                    testId={targetingAnalytics ? "analytics-chat-mode" : undefined}
                  />
                  <ComposerSelect
                    value={pace}
                    options={CHAT_PACE_OPTIONS}
                    onChange={setPace}
                    disabled={busy}
                    ariaLabel="Answer depth"
                    variant="ghost"
                    showIcon={false}
                    testId={targetingAnalytics ? "analytics-chat-pace" : undefined}
                  />
                </>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                disabled={busy || initializing || attaching || voiceLock || !hostReady}
                aria-label="Attach image"
                title="Attach image"
                data-testid={targetingAnalytics ? "analytics-chat-attach-image" : undefined}
                onClick={() => fileInputRef.current?.click()}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] disabled:opacity-40"
              >
                {attaching ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <ChatVoiceButton
                recording={voice.recording}
                requesting={voice.status === "requesting"}
                level={voice.level}
                disabled={busy || initializing || attaching || !hostReady}
                targetingAnalytics={targetingAnalytics}
                onToggle={voice.toggle}
              />
              {busy ? (
                <button
                  type="button"
                  onClick={stopTurn}
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="flex size-7 items-center justify-center rounded-full bg-[var(--brand-600)] text-white transition-opacity hover:opacity-90"
                >
                  <Square className="size-2.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={
                    initializing ||
                    attaching ||
                    voiceLock ||
                    !hostReady ||
                    (!input.trim() && pendingImages.length === 0)
                  }
                  aria-label="Send message"
                  className="flex size-7 items-center justify-center rounded-full bg-[var(--brand-600)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <ArrowUp className="size-3.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
