"use client";

import type { RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Folder,
  LineChart,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MENTIONS_ATTACHMENTS_GROUP,
  MENTIONS_PLOTS_GROUP,
  MENTIONS_SECTIONS_GROUP,
  MENTIONS_SHEETS_GROUP,
  type MentionMenuEntry,
  type MentionMenuGroup,
} from "@/lib/ai/chat/mention-menu";
import { mentionKey, type MentionCandidate } from "@/lib/ai/chat/mention-search";

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

function groupIcon(id: string) {
  if (id === MENTIONS_SHEETS_GROUP) return Table2;
  if (id === MENTIONS_SECTIONS_GROUP) return ClipboardList;
  if (id === MENTIONS_PLOTS_GROUP) return LineChart;
  if (id === MENTIONS_ATTACHMENTS_GROUP || id.startsWith("folder:")) {
    return Folder;
  }
  return Folder;
}

function entryKey(entry: MentionMenuEntry): string {
  return entry.kind === "group"
    ? `group:${entry.id}`
    : mentionKey(entry.candidate.type, entry.candidate.id);
}

export function ChatMentionMenu({
  entries,
  activeIndex,
  groupLabel,
  canGoBack,
  emptyLabel,
  position,
  menuRef,
  onSelectItem,
  onSelectGroup,
  onBack,
}: {
  entries: MentionMenuEntry[];
  activeIndex: number;
  groupLabel: string | null;
  canGoBack: boolean;
  emptyLabel: string;
  position: { top: number; left: number } | null;
  menuRef?: RefObject<HTMLDivElement | null>;
  onSelectItem: (candidate: MentionCandidate) => void;
  onSelectGroup: (group: MentionMenuGroup) => void;
  onBack: () => void;
}) {
  return (
    <div
      ref={menuRef}
      id="chat-mention-menu"
      data-testid="chat-mention-menu"
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: 0, left: 0, visibility: "hidden" }
      }
      className="absolute z-50 w-64 max-w-[min(100%,16rem)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] py-0.5 shadow-md"
    >
      {canGoBack ? (
        <button
          type="button"
          data-testid="chat-mention-back"
          aria-label={`Back to ${groupLabel ?? "tags"}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onBack();
          }}
          className="flex w-full items-center gap-1 border-b border-[var(--border)] px-1.5 py-1 text-left text-[11px] text-[var(--foreground)] hover:bg-[var(--secondary)]"
        >
          <ChevronLeft className="size-3 shrink-0 text-[var(--muted-foreground)]" />
          <span className="truncate">{groupLabel ?? "Tags"}</span>
        </button>
      ) : null}
      {entries.length === 0 ? (
        <p className="px-2 py-1.5 text-[11px] text-[var(--muted-foreground)]">
          {emptyLabel}
        </p>
      ) : (
        <div
          role="listbox"
          aria-label={groupLabel ? `${groupLabel} tags` : "Tag a file, section, or sheet"}
          className="max-h-52 overflow-y-auto px-0.5"
        >
          {entries.map((entry, index) => {
            const selected = index === activeIndex;
            if (entry.kind === "group") {
              const Icon = groupIcon(entry.id);
              return (
                <button
                  key={entryKey(entry)}
                  id={`chat-mention-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`chat-mention-group-${entry.id}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectGroup(entry);
                  }}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:bg-[var(--secondary)]",
                    selected && "bg-[var(--secondary)]"
                  )}
                >
                  <Icon
                    className="size-3 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.sublabel ? (
                    <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
                      {entry.sublabel}
                    </span>
                  ) : null}
                  <ChevronRight
                    className="size-3 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                </button>
              );
            }

            const Icon = mentionIcon(entry.candidate.type);
            return (
              <button
                key={entryKey(entry)}
                id={`chat-mention-option-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectItem(entry.candidate);
                }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:bg-[var(--secondary)]",
                  selected && "bg-[var(--secondary)]"
                )}
              >
                <Icon
                  className="size-3 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    entry.candidate.type === "document" && "font-mono tracking-tight"
                  )}
                >
                  {entry.candidate.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
