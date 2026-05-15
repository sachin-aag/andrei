"use client";

import { useState } from "react";
import {
  Check,
  CornerDownRight,
  Loader2,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
} from "@/providers/report-provider";
import { useApplySuggestion } from "@/hooks/use-apply-suggestion";
import { getUser } from "@/lib/auth/mock-users";
import { cn, formatDateTime } from "@/lib/utils";
import { SECTION_LABELS } from "@/types/sections";
import type { CommentRecord } from "@/types/report";
import {
  coerceLegacyFix,
  type AppendFieldOp,
  type FieldOp,
  type SetFieldOp,
} from "@/lib/ai/suggested-fix";
import type { SectionType } from "@/db/schema";

const AI_KIND_LABEL: Record<string, string> = {
  ai_fix: "Andrei suggests",
  ai_grammar: "AI Grammar",
  ai_tone: "AI Tone",
  ai_removal: "AI Removal",
  ai_redraft: "AI Redraft",
};

function queryFieldAnchor(section: SectionType, contentPath: string): HTMLElement | null {
  const value = `${section}.${contentPath}`;
  const escaped = globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[data-field-anchor="${escaped}"]`);
}

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
  const { report, currentUserId } = useReportData();
  const {
    setComments,
    requestCommentFocus,
    hoveredCommentIds,
    setHoveredCommentIds,
    clearHoveredCommentIds,
  } = useReportComments();
  const { evaluations } = useReportEvaluations();
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const author = getUser(root.authorId);

  const isAi = (root.kind ?? "human").startsWith("ai_");
  const linkedEval = isAi && root.evaluationId
    ? evaluations.find((e) => e.id === root.evaluationId)
    : null;

  const canReplyOrResolve =
    currentUserId === report.authorId ||
    getUser(currentUserId)?.role === "manager";
  const canDismissHuman = canReplyOrResolve;
  const currentUserRole = getUser(currentUserId)?.role;
  const canDeleteRoot =
    currentUserId === root.authorId || currentUserRole === "manager";

  const deleteComment = async (commentId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/reports/${report.id}/comments/${commentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to delete comment");
        return;
      }
      setComments((prev) => {
        if (commentId === root.id) {
          const replyIds = new Set(replies.map((r) => r.id));
          return prev.filter((c) => c.id !== root.id && !replyIds.has(c.id));
        }
        return prev.filter((c) => c.id !== commentId);
      });
      setConfirmDelete(null);
      toast.success("Comment deleted");
    } finally {
      setDeleting(false);
    }
  };

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

  const patchStatus = async (status: "open" | "resolved" | "dismissed") => {
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
      // Dismissed comments drop out of the gutter entirely.
      if (status === "dismissed") {
        setComments((prev) => prev.filter((c) => c.id !== root.id));
      } else {
        setComments((prev) => prev.map((c) => (c.id === root.id ? data.comment : c)));
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleActivate = () => {
    onActivate();
    if (isAnchored) {
      requestCommentFocus(root.id);
      return;
    }
    if (root.section && root.contentPath) {
      queryFieldAnchor(root.section, root.contentPath)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  };

  const initials =
    (author?.name ?? "?")
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("") || "?";

  if (isAi) {
    return (
      <AiCommentCard
        root={root}
        active={active}
        isHovered={isHovered}
        criterionLabel={linkedEval?.criterionLabel ?? null}
        onActivate={handleActivate}
        onHover={() => setHoveredCommentIds([root.id])}
        onLeave={() => clearHoveredCommentIds()}
      />
    );
  }

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
              <span
                className={cn(
                  "text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide",
                  !canDeleteRoot && "ml-auto"
                )}
              >
                {SECTION_LABELS[root.section] ?? root.section}
              </span>
            )}
            {canDeleteRoot && (
              <button
                type="button"
                className={cn(
                  "ml-auto size-5 flex items-center justify-center rounded hover:bg-red-100 transition-colors",
                  confirmDelete === root.id
                    ? "text-red-600"
                    : "text-[var(--muted-foreground)] hover:text-red-600"
                )}
                disabled={deleting}
                title={confirmDelete === root.id ? "Click again to confirm" : "Delete thread"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDelete === root.id) {
                    void deleteComment(root.id);
                  } else {
                    setConfirmDelete(root.id);
                  }
                }}
                onBlur={() => setConfirmDelete(null)}
              >
                {deleting && confirmDelete === root.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
              </button>
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
                const canDeleteReply =
                  currentUserId === r.authorId || currentUserRole === "manager";
                return (
                  <li key={r.id} className="text-xs group/reply">
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)] mb-0.5">
                      <CornerDownRight className="size-3 shrink-0" />
                      <span className="font-medium text-[var(--foreground)]">
                        {ra?.name ?? "Unknown"}
                      </span>
                      <span>· {formatDateTime(r.createdAt)}</span>
                      {canDeleteReply && (
                        <button
                          type="button"
                          className={cn(
                            "size-4 flex items-center justify-center rounded transition-colors",
                            confirmDelete === r.id
                              ? "text-red-600 opacity-100"
                              : "text-[var(--muted-foreground)] hover:text-red-600"
                          )}
                          disabled={deleting}
                          title={confirmDelete === r.id ? "Click again to confirm" : "Delete reply"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirmDelete === r.id) {
                              void deleteComment(r.id);
                            } else {
                              setConfirmDelete(r.id);
                            }
                          }}
                          onBlur={() => setConfirmDelete(null)}
                        >
                          {deleting && confirmDelete === r.id ? (
                            <Loader2 className="size-2.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-2.5" />
                          )}
                        </button>
                      )}
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
                  {canDismissHuman && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-[var(--muted-foreground)]"
                      disabled={updating}
                      onClick={() => patchStatus("dismissed")}
                      title="Dismiss without resolving — removes the thread without marking it answered."
                    >
                      <X className="size-3" />
                      Ignore
                    </Button>
                  )}
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

/**
 * AI variant of the gutter card. The diff itself lives inline in the
 * document as suggestion marks, so the card carries reasoning + a one-line
 * anchor preview + Accept / Ignore.
 */
function AiCommentCard({
  root,
  active,
  isHovered,
  criterionLabel,
  onActivate,
  onHover,
  onLeave,
}: {
  root: CommentRecord;
  active: boolean;
  isHovered: boolean;
  criterionLabel: string | null;
  onActivate: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  const { report, currentUserId, readOnly } = useReportData();
  const { evaluations } = useReportEvaluations();
  const {
    applySuggestion,
    ignoreSuggestion,
    deleteAiSuggestion,
    pendingId,
  } = useApplySuggestion();
  const evaluation =
    evaluations.find((e) => e.id === root.evaluationId) ?? null;
  const pendingBusy = evaluation
    ? pendingId === evaluation.id
    : pendingId === root.id;
  const anySuggestionPending = pendingId !== null;
  const kindLabel = AI_KIND_LABEL[root.kind ?? "ai_fix"] ?? "AI Suggestion";
  const canDeleteAi =
    currentUserId === report.authorId ||
    getUser(currentUserId)?.role === "manager";
  const [confirmDeleteSuggestion, setConfirmDeleteSuggestion] = useState<
    string | null
  >(null);
  const [removingSuggestion, setRemovingSuggestion] = useState(false);

  const fix = evaluation
    ? coerceLegacyFix(evaluation.suggestedFix)
    : null;

  // Build a kind-aware preview of what Accept will do. For patches, show the
  // anchor span; for fields, list each op; for none / no-eval, fall back to a
  // generic message.
  const fieldOps: FieldOp[] | null =
    fix && fix.kind === "fields" ? fix.ops : null;
  const patchAnchor =
    fix && fix.kind === "patch" ? fix.anchorText : root.anchorText ?? "";
  const anchorPreview = fieldOps
    ? null
    : patchAnchor.trim()
      ? patchAnchor.length > 80
        ? `…${patchAnchor.slice(0, 80)}…`
        : `…${patchAnchor}…`
      : "Adding new content at end of section.";

  const isResolved = root.status === "resolved";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "rounded-md border bg-[var(--card)] shadow-sm text-left transition-all overflow-hidden cursor-pointer",
        active
          ? "border-violet-500 ring-2 ring-violet-400/30"
          : isHovered
            ? "border-violet-400 ring-1 ring-violet-300/30"
            : isResolved
              ? "border-[var(--border)]/70 opacity-80"
              : "border-[var(--border)] hover:border-violet-400/60"
      )}
    >
      <div className="px-3 py-1.5 border-b border-[var(--border)] flex items-center gap-2 bg-violet-50">
        <Sparkles className="size-3.5 text-violet-700 shrink-0" />
        <span className="text-[10px] tracking-wide font-semibold text-violet-800">
          {kindLabel}
        </span>
        {isResolved && (
          <span className="text-[10px] text-green-700 flex items-center gap-0.5 ml-2 font-medium">
            <Check className="size-3 shrink-0" />
            Applied
          </span>
        )}
        {root.section && (
          <span className="ml-auto text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide">
            {SECTION_LABELS[root.section] ?? root.section}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {criterionLabel && (
          <div className="text-xs font-semibold text-[var(--foreground)] leading-snug">
            {criterionLabel}
          </div>
        )}

        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
          {root.content}
        </p>

        {fieldOps && fieldOps.length > 0 ? (
          <FieldOpsPreview
            ops={fieldOps}
            section={root.section}
          />
        ) : anchorPreview ? (
          <div className="text-[10px] italic text-[var(--muted-foreground)]/80 leading-snug border-l-2 border-violet-300 pl-2">
            {anchorPreview}
          </div>
        ) : null}

        {!readOnly && ((evaluation && !isResolved) || canDeleteAi) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
            {evaluation && !isResolved && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="success"
                  className="h-7 text-xs"
                  disabled={anySuggestionPending || removingSuggestion}
                  onClick={() => void applySuggestion(evaluation)}
                >
                  {pendingBusy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                  Accept
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={anySuggestionPending || removingSuggestion}
                  onClick={() => void ignoreSuggestion(evaluation)}
                >
                  <X className="size-3" />
                  Ignore
                </Button>
              </>
            )}
            {canDeleteAi && (
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 size-8 items-center justify-center rounded-md border border-transparent transition-colors",
                  "ml-auto",
                  confirmDeleteSuggestion === root.id
                    ? "text-red-600 border-red-200 bg-red-50 hover:bg-red-50"
                    : "text-[var(--muted-foreground)] hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                )}
                disabled={anySuggestionPending || removingSuggestion}
                title={
                  confirmDeleteSuggestion === root.id
                    ? "Click again to confirm"
                    : "Delete suggestion"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDeleteSuggestion === root.id) {
                    setRemovingSuggestion(true);
                    void deleteAiSuggestion({
                      evaluation,
                      commentId: root.id,
                      isResolved,
                    }).finally(() => {
                      setRemovingSuggestion(false);
                      setConfirmDeleteSuggestion(null);
                    });
                  } else {
                    setConfirmDeleteSuggestion(root.id);
                  }
                }}
                onBlur={() => setConfirmDeleteSuggestion(null)}
              >
                {removingSuggestion ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fields-kind preview
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_OPS_PREVIEW_LIMIT = 4;

function FieldOpsPreview({
  ops,
  section,
}: {
  ops: FieldOp[];
  section: SectionType | null;
}) {
  const visible = ops.slice(0, FIELD_OPS_PREVIEW_LIMIT);
  const hidden = ops.length - visible.length;
  return (
    <div className="space-y-1 border-l-2 border-violet-300 pl-2">
      {visible.map((op, i) => (
        <div
          key={i}
          className="flex items-start gap-1.5 text-[10px] text-[var(--muted-foreground)] leading-snug"
        >
          <span
            className={cn(
              "inline-flex items-center rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide shrink-0",
              op.op === "set"
                ? "bg-violet-100 text-violet-800"
                : "bg-emerald-100 text-emerald-800"
            )}
          >
            {op.op === "set" ? "Set" : "Add"}
          </span>
          <span className="font-medium text-[var(--foreground)]">
            {formatPathLabel(section, op.path, op.op)}
          </span>
          <span className="text-[var(--muted-foreground)]/80 italic truncate">
            {opValueSnippet(op)}
          </span>
        </div>
      ))}
      {hidden > 0 && (
        <div className="text-[10px] italic text-[var(--muted-foreground)]/70">
          + {hidden} more {hidden === 1 ? "field" : "fields"}
        </div>
      )}
    </div>
  );
}

function opValueSnippet(op: FieldOp): string {
  const raw =
    op.op === "set"
      ? (op as SetFieldOp).value
      : Object.values((op as AppendFieldOp).value).find(
          (v) => typeof v === "string" && v.trim()
        ) ?? "";
  const collapsed = String(raw).replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  const limit = 60;
  return collapsed.length > limit
    ? `“${collapsed.slice(0, limit)}…”`
    : `“${collapsed}”`;
}

// Friendlier labels for the per-criterion field paths the prompt instructs the
// model to use. Falls back to a prettified version of the raw path so we
// always render something sensible.
const STATIC_LABELS: Record<string, Record<string, string>> = {
  analyze: {
    "sixM.man": "6M · Man",
    "sixM.machine": "6M · Machine",
    "sixM.measurement": "6M · Measurement",
    "sixM.material": "6M · Material",
    "sixM.method": "6M · Method",
    "sixM.milieu": "6M · Milieu",
    "sixM.conclusion": "6M · Conclusion",
    "fiveWhy.narrative": "5-Why · Chain",
    "fiveWhy.conclusion": "5-Why · Conclusion",
    investigationOutcome: "Investigation outcome",
    "rootCause.narrative": "Root cause · Narrative",
    "rootCause.primaryLevel1": "Root cause · Level 1",
    "rootCause.secondaryLevel2": "Root cause · Level 2",
    "rootCause.thirdLevel3": "Root cause · Level 3",
    "impactAssessment.system": "Impact · System",
    "impactAssessment.document": "Impact · Document",
    "impactAssessment.product": "Impact · Product",
    "impactAssessment.equipment": "Impact · Equipment",
    "impactAssessment.patientSafety": "Impact · Patient safety",
  },
  improve: {
    correctiveActions: "New corrective action",
  },
  control: {
    preventiveActions: "Preventive actions",
    interimPlan: "Interim plan",
    finalComments: "Final comments",
    regulatoryImpact: "Regulatory impact",
    productQuality: "Product quality",
    validation: "Validation",
    stability: "Stability",
    marketClinical: "Market / Clinical",
    lotDisposition: "Lot disposition",
    conclusion: "Conclusion",
  },
};

const CORRECTIVE_ACTION_FIELDS: Record<string, string> = {
  description: "Description",
  responsiblePerson: "Responsible person",
  dueDate: "Due date",
  expectedOutcome: "Expected outcome",
  effectivenessVerification: "Effectiveness verification",
};

function formatPathLabel(
  section: SectionType | null,
  path: string,
  op: FieldOp["op"]
): string {
  if (op === "append" && section === "improve" && path === "correctiveActions") {
    return "New corrective action";
  }

  // correctiveActions[N].field → "Action N+1 · <field>"
  const ca = path.match(/^correctiveActions\[(\d+)\](?:\.([a-zA-Z]+))?$/);
  if (ca) {
    const idx = Number.parseInt(ca[1]!, 10);
    const fld = ca[2] ?? "";
    const fldLabel = CORRECTIVE_ACTION_FIELDS[fld] ?? prettify(fld);
    return fld ? `Action ${idx + 1} · ${fldLabel}` : `Action ${idx + 1}`;
  }

  if (section && STATIC_LABELS[section]?.[path]) {
    return STATIC_LABELS[section]![path]!;
  }

  return prettify(path);
}

function prettify(path: string): string {
  if (!path) return "";
  return path
    .split(/[\.\[\]]+/)
    .filter(Boolean)
    .map((seg) =>
      seg
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase())
    )
    .join(" · ");
}
