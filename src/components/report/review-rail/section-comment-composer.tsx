"use client";

import { useState } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReport } from "@/providers/report-provider";
import { SECTION_LABELS } from "@/types/sections";
import type { SectionType } from "@/db/schema";

/**
 * Pinned-at-top-of-section card that lets a manager (review mode) start a new
 * section-level comment thread. Inline (selection-anchored) comments still come
 * from the Tiptap bubble menu.
 */
export function SectionCommentComposer({ section }: { section: SectionType }) {
  const { report, setComments, getSectionId, setActiveAnchorId } = useReport();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const sectionId = getSectionId(section);
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draft.trim(),
          section,
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
      setActiveAnchorId(data.comment.id);
      setDraft("");
      setOpen(false);
      toast.success("Comment posted");
    } finally {
      setPosting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-md border border-dashed border-[var(--border)] bg-[var(--card)]/40 hover:bg-[var(--secondary)]/30 hover:border-[var(--brand-500)]/60 px-3 py-2 text-[11px] text-[var(--muted-foreground)] flex items-center gap-2 cursor-pointer"
      >
        <MessageSquarePlus className="size-3.5 shrink-0" />
        Add note on {SECTION_LABELS[section] ?? section}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] shadow-sm p-2 space-y-2">
      <div className="text-[10px] uppercase tracking-wide font-medium text-[var(--muted-foreground)]">
        New note on {SECTION_LABELS[section] ?? section}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write a comment for the author…"
        autoFocus
        className="min-h-[64px] text-xs bg-[var(--input)]"
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            setOpen(false);
            setDraft("");
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          disabled={posting || !draft.trim()}
          onClick={post}
        >
          {posting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <MessageSquarePlus className="size-3" />
          )}
          Post
        </Button>
      </div>
    </div>
  );
}
