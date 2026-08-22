"use client";

import { useEffect, useRef } from "react";
import { Check, CircleHelp, Loader2 } from "lucide-react";
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
}: {
  items: readonly ChatSessionTabItem[];
  currentId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

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
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
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
          <button
            key={item.id}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={item.title}
            aria-label={`${item.title}. ${statusLabel}`}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex h-6 max-w-[10.5rem] shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] transition-colors",
              selected
                ? "border-[var(--border)] bg-[var(--secondary)] font-medium text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/70 hover:text-[var(--foreground)]"
            )}
          >
            <TabStatusIcon status={item.status} />
            <span className="min-w-0 truncate">{item.title}</span>
          </button>
        );
      })}
    </div>
  );
}
