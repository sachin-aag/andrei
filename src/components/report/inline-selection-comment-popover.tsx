"use client";

import { Loader2, MessageSquarePlus } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function InlineSelectionCommentPopover({
  anchorRect,
  composing,
  draft,
  posting,
  onDraftChange,
  onStartCompose,
  onCancel,
  onPost,
}: {
  anchorRect: DOMRect;
  composing: boolean;
  draft: string;
  posting: boolean;
  onDraftChange: (next: string) => void;
  onStartCompose: () => void;
  onCancel: () => void;
  onPost: () => void;
}) {
  const top = anchorRect.bottom + 8;
  const left = Math.min(
    anchorRect.left,
    typeof window !== "undefined" ? window.innerWidth - 300 : anchorRect.left
  );

  return createPortal(
    <div
      className="fixed z-[200] rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg"
      style={{ top, left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {!composing ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onMouseDown={(e) => {
            e.preventDefault();
            onStartCompose();
          }}
        >
          <MessageSquarePlus className="size-3" />
          Comment on selection
        </Button>
      ) : (
        <div className="flex flex-col gap-2 w-[min(280px,calc(100vw-2rem))]">
          <span className="text-xs font-medium text-[var(--foreground)]">
            Comment
          </span>
          <Textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Write your comment…"
            className="min-h-[72px] text-sm bg-[var(--input)] resize-y"
            maxLength={1024}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-[10px] tabular-nums",
                draft.length > 960
                  ? "text-red-500"
                  : "text-[var(--muted-foreground)]"
              )}
            >
              {draft.length}/1024
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onPost}
                disabled={posting || !draft.trim() || draft.length > 1024}
              >
                {posting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  "Post"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
