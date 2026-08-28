"use client";

import type { SectionType } from "@/db/schema";
import type { TableOfContentsEntry } from "@/lib/document-types/convergent/table-of-contents";
import { cn } from "@/lib/utils";

type Props = {
  entries: TableOfContentsEntry[];
  onJumpToSection: (section: SectionType) => void;
};

export function TableOfContentsPanel({ entries, onJumpToSection }: Props) {
  return (
    <nav aria-label="Table of contents" className="min-h-0 flex-1 overflow-y-auto p-2">
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

  return (
    <li>
      {isJumpTarget ? (
        <button
          type="button"
          onClick={() => onJumpToSection(entry.sectionKey!)}
          className={cn(
            "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
            "text-[var(--foreground)] hover:bg-[var(--secondary)]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
            depth > 0 && "text-[var(--muted-foreground)]"
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {entry.label}
        </button>
      ) : (
        <span
          className={cn(
            "block px-2 py-1.5 text-xs font-medium text-[var(--foreground)]",
            depth > 0 && "font-normal text-[var(--muted-foreground)]"
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {entry.label}
        </span>
      )}
      {hasChildren ? (
        <ul className="space-y-0.5">
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
