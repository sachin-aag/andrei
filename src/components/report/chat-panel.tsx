"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type UIMessagePart } from "ai";
import { formatDistanceToNow } from "date-fns";
import {
  Send,
  Sparkles,
  PencilLine,
  BookOpen,
  Loader2,
  Plus,
  History,
  ClipboardList,
  Wrench,
  Check,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChatMarkdown } from "@/components/report/chat-markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReportData } from "@/providers/report-provider";
import { SECTION_LABELS } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import {
  CHAT_EDITABLE_SECTIONS,
  CHAT_SECTION_SCOPE_ALL,
  type ChatSectionScope,
} from "@/lib/ai/chat/fields";
import {
  detectSectionScopeMismatch,
  type SectionScopeMismatch,
} from "@/lib/ai/chat/section-intent";
import type { ChatSessionSummary } from "@/lib/ai/chat/sessions";

type ChatMode = "plan" | "agent";

const EXAMPLE_PROMPTS: Record<ChatMode, string[]> = {
  plan: [
    "Help me document this deviation from scratch.",
    "What do you need to complete the Define section?",
    "Plan an investigation for an out-of-spec result on a medical device line.",
  ],
  agent: [
    "Draft the Define section from what we discussed.",
    "Tighten the problem statement and scope in Define.",
    "Propose a clearer root cause and impact assessment in Analyze.",
  ],
};

type ToolPartInfo = {
  toolName: string;
  state: string;
  input: Record<string, unknown> | undefined;
  output: Record<string, unknown> | undefined;
};

