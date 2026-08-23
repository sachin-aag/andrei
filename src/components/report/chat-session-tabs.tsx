"use client";

import { useEffect, useRef } from "react";
import { Check, CircleHelp, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chatSessionTabStatusLabel,
  type ChatSessionTabItem,
  type ChatSessionTabStatus,
} from "@/lib/ai/chat/session-tab";

function TabStatusIcon({ status }: { status: ChatSessionTabStatus }) {
  switch (status) {
    case "running":
      return (
        <Loader2
          className="size-3 shrink-0 animate-spin text-[var(--primary)]"
          aria-hidden
        />
      );
    case "questions":
      return (
        <CircleHelp
          className="size-3 shrink-0 text-[var(--primary)]"
          aria-hidden
        />
      );
    case "done":
      return (
        <Check
          className="size-3 shrink-0 text-[var(--success)]"
          aria-hidden
        />
      );
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function ChatSessionTabs({
  items,
  currentId,
  onSelect,
  onClose,
}: {
  items: readonly ChatSessionTabItem[];
  currentId: string | null;
  onSelect: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}) {
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = selectedRef.current;
    if (typeof selected?.scrollIntoView !== "function") return;
    selected.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [currentId]);

  if (items.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open chats"
      className="chat-session-tabs flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden overscroll-x-contain"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        if (items.length < 2) return;
        const index = items.findIndex((item) => item.id === currentId);
        if (index < 0) return;
        event.preventDefault();
        const next =
          event.key === "ArrowRight"
            ? Math.min(items.length - 1, index + 1)
            : Math.max(0, index - 1);
        const item = items[next];
        if (item) onSelect(item.id);
      }}
    >
      {items.map((item) => {
        const selected = item.id === currentId;
        const statusLabel = chatSessionTabStatusLabel(item.status);
        return (
          <div
            key={item.id}
            ref={selected ? selectedRef : undefined}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={item.title}
            aria-label={`${item.title}. ${statusLabel}`}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelect(item.id);
            }}
            className={cn(
              "relative flex h-7 max-w-[13rem] shrink-0 cursor-pointer items-center gap-1 border-r border-[var(--border)] py-0 pl-2 pr-1 text-[11px] transition-colors",
              selected
                ? "bg-[var(--secondary)] font-medium text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/70 hover:text-[var(--foreground)]"
            )}
          >
            <TabStatusIcon status={item.status} />
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <button
              type="button"
              aria-label={`Close ${item.title}`}
              title="Close chat"
              onClick={(event) => {
                event.stopPropagation();
                onClose(item.id);
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--foreground)]/70 transition-colors hover:bg-[var(--border)] hover:text-[var(--foreground)]"
            >
              <X className="size-3.5" strokeWidth={2.25} aria-hidden />
            </button>
            {selected ? (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--primary)]"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
