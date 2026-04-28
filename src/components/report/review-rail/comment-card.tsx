"use client";

import { useState } from "react";
import {
  Check,
  CornerDownRight,
  Loader2,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReport } from "@/providers/report-provider";
import { getUser } from "@/lib/auth/mock-users";
import { cn, formatDateTime } from "@/lib/utils";
import { SECTION_LABELS } from "@/types/sections";
import type { CommentRecord } from "@/types/report";

export function CommentCard({
  root,
  replies,
  active,
  onActivate,
}: {
  root: CommentRecord;
  replies: CommentRecord[];
  active: boolean;
  onActivate: () => void;
}) {
  const { report, setComments, currentUserId, requestCommentFocus, hoveredCommentIds, setHoveredCommentIds, clearHoveredCommentIds } = useReport();
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const author = getUser(root.authorId);

  const canReplyOrResolve =
    currentUserId === report.authorId ||
    getUser(currentUserId)?.role === "manager";

  const isAnchored = root.fromPos != null && root.toPos != null;
  const isHovered = hoveredCommentIds.includes(root.id);

  const postReply = async () => {
    if (!reply.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: reply.trim(),
          parentId: root.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to post reply");
        return;
      }
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setReply("");
      toast.success("Reply posted");
    } finally {
      setPosting(false);
    }
  };

  const patchStatus = async (status: "open" | "resolved") => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/comments/${root.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error("Update failed");
        return;
      }
      const data = await res.json();
      setComments((prev) => prev.map((c) => (c.id === root.id ? data.comment : c)));
    } finally {
      setUpdating(false);
    }
  };

  const handleActivate = () => {
    onActivate();
    if (isAnchored) requestCommentFocus(root.id);
  };

  const initials =
    (author?.name ?? "?")
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("") || "?";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onMouseEnter={() => setHoveredCommentIds([root.id])}
      onMouseLeave={() => clearHoveredCommentIds()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      className={cn(
        "rounded-md border bg-[var(--card)] shadow-sm text-left transition-all overflow-hidden cursor-pointer",
        active
          ? "border-amber-500 ring-2 ring-amber-400/30 bg-amber-50/60"
          : isHovered
            ? "border-amber-400 ring-1 ring-amber-300/40 bg-amber-50/40"
            : root.status === "resolved"
              ? "border-[var(--border)]/70 opacity-80"
              : "border-[var(--border)] hover:border-amber-500/50"
      )}
    >
      <div className="px-3 py-2 flex items-start gap-2">
        <div className="size-7 rounded-full bg-[var(--brand-600)] flex items-center justify-center text-[10px] font-semibold shrink-0 text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold truncate">
              {author?.name ?? "Unknown"}
            </span>
            {root.status === "resolved" ? (
              <span className="text-[10px] text-green-700 flex items-center gap-0.5">
                <Check className="size-3 shrink-0" />
                Resolved
              </span>
            ) : (
              <span className="text-[10px] text-amber-800">Open</span>
            )}
            {!isAnchored && root.section && (
              <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide ml-auto">
                {SECTION_LABELS[root.section] ?? root.section}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--foreground)] mt-1 whitespace-pre-wrap leading-snug">
            {root.content}
          </p>
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {formatDateTime(root.createdAt)}
          </span>
        </div>
      </div>

      {/* Collapsed reply indicator -- visible when card is NOT active */}
      {!active && replies.length > 0 && (() => {
        const lastReply = replies[replies.length - 1];
        const lastAuthor = getUser(lastReply.authorId);
        const uniqueAuthors = [...new Set(replies.map((r) => r.authorId))];
        return (
          <div className="px-3 py-1.5 border-t border-[var(--border)]/50 flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <div className="flex -space-x-1.5">
              {uniqueAuthors.slice(0, 3).map((uid) => {
                const u = getUser(uid);
                const ini = (u?.name ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("") || "?";
                return (
                  <div
                    key={uid}
                    className="size-4 rounded-full bg-[var(--brand-600)]/80 flex items-center justify-center text-[7px] font-semibold text-white ring-1 ring-[var(--card)]"
                  >
                    {ini}
                  </div>
                );
              })}
            </div>
            <span className="truncate">
              <span className="font-medium text-[var(--foreground)]">{lastAuthor?.name ?? "Unknown"}</span>
              {" replied"}
            </span>
            {replies.length > 1 && (
              <span className="shrink-0">· {replies.length} replies</span>
            )}
          </div>
        );
      })()}

      {active && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--border)]/70 bg-[var(--secondary)]/20 pt-2">
          {replies.length > 0 && (
            <ul className="space-y-2">
              {replies.map((r) => {
                const ra = getUser(r.authorId);
                return (
                  <li key={r.id} className="text-xs">
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)] mb-0.5">
                      <CornerDownRight className="size-3 shrink-0" />
                      <span className="font-medium text-[var(--foreground)]">
                        {ra?.name ?? "Unknown"}
                      </span>
                      <span>· {formatDateTime(r.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap pl-4 leading-snug">
                      {r.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {canReplyOrResolve && root.status === "open" && (
            <div
              className="space-y-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply…"
                className="min-h-[56px] text-xs bg-[var(--input)]"
                maxLength={512}
              />
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[10px] tabular-nums",
                  reply.length > 480 ? "text-red-500" : "text-[var(--muted-foreground)]"
                )}>
                  {reply.length}/512
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={updating}
                    onClick={() => patchStatus("resolved")}
                  >
                    {updating ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Resolve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={posting || !reply.trim() || reply.length > 512}
                    onClick={postReply}
                  >
                    {posting ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <MessageSquare className="size-3" />
                    )}
                    Reply
                  </Button>
                </div>
              </div>
            </div>
          )}

          {canReplyOrResolve && root.status === "resolved" && (
            <div
              className="flex justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                disabled={updating}
                onClick={() => patchStatus("open")}
              >
                {updating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RotateCcw className="size-3" />
                )}
                Re-open
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
