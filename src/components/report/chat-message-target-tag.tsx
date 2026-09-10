"use client";

import { CHAT_WORK_PRODUCT_OPTIONS } from "@/components/report/chat-composer-controls";
import {
  chatMessageTargetLabel,
  type ChatMessageTarget,
} from "@/lib/ai/chat/message-target";
import { cn } from "@/lib/utils";

export function ChatMessageTargetTag({
  target,
  className,
}: {
  target: ChatMessageTarget | null;
  className?: string;
}) {
  if (!target) return null;
  const option = CHAT_WORK_PRODUCT_OPTIONS.find((item) => item.value === target);
  if (!option) return null;
  const Icon = option.icon;
  const label = chatMessageTargetLabel(target);
  return (
    <span
      data-testid={`chat-message-target-${target}`}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]",
        className
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
