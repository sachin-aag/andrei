"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatDistanceToNow } from "date-fns";
import type { UIMessage, UIMessagePart } from "ai";
import {
  Check,
  FileSearch,
  History,
  LayoutList,
  LineChart,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Square,
  Table2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChatMarkdown } from "@/components/report/chat-markdown";
import {
  AskUserForm,
  type AskUserQuestionInput,
} from "@/components/report/chat-ask-user-form";
import {
  ChatSessionHost,
  IDLE_CHAT_RUNTIME,
  type ChatSessionRuntime,
} from "@/components/report/chat-session-host";
import { useReportData } from "@/providers/report-provider";
import { canSaveReportSection } from "@/lib/reports/access";
import { CHAT_ASSISTANT_ERROR_MESSAGE } from "@/lib/ai/chat/assistant-turn";
import type { ChatSessionSummary } from "@/lib/ai/chat/sessions";
import { waitForValue } from "@/lib/ai/chat/session-runtime";

const EXAMPLE_PROMPTS = [
  "Extract assay measurements from the attachments into a worksheet column.",
  "Run a Normal Capability Sixpack on the Assay column with LSL 90 and USL 110.",
];

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
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[92%] rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-sm text-[var(--primary-foreground)]"
          aria-label="Your message"
        >
          <div className="whitespace-pre-wrap">{text}</div>
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

export function AnalyticsChatPanel({
  onWorksheetChanged,
}: {
  onWorksheetChanged: () => void;
}) {
  const { report, currentUserId, currentUserRole, currentUserEmail } =
    useReportData();
  const canEdit = canSaveReportSection(
    { id: currentUserId, role: currentUserRole, email: currentUserEmail },
    report
  );
  const api = `/api/reports/${report.id}/analytics/chat`;
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<ChatSessionRuntime>(IDLE_CHAT_RUNTIME);
  const [initializing, setInitializing] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runtimeBySessionRef = useRef(new Map<string, ChatSessionRuntime>());
  const currentSessionIdRef = useRef<string | null>(null);

  const { messages, error, stopTurn, busy } = runtime;
  const hostReady = runtime !== IDLE_CHAT_RUNTIME;

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

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || initializing) return;
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
      void sessionRuntime.sendMessage(
        { text: trimmed },
        { body: { sessionId } }
      );
    },
    [busy, createSession, currentSessionId, initializing]
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
              I read this report&apos;s attachments, fill a worksheet column,
              and run a Normal Capability Sixpack. I don&apos;t draft the
              document.
            </p>
            {!canEdit ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                This report is locked. You can search attachments but cannot
                change the worksheet.
              </p>
            ) : null}
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((prompt) => (
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
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="size-3 animate-spin" />
            Working…
            <button
              type="button"
              onClick={stopTurn}
              aria-label="Stop generating"
              className="rounded-md px-1.5 py-0.5 hover:bg-[var(--secondary)]"
            >
              Stop
            </button>
          </div>
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
        <div className="flex items-end gap-2">
          <textarea
            data-testid="analytics-chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            disabled={initializing}
            placeholder="Extract numbers from attachments, or run a Normal Capability Sixpack…"
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
              disabled={initializing || !input.trim()}
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
