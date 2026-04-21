"use client";

import { useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReport } from "@/providers/report-provider";
import { getUser } from "@/lib/auth/mock-users";
import { SECTION_LABELS } from "@/types/sections";
import { formatDateTime } from "@/lib/utils";
import type { SectionType } from "@/db/schema";
import type { WorkspaceMode } from "./report-workspace";

export function CommentsPanel({
  mode,
  activeSection,
}: {
  mode: WorkspaceMode;
  activeSection: SectionType;
}) {
  const { report, comments, setComments, currentUserId, getSectionId } = useReport();
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const canComment = mode === "review";

  const sortedComments = useMemo(
    () =>
      [...comments].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [comments]
  );

  const postComment = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const sectionId = getSectionId(activeSection);
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draft,
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
      setDraft("");
      toast.success("Comment posted");
    } finally {
      setPosting(false);
    }
  };

  const resolveComment = async (id: string) => {
    const res = await fetch(`/api/reports/${report.id}/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setComments((prev) => prev.map((c) => (c.id === id ? data.comment : c)));
  };

  return (
    <div className="p-4 space-y-4">
      {canComment && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 space-y-2">
          <Label>
            Add comment on {SECTION_LABELS[activeSection] ?? activeSection}
          </Label>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment for the author…"
            className="min-h-[80px] bg-[var(--input)]"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={postComment} disabled={posting}>
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

      {sortedComments.length === 0 ? (
        <div className="text-xs text-[var(--muted-foreground)] italic text-center py-6">
          No comments yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedComments.map((c) => {
            const author = getUser(c.authorId);
            const isAuthor = c.authorId === currentUserId;
            return (
              <li
                key={c.id}
                className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="size-6 rounded-full bg-[var(--brand-600)] flex items-center justify-center text-[10px] font-semibold">
                    {(author?.name ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="text-xs font-semibold truncate">
                      {author?.name ?? "Unknown"}
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {formatDateTime(c.createdAt)}
                      {c.section ? ` · ${SECTION_LABELS[c.section]}` : ""}
                    </span>
                  </div>
                  {c.status === "resolved" ? (
                    <span className="text-[10px] text-green-700 flex items-center gap-1">
                      <Check className="size-3" />
                      Resolved
                    </span>
                  ) : (
                    isAuthor && (
                      <button
                        className="text-[10px] text-[var(--muted-foreground)] hover:text-green-700 cursor-pointer"
                        onClick={() => resolveComment(c.id)}
                      >
                        Resolve
                      </button>
                    )
                  )}
                </div>
                <p className="text-xs leading-relaxed whitespace-pre-wrap">
                  {c.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
