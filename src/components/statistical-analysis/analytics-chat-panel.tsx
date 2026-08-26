"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { formatDistanceToNow } from "date-fns";
import {
  isFileUIPart,
  type FileUIPart,
  type UIMessage,
  type UIMessagePart,
} from "ai";
import {
  BarChart3,
  Check,
  ChartScatter,
  FileSearch,
  History,
  ImagePlus,
  LayoutList,
  LineChart,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Square,
  Table2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChatMarkdown } from "@/components/report/chat-markdown";
import {
  AskUserForm,
  type AskUserQuestionInput,
} from "@/components/report/chat-ask-user-form";
import {
  ANALYTICS_CHAT_MODE_OPTIONS,
  CHAT_PACE_OPTIONS,
  ChatBusyStatus,
  ComposerSelect,
} from "@/components/report/chat-composer-controls";
import {
  ChatSessionHost,
  IDLE_CHAT_RUNTIME,
  type ChatSessionRuntime,
} from "@/components/report/chat-session-host";
import { useReportData } from "@/providers/report-provider";
import {
  aiSuggestionLockReason,
  canSaveReportSection,
} from "@/lib/reports/access";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  chatWatchdogPhase,
} from "@/lib/ai/chat/assistant-turn";
import type { ChatSessionSummary } from "@/lib/ai/chat/sessions";
import { waitForValue } from "@/lib/ai/chat/session-runtime";
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_MAX_IMAGES_PER_MESSAGE,
  isAllowedChatImageMediaType,
} from "@/lib/ai/chat/image-parts";
import { compressImageFile } from "@/lib/images/compress-image";
import {
  DEFAULT_CHAT_COMPOSER_PREFS,
  readChatComposerPrefs,
  subscribeChatComposerPrefs,
  writeChatComposerPrefs,
} from "@/lib/ai/chat/composer-prefs";
import { isChatPace, type ChatPace } from "@/lib/ai/chat/pace";
import { isChatMode, type ChatMode } from "@/lib/ai/chat/system-prompt";

const ANALYTICS_EXAMPLE_PROMPTS: Record<ChatMode, string[]> = {
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
  ],
};

type PendingChatImage = {
  id: string;
  part: FileUIPart;
};

type ToolPartInfo = {
  toolName: string;
  state: string;
  input: Record<string, unknown> | undefined;
  output: Record<string, unknown> | undefined;
  errorText: string | undefined;
};

function readToolPart(part: UIMessagePart<never, never>): ToolPartInfo | null {
  if (typeof part.type !== "string" || !part.type.startsWith("tool-")) {
    return null;
  }
  const p = part as unknown as {
    type: string;
    state?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    errorText?: string;
  };
  return {
    toolName: p.type.slice("tool-".length),
    state: p.state ?? "",
    input: p.input,
    output: p.output,
    errorText: p.errorText,
  };
}

function parseAskUserQuestions(
  input: Record<string, unknown> | undefined
): AskUserQuestionInput[] {
  if (!Array.isArray(input?.questions)) return [];
  return input.questions.flatMap((q) => {
    if (typeof q !== "object" || q === null) return [];
    const question = (q as { question?: unknown }).question;
    if (typeof question !== "string" || !question.trim()) return [];
    const hint = (q as { hint?: unknown }).hint;
    return [{ question, hint: typeof hint === "string" ? hint : undefined }];
  });
}

function ToolLine({
  icon,
  tone = "muted",
  children,
}: {
  icon: ReactNode;
  tone?: "muted" | "success" | "warn";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
        tone === "warn" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700",
        tone === "muted" &&
          "border-[var(--border)] bg-[var(--secondary)]/40 text-[var(--muted-foreground)]"
      )}
    >
      {icon}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function manageWorksheetPendingLabel(action: string): string {
  switch (action) {
    case "add_sheet":
      return "Adding data sheet…";
    case "rename_sheet":
      return "Renaming sheet…";
    case "delete_sheet":
      return "Deleting sheet…";
    case "add_column":
      return "Adding column…";
    case "rename_column":
      return "Renaming column…";
    case "delete_column":
      return "Deleting column…";
    case "add_row":
      return "Adding row…";
    case "delete_row":
      return "Deleting row…";
    case "set_cell":
      return "Updating cell…";
    default:
      return "Updating worksheet…";
  }
}

