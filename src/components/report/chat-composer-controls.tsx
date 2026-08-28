"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  FileText,
  Loader2,
  MessageCircleQuestionMark,
  Telescope,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatPace } from "@/lib/ai/chat/pace";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";
import type { WorkProductView } from "@/components/report/workspace-chrome";

export type ComposerOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  icon: LucideIcon;
  disabled?: boolean;
};

/**
 * Wire values are unchanged — `plan` is labelled "Ask" because that is what it
 * does from the engineer's side.
 */
export const DOCUMENT_CHAT_MODE_OPTIONS: readonly ComposerOption<ChatMode>[] = [
  {
    value: "plan",
    label: "Ask",
    description: "Answers questions about the report. Never edits the document.",
    icon: MessageCircleQuestionMark,
  },
  {
    value: "agent",
    label: "Agent",
    description: "Drafts and proposes edits you accept or reject.",
    icon: Wrench,
  },
];

export const ANALYTICS_CHAT_MODE_OPTIONS: readonly ComposerOption<ChatMode>[] = [
  {
    value: "plan",
    label: "Ask",
    description:
      "Answers from attachments and the worksheet. Never fills columns or runs plots.",
    icon: MessageCircleQuestionMark,
  },
  {
    value: "agent",
    label: "Agent",
    description: "Fills the worksheet, runs a sixpack, and plots measurements.",
    icon: Wrench,
  },
];

/**
 * Pace, never a model name. The description is the only explanation a user
 * gets, so it says what changes for them — not what runs underneath.
 */
export const CHAT_WORK_PRODUCT_OPTIONS: readonly ComposerOption<WorkProductView>[] =
  [
    {
      value: "report",
      label: "Report",
      description: "Draft and edit the document.",
      icon: FileText,
    },
    {
      value: "analytics",
      label: "Analytics",
      description: "Fill the worksheet and run plots.",
      icon: BarChart3,
    },
  ];

export const CHAT_PACE_OPTIONS: readonly ComposerOption<ChatPace>[] = [
  {
    value: "quick",
    label: "Quick",
    description:
      "Fast answers with lighter reasoning. Handles most questions, lookups, and short edits.",
    icon: Zap,
  },
  {
    value: "deep",
    label: "Deep",
    description:
      "Digs through your documents and reasons further before answering. Slower.",
    icon: Telescope,
  },
];

/**
 * Radix Tooltip also opens on focus. Opening a Select focuses the current
 * option, which would flash its description immediately. Gate on pointer
 * hover so the text only appears when the mouse is over that row.
 */
function HoverOnlyTooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hoverIntentRef = useRef(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next) {
          if (hoverIntentRef.current) setOpen(true);
          return;
        }
        hoverIntentRef.current = false;
        setOpen(false);
      }}
    >
      <TooltipTrigger asChild>
        <span
          className="block"
          onPointerEnter={() => {
            hoverIntentRef.current = true;
          }}
          onPointerLeave={() => {
            hoverIntentRef.current = false;
          }}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" align="center" collisionPadding={8}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Select for the composer control strip. Explanations live on hover so the
 * open menu stays as wide as the label — the closed trigger is an icon and
 * one word.
 */
export function ComposerSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  className,
  testId,
}: {
  value: T;
  options: readonly ComposerOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  testId?: string;
}) {
  const active = options.find((option) => option.value === value) ?? options[0];
  const ActiveIcon = active.icon;
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const selected = options.find((option) => option.value === next);
        if (!selected) return;
        onChange(selected.value);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "h-7 border-[var(--border)] bg-[var(--secondary)]/30 px-2 text-[11px] font-medium",
          className
        )}
        aria-label={ariaLabel}
        title={active.description}
        data-testid={testId}
      >
        {/* A div, not a span: the trigger line-clamps direct span children,
            which would override the flex layout. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <ActiveIcon className="size-3.5 shrink-0" />
          <SelectValue />
        </div>
      </SelectTrigger>
      {/* Opens upward: the control strip sits at the bottom of the panel. */}
      <SelectContent side="top" sideOffset={6} className="text-[11px]">
        <TooltipProvider delayDuration={150}>
          {options.map((option) => (
            <HoverOnlyTooltip key={option.value} content={option.description}>
              {/* The wrapper, not the item, is the hover target: a disabled
                  option has pointer events off, and its lock reason is the
                  one description a user most needs to read. */}
              <SelectItem
                value={option.value}
                disabled={option.disabled}
                className="text-[11px]"
              >
                {option.label}
              </SelectItem>
            </HoverOnlyTooltip>
          ))}
        </TooltipProvider>
      </SelectContent>
    </Select>
  );
}

export function ChatBusyStatus({
  mode,
  stale,
  background,
  willNotify,
  onCancel,
}: {
  mode: ChatMode;
  stale: boolean;
  background: boolean;
  willNotify: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <Loader2 className="size-3.5 animate-spin" />
        <span>
          {background
            ? "Still working in the background…"
            : stale
              ? "Still working — this can take a few minutes."
              : mode === "plan"
                ? "Thinking through your question…"
                : "Working…"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="underline decoration-[var(--border)] underline-offset-2 transition-colors hover:text-[var(--foreground)]"
        >
          Cancel
        </button>
      </div>
      {willNotify ? (
        <p className="pl-[22px] text-xs text-[var(--muted-foreground)]">
          We&apos;ll notify you when this is complete.
        </p>
      ) : null}
    </div>
  );
}
