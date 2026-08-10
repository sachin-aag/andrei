"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isFileUIPart,
  type FileUIPart,
  type UIMessage,
  type UIMessagePart,
} from "ai";
import { formatDistanceToNow } from "date-fns";
import {
  Send,
  Sparkles,
  PencilLine,
  BookOpen,
  FileText,
  Loader2,
  Plus,
  History,
  ClipboardList,
  Wrench,
  Check,
  ArrowRightLeft,
  ImagePlus,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReportData } from "@/providers/report-provider";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import type { DocumentType, SectionType } from "@/db/schema";
import {
  CHAT_SECTION_SCOPE_ALL,
  chatEditableSections,
  sectionLabel as chatSectionLabel,
  type ChatSectionScope,
} from "@/lib/ai/chat/fields";
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_MAX_IMAGES_PER_MESSAGE,
  isAllowedChatImageMediaType,
} from "@/lib/ai/chat/image-parts";
import {
  detectSectionScopeMismatch,
  type SectionScopeMismatch,
} from "@/lib/ai/chat/section-intent";
import type { ChatSessionSummary } from "@/lib/ai/chat/sessions";
import {
  applyMentionToInput,
  filterMentionCandidates,
  findMentionQuery,
  mentionKey,
  type MentionCandidate,
  type MentionQuery,
} from "@/lib/ai/chat/mention-search";
import { compressImageFile } from "@/lib/images/compress-image";

type PendingChatImage = {
  id: string;
  part: FileUIPart;
};

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
  if (typeof section === "string") return chatSectionLabel(section as SectionType);
  return "section";
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

function ToolChip({
  info,
  onSwitchSectionScope,
  askUserActive,
  onAnswerQuestions,
}: {
  info: ToolPartInfo;
  onSwitchSectionScope?: (section: SectionType) => void;
  askUserActive?: boolean;
  onAnswerQuestions?: (message: string) => void;
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
    if (info.output?.status === "drafted") {
      return (
        <ToolLine icon={<FileText className="size-3.5 text-emerald-500" />} tone="success">
          Drafted {section}
          {field ? ` · ${field}` : ""} — review the full draft in the document.
        </ToolLine>
      );
    }
    const message =
      typeof info.output?.message === "string"
        ? info.output.message
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
        Switch to {sectionLabel(mismatch.suggestedSection)}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md px-2 py-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
      >
        Keep {sectionLabel(mismatch.currentSection)}
      </button>
    </div>
  );
}

function mentionIcon(type: MentionCandidate["type"]) {
  return type === "document" ? FileText : ClipboardList;
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
            <span className="max-w-40 truncate" title={mention.label}>
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

function MessageTurn({
  message,
  onSwitchSectionScope,
  askUserActive,
  onAnswerQuestions,
}: {
  message: UIMessage;
  onSwitchSectionScope?: (section: SectionType) => void;
  askUserActive?: boolean;
  onAnswerQuestions?: (message: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    const images = message.parts.filter(
      (p): p is FileUIPart => isFileUIPart(p) && p.mediaType.startsWith("image/")
    );
    if (!text && images.length === 0) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[92%] space-y-2 rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-sm text-[var(--primary-foreground)]">
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
              askUserActive={askUserActive}
              onAnswerQuestions={onAnswerQuestions}
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
    : sectionLabel(scope);
}

function SectionScopeSelect({
  value,
  onChange,
  disabled,
  documentType,
}: {
  value: ChatSectionScope;
  onChange: (scope: ChatSectionScope) => void;
  disabled?: boolean;
  documentType: DocumentType;
}) {
  const sections = chatEditableSections(documentType);
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
        {sections.map((section) => (
          <SelectItem key={section} value={section}>
            {sectionLabel(section)}
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
  const { attachments } = useReportAttachments();
  const [input, setInput] = useState("");
  const [mentions, setMentions] = useState<MentionCandidate[]>([]);
  const [mentionRange, setMentionRange] = useState<MentionQuery | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const [attaching, setAttaching] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

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
    const sections = chatEditableSections(report.documentType).map((section) => ({
      type: "section" as const,
      id: section,
      label: sectionLabel(section),
    }));
    return [...documents, ...sections];
  }, [attachments, report.documentType]);

  const mentionMatches = mentionRange
    ? filterMentionCandidates(mentionCandidates, mentionRange.query)
    : [];
  const mentionMenuOpen = mentionMatches.length > 0;
  const activeMentionIndex = Math.min(
    mentionIndex,
    Math.max(mentionMatches.length - 1, 0)
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
    [mentionRange]
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
    setPendingImages([]);
    setMentions([]);
    setMentionRange(null);
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
      if ((!trimmed && files.length === 0) || busy || initializing || attaching) return;
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
      setPendingImages([]);
      setMentionRange(null);
      if (trimmed) {
        setClientScopeSuggestion(
          detectSectionScopeMismatch(sectionScope, trimmed, report.documentType)
        );
      } else {
        setClientScopeSuggestion(null);
      }
      // Tags stay in the composer after sending so follow-ups ("now summarize
      // it") keep the same context until the engineer removes them.
      const body: Record<string, unknown> = { sessionId, mode, sectionScope };
      if (mentions.length > 0) {
        body.mentions = mentions.map((mention) => ({
          type: mention.type,
          id: mention.id,
        }));
      }
      if (trimmed && files.length > 0) {
        void sendMessage({ text: trimmed, files }, { body });
      } else if (files.length > 0) {
        void sendMessage({ files }, { body });
      } else {
        void sendMessage({ text: trimmed }, { body });
      }
    },
    [
      attaching,
      busy,
      initializing,
      currentSessionId,
      createSession,
      sendMessage,
      mode,
      sectionScope,
      pendingImages,
      mentions,
      report.documentType,
    ]
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
                  onClick={() => void send(p, [])}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--secondary)]/30 px-3 py-2 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <MessageTurn
              key={m.id}
              message={m}
              onSwitchSectionScope={applySectionScope}
              askUserActive={i === messages.length - 1 && !busy && !initializing}
              onAnswerQuestions={(answerText) => void send(answerText, [])}
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
              documentType={report.documentType}
            />
          </div>
        </div>
        {readOnly && mode === "agent" && (
          <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
            This report is read-only — the assistant can still discuss it, but proposed
            edits cannot be accepted.
          </p>
        )}
        <MentionChips mentions={mentions} onRemove={removeMention} />
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
            disabled={busy || initializing || attaching}
            aria-label="Attach image"
            title="Attach image"
            onClick={() => fileInputRef.current?.click()}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] disabled:opacity-40"
          >
            {attaching ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-4" aria-hidden="true" />
            )}
          </button>
          <div className="relative flex-1">
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
              role="combobox"
              aria-expanded={mentionMenuOpen}
              aria-controls={mentionMenuOpen ? "chat-mention-menu" : undefined}
              aria-activedescendant={
                mentionMenuOpen
                  ? `chat-mention-option-${activeMentionIndex}`
                  : undefined
              }
              onChange={(e) => {
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
                    ? "Describe the deviation, or type @ to tag a document or section…"
                    : `What should we capture in ${scopeDescription(sectionScope)}? Type @ to tag a document.`
                  : sectionScope === CHAT_SECTION_SCOPE_ALL
                    ? "Ask the assistant to draft or improve a section… type @ to tag a document"
                    : `Ask the assistant to draft or improve ${scopeDescription(sectionScope)}… @ to tag a document`
              }
              className="min-h-[40px] max-h-40 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={
              busy ||
              initializing ||
              attaching ||
              (!input.trim() && pendingImages.length === 0)
            }
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