function AnalyticsToolChip({
  info,
  askUserActive,
  onAnswerQuestions,
}: {
  info: ToolPartInfo;
  askUserActive: boolean;
  onAnswerQuestions: (message: string) => void;
}) {
  const pending =
    info.state === "input-streaming" || info.state === "input-available";

  switch (info.toolName) {
    case "search_documents":
      return (
        <ToolLine icon={<FileSearch className="size-3.5" />}>
          {pending ? "Searching attachments…" : "Searched attachments"}
        </ToolLine>
      );
    case "read_document_page": {
      const page =
        typeof info.input?.pageNumber === "number"
          ? ` p.${info.input.pageNumber}`
          : "";
      return (
        <ToolLine icon={<FileSearch className="size-3.5" />}>
          {pending ? "Reading page…" : `Read page${page}`}
        </ToolLine>
      );
    }
    case "document_outline":
      return (
        <ToolLine icon={<LayoutList className="size-3.5" />}>
          {pending ? "Reading outline…" : "Read document outline"}
        </ToolLine>
      );
    case "scan_attachments":
      return (
        <ToolLine icon={<FileSearch className="size-3.5" />}>
          {pending ? "Scanning attachments…" : "Scanned attachments"}
        </ToolLine>
      );
    case "read_worksheet":
      return (
        <ToolLine icon={<Table2 className="size-3.5" />}>
          {pending ? "Reading worksheet…" : "Read worksheet"}
        </ToolLine>
      );
    case "extract_numeric_series": {
      const count =
        typeof info.output?.valueCount === "number"
          ? info.output.valueCount
          : null;
      if (pending) {
        return (
          <ToolLine icon={<Table2 className="size-3.5" />}>
            Extracting numbers…
          </ToolLine>
        );
      }
      return (
        <ToolLine
          icon={<Table2 className="size-3.5" />}
          tone={count && count > 0 ? "success" : "warn"}
        >
          {count && count > 0
            ? `Extracted ${count} value${count === 1 ? "" : "s"}`
            : info.output?.status === "ambiguous"
              ? typeof info.output?.message === "string"
                ? info.output.message
                : "Need one measurement series"
              : "No numbers found"}
        </ToolLine>
      );
    }
    case "write_column": {
      if (pending) {
        return (
          <ToolLine icon={<Table2 className="size-3.5" />}>
            Writing column…
          </ToolLine>
        );
      }
      if (info.output?.status === "written") {
        const name =
          typeof info.output.columnName === "string"
            ? info.output.columnName
            : "column";
        return (
          <ToolLine
            icon={<Table2 className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Wrote {name} — check the worksheet
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<Table2 className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not write the column."}
        </ToolLine>
      );
    }
    case "manage_worksheet": {
      const action =
        typeof info.input?.action === "string" ? info.input.action : "";
      if (pending) {
        return (
          <ToolLine icon={<Table2 className="size-3.5" />}>
            {manageWorksheetPendingLabel(action)}
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<Table2 className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            {typeof info.output.message === "string"
              ? info.output.message
              : "Updated the worksheet"}
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<Table2 className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not update the worksheet."}
        </ToolLine>
      );
    }
    case "run_capability_sixpack": {
      if (pending) {
        return (
          <ToolLine icon={<LineChart className="size-3.5" />}>
            Running sixpack…
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<LineChart className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Saved sixpack — open the Results tab
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<LineChart className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not run the sixpack."}
        </ToolLine>
      );
    }
    case "run_one_way_anova": {
      if (pending) {
        return (
          <ToolLine icon={<BarChart3 className="size-3.5" />}>
            Running one-way ANOVA…
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<BarChart3 className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Saved one-way ANOVA — open the Results tab
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<BarChart3 className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not run the ANOVA."}
        </ToolLine>
      );
    }
    case "plot_measurements": {
      if (pending) {
        return (
          <ToolLine icon={<ChartScatter className="size-3.5" />}>
            Plotting measurements…
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<ChartScatter className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Saved scatter — open the Results tab
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<ChartScatter className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not plot measurements."}
        </ToolLine>
      );
    }
    case "ask_user": {
      const questions = parseAskUserQuestions(info.input);
      if (questions.length === 0) return null;
      return (
        <AskUserForm
          questions={questions}
          disabled={!askUserActive}
          onSubmit={onAnswerQuestions}
        />
      );
    }
    default: {
      return (
        <ToolLine icon={<Wrench className="size-3.5" />}>{info.toolName}</ToolLine>
      );
    }
  }
}

function MessageTurn({
  message,
  askUserActive,
  onAnswerQuestions,
}: {
  message: UIMessage;
  askUserActive: boolean;
  onAnswerQuestions: (message: string) => void;
}) {
  if (message.role === "user") {
    const text = (message.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    const files = (message.parts ?? []).filter(isFileUIPart);
    if (!text && files.length === 0) return null;
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[92%] rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-sm text-[var(--primary-foreground)]"
          aria-label="Your message"
        >
          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- chat data-URL previews
                <img
                  key={`${file.filename ?? "image"}-${index}`}
                  src={file.url}
                  alt={file.filename ?? "Attached image"}
                  className="max-h-24 rounded-md"
                />
              ))}
            </div>
          ) : null}
          {text ? <div className="whitespace-pre-wrap">{text}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
        <Sparkles className="size-3 text-[var(--primary)]" />
        Assistant
      </div>
      {(message.parts ?? []).map((part, i) => {
        if (part.type === "text") {
          const text = (part as { text: string }).text;
          if (!text.trim()) return null;
          return <ChatMarkdown key={i}>{text}</ChatMarkdown>;
        }
        const tool = readToolPart(part as UIMessagePart<never, never>);
        if (!tool) return null;
        return (
          <AnalyticsToolChip
            key={i}
            info={tool}
            askUserActive={askUserActive}
            onAnswerQuestions={onAnswerQuestions}
          />
        );
      })}
    </div>
  );
}

function subscribeNoop() {
  return () => {};
}

export function AnalyticsChatPanel({
  onWorksheetChanged,
}: {
  onWorksheetChanged: () => void;
}) {
  const { report, currentUserId, currentUserRole, currentUserEmail } =
    useReportData();
  const accessUser = {
    id: currentUserId,
    role: currentUserRole,
    email: currentUserEmail,
  };
  const canEdit = canSaveReportSection(accessUser, report);
  const editLockReason = aiSuggestionLockReason(accessUser, report);
  const api = `/api/reports/${report.id}/analytics/chat`;
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<ChatSessionRuntime>(IDLE_CHAT_RUNTIME);
  const [initializing, setInitializing] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const [attaching, setAttaching] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runtimeBySessionRef = useRef(new Map<string, ChatSessionRuntime>());
  const currentSessionIdRef = useRef<string | null>(null);
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
  const modeOptions = useMemo(
    () =>
      ANALYTICS_CHAT_MODE_OPTIONS.map((option) =>
        option.value === "agent" && !canEdit
          ? {
              ...option,
              disabled: true,
              description: editLockReason ?? option.description,
            }
          : option
      ),
    [canEdit, editLockReason]
  );
  const mode =
    !canEdit && storedComposerPrefs.mode === "agent"
      ? "plan"
      : storedComposerPrefs.mode;
  const pace = storedComposerPrefs.pace;

  const {
    messages,
    error,
    stopTurn,
    busy,
    streamBusy,
    backgroundTurn,
    elapsedMs,
    silentMs,
  } = runtime;
  const hostReady = runtime !== IDLE_CHAT_RUNTIME;
  const watchdog = chatWatchdogPhase({
    busy: streamBusy,
    elapsedMs,
    silentMs,
  });

  const loadSessions = useCallback(async (): Promise<ChatSessionSummary[]> => {
    try {
      const res = await fetch(`${api}/sessions`);
      if (!res.ok) return [];
      const data = (await res.json()) as { sessions?: ChatSessionSummary[] };
      const next = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(next);
      return next;
    } catch {
      return [];
    }
  }, [api]);

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${api}/sessions`, { method: "POST" });
      if (!res.ok) return null;
      const data = (await res.json()) as { session: ChatSessionSummary };
      setSessions((prev) => [data.session, ...prev]);
      return data.session.id;
    } catch {
      return null;
    }
  }, [api]);

  const openSession = useCallback((sessionId: string) => {
    currentSessionIdRef.current = sessionId;
    setCurrentSessionId(sessionId);
    setRuntime(IDLE_CHAT_RUNTIME);
    setHistoryOpen(false);
  }, []);

  const newChat = useCallback(async () => {
    const id = await createSession();
    if (!id) {
      toast.error("Could not start a new chat.");
      return;
    }
    currentSessionIdRef.current = id;
    setCurrentSessionId(id);
    setRuntime(IDLE_CHAT_RUNTIME);
    setInput("");
    setPendingImages([]);
    setHistoryOpen(false);
  }, [createSession]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const existing = await loadSessions();
      if (cancelled) return;
      if (existing[0]) {
        currentSessionIdRef.current = existing[0].id;
        setCurrentSessionId(existing[0].id);
      } else {
        const id = await createSession();
        if (!cancelled && id) {
          currentSessionIdRef.current = id;
          setCurrentSessionId(id);
        }
      }
      if (!cancelled) setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [createSession, loadSessions]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!historyRef.current?.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    };
    if (historyOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [historyOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, busy]);

  const onFinishTurn = useCallback(() => {
    void loadSessions();
    onWorksheetChanged();
  }, [loadSessions, onWorksheetChanged]);

  const onTurnCompleted = useCallback(() => {}, []);

  const onSettled = useCallback(() => {}, []);

  const onRuntime = useCallback(
    (sessionId: string, next: ChatSessionRuntime) => {
      runtimeBySessionRef.current.set(sessionId, next);
      if (sessionId !== currentSessionIdRef.current) return;
      setRuntime(next);
    },
    []
  );

  const persistComposerPrefs = useCallback(
    (next: { mode: ChatMode; pace: ChatPace }) => {
      if (!currentUserId) return;
      writeChatComposerPrefs(currentUserId, report.id, next);
    },
    [currentUserId, report.id]
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

  const addImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) =>
        isAllowedChatImageMediaType(file.type)
      );
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
        attaching
      ) {
        return;
      }
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = await createSession();
        if (!sessionId) {
          toast.error("Could not start a chat session.");
          return;
        }
        currentSessionIdRef.current = sessionId;
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
      setInput("");
      setPendingImages([]);
      const body = { sessionId, mode, pace };
      if (trimmed && files.length > 0) {
        void sessionRuntime.sendMessage({ text: trimmed, files }, { body });
      } else if (files.length > 0) {
        void sessionRuntime.sendMessage({ files }, { body });
      } else {
        void sessionRuntime.sendMessage({ text: trimmed }, { body });
      }
    },
    [
      attaching,
      busy,
      createSession,
      currentSessionId,
      initializing,
      mode,
      pace,
      pendingImages,
    ]
  );

  const currentTitle =
    sessions.find((s) => s.id === currentSessionId)?.title ??
    "Statistical analysis";

  return (
    <div
      data-testid="analytics-chat-panel"
      className="flex h-full flex-col"
      aria-label="Statistical analysis assistant"
      aria-busy={initializing}
    >
      {currentSessionId ? (
        <ChatSessionHost
          key={currentSessionId}
          reportId={report.id}
          sessionId={currentSessionId}
          api={api}
          hydrateOnMount
          onFinishTurn={onFinishTurn}
          onTurnCompleted={onTurnCompleted}
          onSettled={onSettled}
          onRuntime={onRuntime}
        />
      ) : null}

      <div className="relative flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Sparkles className="size-4 shrink-0 text-[var(--primary)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {currentTitle}
        </span>
        <button
          type="button"
          onClick={() => void newChat()}
          aria-label="New chat"
          title="New chat"
          className="flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        >
          <Plus className="size-4" />
        </button>
        <div ref={historyRef} className="relative">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-label="Chat history"
            aria-expanded={historyOpen}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]",
              historyOpen && "bg-[var(--secondary)] text-[var(--foreground)]"
            )}
          >
            <History className="size-4" />
          </button>
          {historyOpen ? (
            <div className="absolute right-0 top-9 z-50 max-h-80 w-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl">
              {sessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  No conversations yet.
                </p>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => openSession(session.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--secondary)]",
                      session.id === currentSessionId && "bg-[var(--secondary)]"
                    )}
                  >
                    {session.id === currentSessionId ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" />
                    ) : (
                      <span className="mt-0.5 block size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {session.title}
                      </span>
                      <span className="block text-[10px] text-[var(--muted-foreground)]">
                        {formatDistanceToNow(new Date(session.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              {mode === "plan"
                ? "I read this report's attachments and the worksheet. I don't fill columns or run plots in Ask mode — switch to Agent for that. I don't draft the document."
                : "I read this report's attachments, fill a worksheet column, run a Normal Capability Sixpack or one-way ANOVA, and plot measurements as a scatter. I don't draft the document."}
            </p>
            <div className="space-y-1.5">
              {ANALYTICS_EXAMPLE_PROMPTS[mode].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy || initializing || !hostReady}
                  onClick={() => void send(prompt)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--secondary)]/30 px-3 py-2 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageTurn
              key={message.id}
              message={message}
              askUserActive={
                index === messages.length - 1 && !busy && !initializing
              }
              onAnswerQuestions={(answer) => void send(answer)}
            />
          ))
        )}
        {busy ? (
          <ChatBusyStatus
            mode={mode}
            stale={watchdog === "stale" || watchdog === "give_up"}
            background={backgroundTurn && !streamBusy}
            willNotify={false}
            onCancel={stopTurn}
          />
        ) : null}
        {error ? (
          <p className="text-xs text-red-500">{CHAT_ASSISTANT_ERROR_MESSAGE}</p>
        ) : null}
      </div>

      <form
        className="border-t border-[var(--border)] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <div className="mb-2 flex items-center gap-1.5">
          {composerPrefsReady ? (
            <>
              <ComposerSelect
                value={mode}
                options={modeOptions}
                onChange={setMode}
                disabled={busy}
                ariaLabel="Assistant mode"
                className="w-[6rem]"
                testId="analytics-chat-mode"
              />
              <ComposerSelect
                value={pace}
                options={CHAT_PACE_OPTIONS}
                onChange={setPace}
                disabled={busy}
                ariaLabel="Answer depth"
                className="w-[6rem]"
                testId="analytics-chat-pace"
              />
            </>
          ) : null}
        </div>
        {!canEdit ? (
          <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
            {editLockReason ??
              "You can't change the worksheet on this report right now."}{" "}
            Ask mode can still search attachments.
          </p>
        ) : null}
        {pendingImages.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
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
        <div className="flex items-end gap-2">
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
          <button
            type="button"
            disabled={busy || initializing || attaching || !hostReady}
            aria-label="Attach image"
            title="Attach image"
            data-testid="analytics-chat-attach-image"
            onClick={() => fileInputRef.current?.click()}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] disabled:opacity-40"
          >
            {attaching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
          </button>
          <textarea
            data-testid="analytics-chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.items)
                .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                .map((item) => item.getAsFile())
                .filter((file): file is File => file != null);
              if (files.length === 0) return;
              event.preventDefault();
              void addImageFiles(files);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            disabled={initializing}
            placeholder={
              mode === "plan"
                ? "Ask about measurements in the attachments…"
                : "Extract numbers, run a sixpack, ANOVA, or plot measurements…"
            }
            className="min-h-[40px] max-h-40 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          />
          {busy ? (
            <button
              type="button"
              onClick={stopTurn}
              aria-label="Stop generating"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send message"
              disabled={
                initializing || attaching || (!input.trim() && pendingImages.length === 0)
              }
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