function readToolPart(part: UIMessagePart<never, never>): ToolPartInfo | null {
  if (typeof part.type !== "string" || !part.type.startsWith("tool-")) return null;
  const p = part as unknown as {
    type: string;
    state?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
  return {
    toolName: p.type.slice("tool-".length),
    state: p.state ?? "",
    input: p.input,
    output: p.output,
  };
}

function sectionLabel(section: unknown): string {
  if (typeof section === "string" && section in SECTION_LABELS) {
    return SECTION_LABELS[section as keyof typeof SECTION_LABELS];
  }
  return typeof section === "string" ? section : "";
}

function ToolChip({
  info,
  onSwitchSectionScope,
}: {
  info: ToolPartInfo;
  onSwitchSectionScope?: (section: SectionType) => void;
}) {
  const pending = info.state === "input-streaming" || info.state === "input-available";

  if (info.toolName === "suggest_section_scope") {
    const suggested = info.output?.suggestedSection ?? info.input?.suggestedSection;
    const reason =
      typeof info.output?.reason === "string"
        ? info.output.reason
        : typeof info.input?.reason === "string"
          ? info.input.reason
          : "This question may fit another section better.";
    const suggestedLabel = sectionLabel(suggested);

    if (pending) {
      return (
        <ToolLine icon={<ArrowRightLeft className="size-3.5" />}>
          Checking section focus…
        </ToolLine>
      );
    }

    return (
      <div className="rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-2.5 py-2 text-[11px] text-[var(--foreground)]">
        <div className="flex items-start gap-2">
          <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0 space-y-1.5">
            <p className="leading-relaxed">{reason}</p>
            {typeof suggested === "string" && onSwitchSectionScope && (
              <button
                type="button"
                onClick={() => onSwitchSectionScope(suggested as SectionType)}
                className="rounded-md border border-[var(--primary)]/40 bg-[var(--card)] px-2 py-1 text-[11px] font-medium text-[var(--primary)] transition-colors hover:bg-[var(--secondary)]"
              >
                Switch to {suggestedLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
    if (status === "proposed") {
      return (
        <ToolLine icon={<PencilLine className="size-3.5 text-emerald-500" />} tone="success">
          Proposed edit to {section}
          {field ? ` · ${field}` : ""} — review it in the document.
        </ToolLine>
      );
    }
    const hint =
      typeof info.output?.hint === "string"
        ? info.output.hint
        : typeof info.output?.message === "string"
          ? info.output.message
          : "Could not place this edit.";
    return (
      <ToolLine icon={<PencilLine className="size-3.5 text-amber-500" />} tone="warn">
        Edit not applied: {hint}
      </ToolLine>
    );
  }

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

function ScopeMismatchBanner({
  mismatch,
  onSwitch,
  onDismiss,
}: {
  mismatch: SectionScopeMismatch;
  onSwitch: (section: SectionType) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-2.5 py-2 text-[11px] text-[var(--foreground)]">
      <ArrowRightLeft className="size-3.5 shrink-0 text-[var(--primary)]" />
      <span className="min-w-0 flex-1 leading-relaxed">{mismatch.reason}</span>
      <button
        type="button"
        onClick={() => onSwitch(mismatch.suggestedSection)}
        className="rounded-md border border-[var(--primary)]/40 bg-[var(--card)] px-2 py-1 font-medium text-[var(--primary)] transition-colors hover:bg-[var(--secondary)]"
      >
        Switch to {SECTION_LABELS[mismatch.suggestedSection]}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md px-2 py-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
      >
        Keep {SECTION_LABELS[mismatch.currentSection]}
      </button>
    </div>
  );
}

function MessageTurn({
  message,
  onSwitchSectionScope,
}: {
  message: UIMessage;
  onSwitchSectionScope?: (section: SectionType) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-sm text-[var(--primary-foreground)]">
          {text}
        </div>
      </div>
    );
  }

  // Assistant turn: full-width, no bubble (Cursor-style), tool chips inline.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
        <Sparkles className="size-3 text-[var(--primary)]" />
        Assistant
      </div>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          const text = (part as { text: string }).text;
          if (!text.trim()) return null;
          return <ChatMarkdown key={i}>{text}</ChatMarkdown>;
        }
        const tool = readToolPart(part as UIMessagePart<never, never>);
        if (tool) {
          return (
            <ToolChip
              key={i}
              info={tool}
              onSwitchSectionScope={onSwitchSectionScope}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function scopeDescription(scope: ChatSectionScope): string {
  return scope === CHAT_SECTION_SCOPE_ALL
    ? "all sections"
    : SECTION_LABELS[scope];
}

function SectionScopeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ChatSectionScope;
  onChange: (scope: ChatSectionScope) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ChatSectionScope)}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-7 w-[7.5rem] border-[var(--border)] bg-[var(--secondary)]/30 px-2 text-[11px] font-medium"
        aria-label="Section focus"
        title="Choose which report section to focus on"
      >
        <SelectValue placeholder="Section" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CHAT_SECTION_SCOPE_ALL}>All sections</SelectItem>
        {CHAT_EDITABLE_SECTIONS.map((section) => (
          <SelectItem key={section} value={section}>
            {SECTION_LABELS[section]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}) {
  const options: { value: ChatMode; label: string; icon: typeof ClipboardList }[] = [
    { value: "plan", label: "Plan", icon: ClipboardList },
    { value: "agent", label: "Agent", icon: Wrench },
  ];
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--secondary)]/30 p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
              active
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
            title={
              opt.value === "plan"
                ? "Plan: ask questions and plan the draft (no document edits)"
                : "Agent: draft and propose edits you accept or reject"
            }
          >
            <Icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChatPanel() {
  const { report, refresh, readOnly } = useReportData();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("agent");
  const [sectionScope, setSectionScope] = useState<ChatSectionScope>(CHAT_SECTION_SCOPE_ALL);
  const [clientScopeSuggestion, setClientScopeSuggestion] =
    useState<SectionScopeMismatch | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const base = `/api/reports/${report.id}/chat`;

  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: `report-chat-${report.id}`,
    transport: new DefaultChatTransport({ api: base }),
    onFinish: () => {
      // Pull newly-proposed ai_fix comments into report state (inline diff +
      // gutter card), and refresh session titles/order.
      void refresh();
      void loadSessions();
    },
    onError: (err) => {
      console.error("chat error", err);
      toast.error("The assistant hit an error. Please try again.");
    },
  });

  const busy = status === "submitted" || status === "streaming";

  const loadSessions = useCallback(async (): Promise<ChatSessionSummary[]> => {
    try {
      const res = await fetch(`${base}/sessions`);
      if (!res.ok) return [];
      const data = (await res.json()) as { sessions: ChatSessionSummary[] };
      setSessions(data.sessions);
      return data.sessions;
    } catch {
      return [];
    }
  }, [base]);

  const openSession = useCallback(
    async (sessionId: string) => {
      setCurrentSessionId(sessionId);
      setHistoryOpen(false);
      try {
        const res = await fetch(`${base}/sessions/${sessionId}`);
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data = (await res.json()) as { messages: UIMessage[] };
        setMessages(data.messages ?? []);
      } catch {
        setMessages([]);
      }
    },
    [base, setMessages]
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

  const newChat = useCallback(async () => {
    setHistoryOpen(false);
    const id = await createSession();
    if (!id) {
      toast.error("Could not start a new chat.");
      return;
    }
    setCurrentSessionId(id);
    setMessages([]);
    setInput("");
  }, [createSession, setMessages]);

  // Initialize: load sessions, open the most recent or create the first.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const existing = await loadSessions();
      if (cancelled) return;
      if (existing.length > 0) {
        await openSession(existing[0]!.id);
      } else {
        const id = await createSession();
        if (!cancelled && id) setCurrentSessionId(id);
      }
      if (!cancelled) setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

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

  const applySectionScope = useCallback((section: SectionType) => {
    setSectionScope(section);
    setClientScopeSuggestion(null);
  }, []);

  const changeSectionScope = useCallback((scope: ChatSectionScope) => {
    setSectionScope(scope);
    setClientScopeSuggestion(null);
  }, []);

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
        setCurrentSessionId(sessionId);
      }
      setInput("");
      setClientScopeSuggestion(detectSectionScopeMismatch(sectionScope, trimmed));
      void sendMessage({ text: trimmed }, { body: { sessionId, mode, sectionScope } });
    },
    [busy, initializing, currentSessionId, createSession, sendMessage, mode, sectionScope]
  );

  const currentTitle =
    sessions.find((s) => s.id === currentSessionId)?.title ?? "Investigation assistant";

  return (
    <div className="flex h-full flex-col">
      {/* Header: title + new chat + history */}
      <div className="relative flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <Sparkles className="size-4 shrink-0 text-[var(--primary)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={currentTitle}>
          {currentTitle}
        </span>
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
                      <span className="block truncate text-xs font-medium text-[var(--foreground)]">
                        {s.title}
                      </span>
                      <span className="block text-[10px] text-[var(--muted-foreground)]">
                        {s.messageCount} message{s.messageCount === 1 ? "" : "s"} ·{" "}
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
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              {mode === "plan"
                ? sectionScope === CHAT_SECTION_SCOPE_ALL
                  ? "I'll ask focused questions to plan a strong deviation investigation draft. I won't edit the document in Plan mode."
                  : `Focused on ${scopeDescription(sectionScope)} — I'll ask what we need to complete that section. I won't edit the document in Plan mode.`
                : sectionScope === CHAT_SECTION_SCOPE_ALL
                  ? "Ask me to draft or improve any section of your deviation investigation. I read the report and propose targeted edits you accept or reject."
                  : `Focused on ${scopeDescription(sectionScope)} — ask me to draft or improve that section. I'll propose targeted edits you accept or reject.`}
            </p>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS[mode].map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy || initializing}
                  onClick={() => send(p)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--secondary)]/30 px-3 py-2 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageTurn
              key={m.id}
              message={m}
              onSwitchSectionScope={applySectionScope}
            />
          ))
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="size-3.5 animate-spin" />
            {mode === "plan" ? "Thinking through the plan…" : "Working…"}
          </div>
        )}
        {error && <p className="text-xs text-red-500">Something went wrong. Try again.</p>}
      </div>

      {/* Composer */}
      <form
        className="border-t border-[var(--border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {clientScopeSuggestion && (
          <ScopeMismatchBanner
            mismatch={clientScopeSuggestion}
            onSwitch={applySectionScope}
            onDismiss={() => setClientScopeSuggestion(null)}
          />
        )}
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <ModeToggle mode={mode} onChange={setMode} disabled={busy} />
            <SectionScopeSelect
              value={sectionScope}
              onChange={changeSectionScope}
              disabled={busy}
            />
          </div>
        </div>
        {readOnly && mode === "agent" && (
          <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
            This report is read-only — the assistant can still discuss it, but proposed
            edits cannot be accepted.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            disabled={initializing}
            placeholder={
              mode === "plan"
                ? sectionScope === CHAT_SECTION_SCOPE_ALL
                  ? "Describe the deviation or quality event, or ask what information I need…"
                  : `What should we capture in ${scopeDescription(sectionScope)}?`
                : sectionScope === CHAT_SECTION_SCOPE_ALL
                  ? "Ask the assistant to draft or improve a section…"
                  : `Ask the assistant to draft or improve ${scopeDescription(sectionScope)}…`
            }
            className="min-h-[40px] max-h-40 flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || initializing || !input.trim()}
            aria-label="Send message"
            className="flex size-9 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
