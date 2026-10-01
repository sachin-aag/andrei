"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentType } from "@/db/schema";
import {
  chatPlanProgressView,
  planHasRemainingWork,
  type ChatPendingPlan,
  type LivePlanProgress,
} from "@/lib/ai/chat/pending-plan";

export function ChatPlanProgress({
  plan,
  documentType,
  live,
  active = false,
}: {
  plan: ChatPendingPlan;
  documentType: DocumentType;
  live?: LivePlanProgress | null;
  active?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!planHasRemainingWork(plan)) return null;
  const view = chatPlanProgressView(plan, documentType, live);
  if (view.complete) return null;
  const spinning = active && !view.paused;

  return (
    <div className="flex justify-center" data-testid="chat-plan-progress">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={view.chipLabel}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          {view.paused ? (
            <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-px text-[10px]">
              Paused
            </span>
          ) : spinning ? (
            <Loader2
              className="size-3 shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{view.chipLabel}</span>
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
          )}
        </button>
        {expanded ? (
          <div
            className="space-y-2 border-t border-[var(--border)] px-3 py-2"
            data-testid="chat-plan-progress-list"
          >
            <PlanProgressGroup
              label="Done"
              items={view.done}
              icon="done"
            />
            <PlanProgressGroup
              label="In progress"
              items={view.current}
              icon={spinning ? "current" : "pending"}
            />
            <PlanProgressGroup
              label="Pending"
              items={view.pending}
              icon="pending"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlanProgressGroup({
  label,
  items,
  icon,
}: {
  label: string;
  items: ChatPendingPlan["items"];
  icon: "done" | "current" | "pending";
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li
            key={item.sectionKey}
            className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--foreground)]"
          >
            {icon === "done" ? (
              <Check
                className="mt-0.5 size-3 shrink-0 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            ) : icon === "current" ? (
              <Loader2
                className="mt-0.5 size-3 shrink-0 animate-spin text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            ) : (
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--border)]"
                aria-hidden="true"
              />
            )}
            <span className={cn(icon === "pending" && "text-[var(--muted-foreground)]")}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
