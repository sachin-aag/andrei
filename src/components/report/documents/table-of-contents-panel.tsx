"use client";

import { ArrowRight } from "lucide-react";
import type { SectionType } from "@/db/schema";
import type { TableOfContentsEntry } from "@/lib/document-types/convergent/table-of-contents";
import { cn } from "@/lib/utils";

type Props = {
  entries: TableOfContentsEntry[];
  onJumpToSection: (section: SectionType) => void;
};

const INDENT_STEP_PX = 14;
const BASE_INDENT_PX = 12;

export function TableOfContentsPanel({ entries, onJumpToSection }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-[var(--border)] px-3 py-2 text-[11px] leading-snug text-[var(--muted-foreground)]">
        Click a section to jump there in the document.
      </p>
      <nav aria-label="Table of contents" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {entries.map((entry) => (
            <TocEntryRow
              key={entry.label}
              entry={entry}
              depth={0}
              onJumpToSection={onJumpToSection}
            />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function TocEntryRow({
  entry,
  depth,
  onJumpToSection,
}: {
  entry: TableOfContentsEntry;
  depth: number;
  onJumpToSection: (section: SectionType) => void;
}) {
  const hasChildren = (entry.children?.length ?? 0) > 0;
  const isJumpTarget = entry.sectionKey != null && !hasChildren;
  const indentPx = BASE_INDENT_PX + depth * INDENT_STEP_PX;

  return (
    <li>
      {isJumpTarget ? (
        <button
          type="button"
          onClick={() => onJumpToSection(entry.sectionKey!)}
          title={`Jump to ${entry.label}`}
          className={cn(
            "group flex w-full items-center gap-1.5 rounded-md border-l-2 border-transparent py-1.5 pr-2 text-left transition-colors",
            "hover:border-[var(--primary)] hover:bg-[var(--secondary)]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
            depth === 0
              ? "text-sm font-medium text-[var(--foreground)]"
              : "text-[13px] font-normal text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]"
          )}
          style={{ paddingLeft: `${indentPx}px` }}
        >
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <ArrowRight
            aria-hidden="true"
            className="size-4 shrink-0 -translate-x-1 text-[var(--primary)] opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
          />
        </button>
      ) : (
        <span
          className={cn(
            "block py-1.5 pr-2 text-left",
            hasChildren
              ? "text-[13px] font-semibold text-[var(--foreground)]"
              : "text-sm text-[var(--muted-foreground)]"
          )}
          style={{ paddingLeft: `${indentPx}px` }}
        >
          {entry.label}
        </span>
      )}
      {hasChildren ? (
        <ul
          className="space-y-0.5 border-l border-[var(--border)] pl-1"
          style={{ marginLeft: `${indentPx + 2}px` }}
        >
          {entry.children!.map((child) => (
            <TocEntryRow
              key={child.label}
              entry={child}
              depth={depth + 1}
              onJumpToSection={onJumpToSection}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
