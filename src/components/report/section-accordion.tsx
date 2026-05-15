"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SECTION_LABELS } from "@/types/sections";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import type { SectionType } from "@/db/schema";

type SectionAccordionProps = {
  section: SectionType;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  onJumpToSection?: (section: SectionType) => void;
  /** Optional status dot color class (e.g. "bg-green-500") */
  statusColor?: string;
  /** Optional trailing label (e.g. "3/5") */
  trailingLabel?: string;
  /** Optional busy overlay effect */
  busy?: boolean;
  /** Optional busy label text */
  busyLabel?: string;
  busySpinning?: boolean;
  children: React.ReactNode;
};

export function SectionAccordion({
  section,
  count,
  isOpen,
  onToggle,
  onJumpToSection,
  statusColor,
  trailingLabel,
  busy,
  busyLabel,
  busySpinning,
  children,
}: SectionAccordionProps) {
  return (
    <div
      data-section={section}
      className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden"
    >
      <div className="flex items-center gap-1 hover:bg-[var(--secondary)]">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`sidebar-section-${section}`}
          className="min-w-0 flex-1 flex items-center gap-2 px-3 py-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          onClick={onToggle}
        >
          {isOpen ? (
            <ChevronDown
              className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
          ) : (
            <ChevronRight
              className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
          )}
          {statusColor && (
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 rounded-full shrink-0 transition-opacity",
                statusColor,
                busy && "opacity-40",
              )}
            />
          )}
          <span
            className={cn(
              "text-sm font-semibold flex-1 truncate transition-opacity",
              busy && "opacity-60",
            )}
          >
            {SECTION_LABELS[section] ?? section}
          </span>
          {busyLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] truncate">
              {busySpinning ? (
                <span className="size-3 animate-spin rounded-full border-2 border-[var(--muted-foreground)] border-t-transparent" />
              ) : (
                <span
                  className="size-1.5 rounded-full bg-amber-400 animate-pulse"
                  aria-hidden="true"
                />
              )}
              <span className="hidden sm:inline">{busyLabel}</span>
            </span>
          )}
          {trailingLabel && (
            <span
              className={cn(
                "text-[10px] text-[var(--muted-foreground)] transition-opacity",
                busy && "opacity-60",
              )}
            >
              {trailingLabel}
            </span>
          )}
          {!trailingLabel && (
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {count}
            </span>
          )}
        </button>
        {onJumpToSection && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-2 h-6 px-2 text-[10px]"
            onClick={() => onJumpToSection(section)}
          >
            Jump
          </Button>
        )}
      </div>

      {isOpen && count > 0 && (
        <div
          id={`sidebar-section-${section}`}
          className="border-t border-[var(--border)] bg-[var(--secondary)]/30 px-3 py-2 space-y-1.5"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Hook to manage open/closed state of section accordions */
export function useSectionAccordionState(defaultOpen = true) {
  const [openSections, setOpenSections] = useState<Set<SectionType>>(
    () => new Set(defaultOpen ? EVALUATABLE_SECTIONS : []),
  );

  const toggle = (section: SectionType) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return { openSections, toggle };
}
