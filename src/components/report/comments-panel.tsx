"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MessageSquarePlus,
  Check,
  CornerDownRight,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReport } from "@/providers/report-provider";
import { getUser } from "@/lib/auth/mock-users";
import { SECTION_LABELS } from "@/types/sections";
import { cn, formatDateTime } from "@/lib/utils";
import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import type { WorkspaceMode } from "./report-workspace";

type Filter = "all" | "open" | "resolved";

function previewText(s: string, max = 120) {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + "…";
}

export function CommentsPanel({
  mode,
  activeSection,
  onNavigateToSection,
}: {
  mode: WorkspaceMode;
  activeSection: SectionType;
  onNavigateToSection?: (section: SectionType) => void;
}) {
  const {
    report,
    comments,
    setComments,
    currentUserId,
    getSectionId,
    activeCommentId,
    setActiveCommentId,
    requestCommentFocus,
  } = useReport();
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const canStartSidebarThread = mode === "review" && getUser(currentUserId)?.role === "manager";

  const canReplyOrResolve =
    currentUserId === report.authorId || getUser(currentUserId)?.role === "manager";

  const byParent = useMemo(() => {
    const m = new Map<string | null, CommentRecord[]>();
    for (const c of comments) {
      const k = c.parentId ?? null;
      const arr = m.get(k) ?? [];
      arr.push(c);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return m;
  }, [comments]);

  const rootComments = useMemo(() => {
    const roots = byParent.get(null) ?? [];
    return [...roots].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [byParent]);

  const visibleRoots = useMemo(() => {
    if (filter === "all") return rootComments;
    if (filter === "open") return rootComments.filter((c) => c.status === "open");
    return rootComments.filter((c) => c.status === "resolved");
  }, [rootComments, filter]);

  useEffect(() => {
    if (!activeCommentId) return;
    const el = itemRefs.current[activeCommentId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeCommentId]);

  const postSectionComment = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const sectionId = getSectionId(activeSection);
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draft.trim(),
          section: activeSection,
          sectionId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to post comment");
        return;
      }
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setActiveCommentId(data.comment.id);
      setDraft("");
      toast.success("Comment posted");
    } finally {
      setPosting(false);
    }
  };

  const postReply = async (parentId: string) => {
    const text = (replyDrafts[parentId] ?? "").trim();
    if (!text) return;
    setReplying((r) => ({ ...r, [parentId]: true }));
    try {
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          parentId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to post reply");
        return;
      }
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setReplyDrafts((d) => ({ ...d, [parentId]: "" }));
      toast.success("Reply posted");
    } finally {
      setReplying((r) => ({ ...r, [parentId]: false }));
    }
  };

  const patchComment = async (id: string, body: { status?: "open" | "resolved" }) => {
    const res = await fetch(`/api/reports/${report.id}/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Update failed");
      return;
    }
    const data = await res.json();
    setComments((prev) => prev.map((c) => (c.id === id ? data.comment : c)));
  };

  const openThread = (root: CommentRecord) => {
    if (activeCommentId === root.id) {
      setActiveCommentId(null);
      return;
    }
    setActiveCommentId(root.id);
    if (root.section && onNavigateToSection) {
      onNavigateToSection(root.section);
    }
    if (root.fromPos != null && root.toPos != null) {
      requestCommentFocus(root.id);
    }
  };

  return (
    <div className="flex min-h-0 h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          {(["all", "open", "resolved"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={cn(
                "text-xs px-2 py-0.5 rounded border",
                filter === f
                  ? "border-[var(--brand-600)] bg-[var(--brand-600)]/10 text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "open" ? "Open" : "Resolved"}
            </button>
          ))}
        </div>

        {canStartSidebarThread && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 space-y-2">
            <Label>
              Add comment on {SECTION_LABELS[activeSection] ?? activeSection}
            </Label>
            <p className="text-[10px] text-[var(--muted-foreground)]">
              For text-specific notes, select text in the editor and use the bubble menu. This adds a
              section-level note.
            </p>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a comment for the author…"
              className="min-h-[64px] bg-[var(--input)] text-sm"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={postSectionComment} disabled={posting}>
                {posting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <MessageSquarePlus className="size-3" />
                )}
                Post
              </Button>
            </div>
          </div>
        )}

        {!canStartSidebarThread && (
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Select text and add a comment from the bubble menu. Highlighted text shows a bubble; click
            either to open the thread here.
          </p>
        )}

        <div className="space-y-2">
        {visibleRoots.length === 0 ? (
          <div className="text-xs text-[var(--muted-foreground)] italic text-center py-6">
            {filter === "resolved"
              ? "No resolved threads."
              : filter === "open"
                ? "No open threads."
                : "No comments yet."}
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleRoots.map((root) => {
              const author = getUser(root.authorId);
              const replies = byParent.get(root.id) ?? [];
              const expanded = activeCommentId === root.id;

              return (
                <li key={root.id}>
                  <div
                    ref={(el) => {
                      itemRefs.current[root.id] = el;
                    }}
                    id={`comment-thread-${root.id}`}
                    className={cn(
                      "rounded-md border text-sm overflow-hidden transition-colors",
                      expanded
                        ? "border-amber-600/50 bg-amber-50/90 shadow-sm"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-amber-600/30"
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left flex items-start gap-2 p-2.5",
                        expanded && "border-b border-amber-600/20 bg-amber-100/40"
                      )}
                      onClick={() => openThread(root)}
                    >
                      <div className="size-7 rounded-full bg-[var(--brand-600)] flex items-center justify-center text-[10px] font-semibold shrink-0 text-white">
                        {(author?.name ?? "?")
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
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
                        </div>
                        {!expanded && (
                          <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 line-clamp-2">
                            {previewText(root.content)}
                          </p>
                        )}
                        <span className="text-[10px] text-[var(--muted-foreground)]">
                          {formatDateTime(root.createdAt)}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform mt-0.5",
                          expanded && "rotate-180"
                        )}
                      />
                    </button>

                    {expanded && (
                      <div className="p-3 pt-2 space-y-3">
                        <div
                          className={cn(
                            "flex gap-2 items-stretch min-h-[72px]",
                            canReplyOrResolve ? "flex-row" : "flex-col"
                          )}
                        >
                          <div
                            className={cn(
                              "flex min-h-0 flex-col gap-1",
                              canReplyOrResolve ? "flex-[4] min-w-0 basis-0" : "w-full"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 px-0.5">
                              <span className="text-[10px] font-medium text-[var(--muted-foreground)]">
                                Original comment
                              </span>
                              <span
                                className="rounded border border-[var(--border)] bg-[var(--secondary)] px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]"
                                aria-hidden
                              >
                                Read-only
                              </span>
                            </div>
                            <div
                              role="textbox"
                              aria-multiline
                              aria-readonly="true"
                              aria-label="Original comment (read-only)"
                              tabIndex={0}
                              className={cn(
                                "min-h-[72px] rounded-md border border-dashed border-[var(--border)]",
                                "bg-[var(--secondary)]/70 px-3 py-2 text-xs leading-relaxed text-[var(--foreground)]",
                                "shadow-none outline-none focus-visible:ring-0",
                                "cursor-default select-text whitespace-pre-wrap overflow-y-auto"
                              )}
                            >
                              {root.content}
                            </div>
                          </div>
                          {canReplyOrResolve && root.status === "open" && (
                            <div className="flex-[1] min-w-0 basis-0 flex flex-col justify-start">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-full min-h-[72px] w-full text-[10px] px-1 py-2 flex flex-col gap-1 justify-center"
                                onClick={() => patchComment(root.id, { status: "resolved" })}
                              >
                                <Check className="size-3.5 shrink-0" />
                                Resolve
                              </Button>
                            </div>
                          )}
                          {canReplyOrResolve && root.status === "resolved" && (
                            <div className="flex-[1] min-w-0 basis-0 flex flex-col justify-start">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-full min-h-[72px] w-full text-[10px] px-1 py-2 flex flex-col gap-1 justify-center"
                                onClick={() => patchComment(root.id, { status: "open" })}
                              >
                                <RotateCcw className="size-3.5 shrink-0" />
                                Re-open
                              </Button>
                            </div>
                          )}
                        </div>

                        {replies.length > 0 && (
                          <ul className="ml-1 pl-3 border-l border-amber-600/25 space-y-2">
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
                                  <p className="whitespace-pre-wrap pl-4">{r.content}</p>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {canReplyOrResolve && root.status === "open" && (
                          <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
                            <Label className="text-[10px]">Reply</Label>
                            <Textarea
                              value={replyDrafts[root.id] ?? ""}
                              onChange={(e) =>
                                setReplyDrafts((d) => ({ ...d, [root.id]: e.target.value }))
                              }
                              placeholder="Write a reply…"
                              className="min-h-[56px] text-xs bg-[var(--input)]"
                            />
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={replying[root.id]}
                                onClick={() => postReply(root.id)}
                              >
                                {replying[root.id] ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : null}
                                Send reply
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}
