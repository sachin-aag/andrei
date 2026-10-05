"use client";

import { useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
} from "@/providers/report-provider";
import { evaluatableSectionKeys } from "@/lib/ai/criteria-view";
import { SectionAccordion } from "./section-accordion";
import {
  getCommentCardPreview,
  getCommentCardTitle,
  isAiFixComment,
} from "@/lib/comments/display";
import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import { cn, formatDateTime } from "@/lib/utils";

function CommentCard({
  comment,
  replyCount,
  onJump,
}: {
  comment: CommentRecord;
  replyCount: number;
  onJump?: () => void;
}) {
  const { evaluations } = useReportEvaluations();
  const aiFix = isAiFixComment(comment);
  const title = getCommentCardTitle(comment, evaluations);
  const preview = getCommentCardPreview(comment);

  return (
    <div className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5 hover:border-amber-600/40">
      <div className="flex items-center gap-2 flex-wrap">
        <MessageSquare
          className={cn(
            "size-3 shrink-0",
            aiFix ? "text-violet-600" : "text-[var(--muted-foreground)]"
          )}
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0 truncate text-xs font-semibold">
          {title}
        </span>
        {comment.status === "resolved" ? (
          <span className="ml-auto shrink-0 text-[10px] text-green-700">
            Resolved
          </span>
        ) : onJump ? (
          <button
            type="button"
            className="ml-auto shrink-0 rounded px-0.5 text-[10px] font-medium text-amber-800 transition-colors hover:text-amber-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            onClick={onJump}
          >
            Open
          </button>
        ) : (
          <span className="ml-auto shrink-0 text-[10px] text-amber-800">
            Open
          </span>
        )}
      </div>
      {preview ? (
        <button
          type="button"
          className="mt-1 line-clamp-2 w-full rounded text-left text-[11px] leading-snug text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          onClick={onJump}
          disabled={!onJump}
        >
          {preview}
        </button>
      ) : null}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
        <span>{formatDateTime(comment.createdAt)}</span>
        {replyCount > 0 && <span>· {replyCount} replies</span>}
      </div>
    </div>
  );
}

export function CommentsPanelContent({
  onJumpToComment,
}: {
  onJumpToComment?: (commentId: string) => void;
}) {
  const { report } = useReportData();
  const { comments } = useReportComments();
  const sectionKeys = useMemo(
    () => evaluatableSectionKeys(report.documentType),
    [report.documentType]
  );
  const [openSections, setOpenSections] = useState<Set<SectionType>>(
    () => new Set(sectionKeys)
  );

  const rootComments = useMemo(
    () =>
      [...comments]
        .filter((c) => !c.parentId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    [comments]
  );

  const grouped = useMemo(() => {
    const map: Record<string, CommentRecord[]> = {};
    for (const c of rootComments) {
      const key = c.section ?? "_unsectioned";
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [rootComments]);

  const unsectioned = grouped["_unsectioned"] ?? [];

  if (rootComments.length === 0) {
    return (
      <div className="py-8 text-center text-xs italic text-[var(--muted-foreground)]">
        No comments yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sectionKeys.map((section) => {
        const list = grouped[section] ?? [];
        return (
          <SectionAccordion
            key={section}
            section={section}
            count={list.length}
            isOpen={openSections.has(section)}
            onToggle={() => {
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has(section)) next.delete(section);
                else next.add(section);
                return next;
              });
            }}
          >
            <div className="space-y-1.5">
              {list.map((c) => {
                const replies = comments.filter((r) => r.parentId === c.id).length;
                return (
                  <CommentCard
                    key={c.id}
                    comment={c}
                    replyCount={replies}
                    onJump={() => onJumpToComment?.(c.id)}
                  />
                );
              })}
            </div>
          </SectionAccordion>
        );
      })}
      {unsectioned.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            General
          </p>
          {unsectioned.map((c) => {
            const replies = comments.filter((r) => r.parentId === c.id).length;
            return (
              <CommentCard
                key={c.id}
                comment={c}
                replyCount={replies}
                onJump={() => onJumpToComment?.(c.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
