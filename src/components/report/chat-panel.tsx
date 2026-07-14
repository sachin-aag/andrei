"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type UIMessagePart } from "ai";
import { Send, Sparkles, PencilLine, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useReportData } from "@/providers/report-provider";
import { SECTION_LABELS } from "@/types/sections";

const EXAMPLE_PROMPTS = [
  "Tighten the problem statement in the Define section.",
  "Suggest a clearer root cause statement in Analyze.",
  "Add a sentence to the Conclusion summarizing the outcome.",
];

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

function ToolChip({ info }: { info: ToolPartInfo }) {
  const pending = info.state === "input-streaming" || info.state === "input-available";

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

  return (
    <ToolLine icon={<Sparkles className="size-3.5" />}>{info.toolName}</ToolLine>
  );
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

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          const text = (part as { text: string }).text;
          if (!text.trim()) return null;
          return (
            <div
              key={i}
              className={cn(
                "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                isUser
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--secondary)] text-[var(--foreground)]"
              )}
            >
              {text}
            </div>
          );
        }
        const tool = readToolPart(part as UIMessagePart<never, never>);
        if (tool) return <ToolChip key={i} info={tool} />;
        return null;
      })}
    </div>
  );
}

export function ChatPanel() {
  const { report, refresh, readOnly } = useReportData();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    id: `report-chat-${report.id}`,
    transport: new DefaultChatTransport({
      api: `/api/reports/${report.id}/chat`,
    }),
    onFinish: () => {
      // Pull any newly-proposed ai_fix comments into report state so the
      // inline diff + gutter card render (reuses the suggestion pipeline).
      void refresh();
    },
    onError: (err) => {
      console.error("chat error", err);
      toast.error("The assistant hit an error. Please try again.");
    },
  });

  const busy = status === "submitted" || status === "streaming";

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput("");
      void sendMessage({ text: trimmed });
    },
    [busy, sendMessage]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Sparkles className="size-4 text-[var(--primary)]" />
        <span className="text-sm font-medium">Drafting assistant</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Ask me to improve any section. I read the report and propose targeted
              edits you can accept or reject in the document.
            </p>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => send(p)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--secondary)]/30 px-3 py-2 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="size-3.5 animate-spin" />
            Thinking…
          </div>
        )}
        {error && (
          <p className="text-xs text-red-500">Something went wrong. Try again.</p>
        )}
      </div>

      <form
        className="border-t border-[var(--border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {readOnly && (
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
                send(input);
              }
            }}
            rows={2}
            placeholder="Ask the assistant to improve a section…"
            className="min-h-[40px] max-h-40 flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
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
