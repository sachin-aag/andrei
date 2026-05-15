"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";
import {
  useReportComments,
  useReportData,
  useReportEditors,
  useReportEvaluations,
  useReportSections,
} from "@/providers/report-provider";
import {
  appendParagraphsToDoc,
  replaceTextInDoc,
} from "@/lib/tiptap/rich-text";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import { applyFieldOps } from "@/lib/ai/apply-field-ops";
import {
  coerceLegacyFix,
  type FieldOp,
  type PatchFix,
} from "@/lib/ai/suggested-fix";
import type { EvaluationRecord, CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

export type ApplySuggestionState = {
  /** Accept: commit the suggestion. For patches, marks are removed and the doc
   *  keeps the new text; for fields, set/append ops are written to the section. */
  applySuggestion: (evaluation: EvaluationRecord) => Promise<void>;
  /** Ignore: revert the suggestion. For patches, original text returns; for
   *  fields, the comment is dismissed and the eval bypassed (no doc revert
   *  needed since nothing was applied yet). */
  ignoreSuggestion: (evaluation: EvaluationRecord) => Promise<void>;
  /**
   * Remove the AI gutter card permanently. Pending patches drop their inline
   * marks; pending fields drop nothing in the doc. The criterion itself
   * remains visible/not bypassed in either case.
   */
  deleteAiSuggestion: (args: {
    evaluation: EvaluationRecord | null;
    commentId: string;
    isResolved: boolean;
  }) => Promise<void>;
  pendingId: string | null;
};

/**
 * Accept / Ignore for AI suggestions. Two delivery shapes:
 *
 *   - `kind:"patch"` (narrative sections): the suggestion is materialized as
 *     a `suggestionDelete` over the original anchor + a `suggestionInsert` for
 *     the replacement, both carrying `attrs.id === evaluation.id`. This hook
 *     walks the editor to locate those marks, then commits or reverts them.
 *
 *   - `kind:"fields"` (Analyze, plus the structured parts of Improve/Control):
 *     the suggestion is a list of set/append ops over the section's content
 *     tree. Accept walks the ops and writes them via `replaceSection`. Ignore
 *     just dismisses the linked comment + bypasses the eval (no inline marks
 *     to revert).
 */
export function useApplySuggestion(): ApplySuggestionState {
  const { report } = useReportData();
  const { sections, replaceSection } = useReportSections();
  const { comments, setComments } = useReportComments();
  const { getEditor } = useReportEditors();
  const {
    setEvaluations,
    scheduleEvaluation,
    pendingSuggestionId,
    setPendingSuggestionId,
  } = useReportEvaluations();

  const findLinkedComment = useCallback(
    (evaluationId: string): CommentRecord | undefined =>
      comments.find((c) => c.evaluationId === evaluationId && !c.parentId),
    [comments]
  );

  const patchEvaluation = useCallback(
    async (evaluationId: string, body: { bypassed?: boolean; fixApplied?: boolean }) => {
      const res = await fetch(
        `/api/reports/${report.id}/evaluations/${evaluationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error("Evaluation update failed");
      const data = await res.json();
      setEvaluations((prev) =>
        prev.map((e) => (e.id === evaluationId ? data.evaluation : e))
      );
    },
    [report.id, setEvaluations]
  );

  const patchComment = useCallback(
    async (commentId: string, status: "open" | "resolved" | "dismissed") => {
      const res = await fetch(`/api/reports/${report.id}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      // Dismissed/resolved comments may need to vanish from the gutter.
      if (status === "dismissed") {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else {
        const data = await res.json();
        setComments((prev) => prev.map((c) => (c.id === commentId ? data.comment : c)));
      }
    },
    [report.id, setComments]
  );

  // ── Walk the editor to find every range covered by suggestion marks
  //    whose attrs.id matches our evaluation id. We collect ranges in a
  //    single pass so we can apply a single transaction.
  const collectMarkRanges = useCallback(
    (
      section: SectionType,
      evaluationId: string
    ): {
      editor: ReturnType<typeof getEditor>;
      deletes: { from: number; to: number }[];
      inserts: { from: number; to: number }[];
    } | null => {
      const editor = getEditor(section, "narrative");
      if (!editor) return null;
      const view = editor.view;
      const schema = view.state.schema;
      const insertType = schema.marks[suggestionInsertMarkName];
      const deleteType = schema.marks[suggestionDeleteMarkName];
      if (!insertType || !deleteType) return null;

      const deletes: { from: number; to: number }[] = [];
      const inserts: { from: number; to: number }[] = [];

      view.state.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        const len = node.text?.length ?? 0;
        for (const m of node.marks) {
          if ((m.attrs as { id?: string }).id !== evaluationId) continue;
          if (m.type === insertType) inserts.push({ from: pos, to: pos + len });
          if (m.type === deleteType) deletes.push({ from: pos, to: pos + len });
        }
        return true;
      });

      return { editor, deletes, inserts };
    },
    [getEditor]
  );

  const acceptInline = useCallback(
    (section: SectionType, evaluationId: string): boolean => {
      const found = collectMarkRanges(section, evaluationId);
      if (!found || !found.editor) return false;
      const { editor, deletes, inserts } = found;
      if (deletes.length === 0 && inserts.length === 0) return false;

      const view = editor.view;
      const schema = view.state.schema;
      const insertType = schema.marks[suggestionInsertMarkName];
      const deleteType = schema.marks[suggestionDeleteMarkName];

      // Apply destructive ops in REVERSE order so earlier positions stay valid.
      // 1. Strip the insertInsert mark in place (text stays).
      // 2. Delete the entire deleteDelete range (text goes away).
      let tr = view.state.tr.setMeta("skipTrackChanges", true);
      const insertSorted = [...inserts].sort((a, b) => b.from - a.from);
      for (const r of insertSorted) {
        tr = tr.removeMark(r.from, r.to, insertType!);
      }
      const deleteSorted = [...deletes].sort((a, b) => b.from - a.from);
      for (const r of deleteSorted) {
        // Map through any prior step's transformation so the range is still valid.
        const from = tr.mapping.map(r.from, 1);
        const to = tr.mapping.map(r.to, -1);
        if (to > from) {
          tr = tr.delete(from, to);
        }
      }
      // Strip any leftover delete marks that didn't get removed by `delete`
      // (defensive — should be empty after the deletes).
      for (const r of deleteSorted) {
        const from = tr.mapping.map(r.from, 1);
        const to = tr.mapping.map(r.to, -1);
        if (to > from) tr = tr.removeMark(from, to, deleteType!);
      }
      view.dispatch(tr);
      return true;
    },
    [collectMarkRanges]
  );

  const ignoreInline = useCallback(
    (section: SectionType, evaluationId: string): boolean => {
      const found = collectMarkRanges(section, evaluationId);
      if (!found || !found.editor) return false;
      const { editor, deletes, inserts } = found;
      if (deletes.length === 0 && inserts.length === 0) return false;

      const view = editor.view;
      const schema = view.state.schema;
      const deleteType = schema.marks[suggestionDeleteMarkName];

      // Reverse of accept:
      // 1. Strip suggestionDelete marks (original text returns to normal).
      // 2. Delete the suggestionInsert range (proposed text goes away).
      let tr = view.state.tr.setMeta("skipTrackChanges", true);
      const deleteSorted = [...deletes].sort((a, b) => b.from - a.from);
      for (const r of deleteSorted) {
        tr = tr.removeMark(r.from, r.to, deleteType!);
      }
      const insertSorted = [...inserts].sort((a, b) => b.from - a.from);
      for (const r of insertSorted) {
        const from = tr.mapping.map(r.from, 1);
        const to = tr.mapping.map(r.to, -1);
        if (to > from) tr = tr.delete(from, to);
      }
      view.dispatch(tr);
      return true;
    },
    [collectMarkRanges]
  );

  const applySuggestion = useCallback(
    async (evaluation: EvaluationRecord) => {
      setPendingSuggestionId(evaluation.id);
      try {
        const sectionKey = evaluation.section as SectionType;
        const linkedComment = findLinkedComment(evaluation.id);
        const fix = coerceLegacyFix(evaluation.suggestedFix);
        let mutated = false;

        if (fix.kind === "none") {
          toast.error("Nothing to apply for this suggestion.");
          return;
        }

        if (fix.kind === "patch") {
          mutated = acceptInline(sectionKey, evaluation.id);
          // If marks weren't found in the editor (race / not yet rendered), fall
          // back to direct content mutation so the user always sees a result.
          if (!mutated && fix.replacementText.trim()) {
            mutated = applyPatchDirect(
              sectionKey,
              fix,
              sections,
              replaceSection as (section: SectionType, next: unknown) => void
            );
          }
        } else {
          // kind === "fields": always direct mutation; no inline marks exist.
          mutated = applyFieldsDirect(
            sectionKey,
            fix.ops,
            sections,
            replaceSection as (section: SectionType, next: unknown) => void
          );
        }

        if (!mutated) {
          toast.error("Could not apply — suggestion target no longer in document.");
          return;
        }

        await Promise.all([
          patchEvaluation(evaluation.id, { fixApplied: true }),
          linkedComment ? patchComment(linkedComment.id, "resolved") : Promise.resolve(),
        ]);
        toast.success("Suggestion applied");
        scheduleEvaluation(sectionKey, { immediate: true, reason: "post-action" });
      } catch (err) {
        console.error(err);
        toast.error("Failed to apply suggestion");
      } finally {
        setPendingSuggestionId(null);
      }
    },
    [
      acceptInline,
      findLinkedComment,
      patchComment,
      patchEvaluation,
      replaceSection,
      scheduleEvaluation,
      sections,
      setPendingSuggestionId,
    ]
  );

  const ignoreSuggestion = useCallback(
    async (evaluation: EvaluationRecord) => {
      setPendingSuggestionId(evaluation.id);
      try {
        const sectionKey = evaluation.section as SectionType;
        const linkedComment = findLinkedComment(evaluation.id);
        const fix = coerceLegacyFix(evaluation.suggestedFix);

        // Inline marks only exist for patch-shape fixes. Field-shape fixes
        // and `none` fixes have nothing to revert in the doc — bypass + dismiss
        // is the entire revert.
        if (fix.kind === "patch") {
          ignoreInline(sectionKey, evaluation.id);
        }

        await Promise.all([
          patchEvaluation(evaluation.id, { bypassed: true }),
          linkedComment ? patchComment(linkedComment.id, "dismissed") : Promise.resolve(),
        ]);
        toast.success("Suggestion dismissed");
        scheduleEvaluation(sectionKey, { immediate: true, reason: "post-action" });
      } catch (err) {
        console.error(err);
        toast.error("Failed to dismiss suggestion");
      } finally {
        setPendingSuggestionId(null);
      }
    },
    [
      findLinkedComment,
      ignoreInline,
      patchComment,
      patchEvaluation,
      scheduleEvaluation,
      setPendingSuggestionId,
    ]
  );

  const deleteAiSuggestion = useCallback(
    async ({
      evaluation,
      commentId,
      isResolved,
    }: {
      evaluation: EvaluationRecord | null;
      commentId: string;
      isResolved: boolean;
    }) => {
      try {
        if (evaluation && !isResolved) {
          const sectionKey = evaluation.section as SectionType;
          const fix = coerceLegacyFix(evaluation.suggestedFix);
          if (fix.kind === "patch") {
            ignoreInline(sectionKey, evaluation.id);
          }
        }

        const res = await fetch(
          `/api/reports/${report.id}/comments/${commentId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error ?? "Failed to delete");
          return;
        }
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        toast.success("Suggestion removed");
      } catch (err) {
        console.error(err);
        toast.error("Failed to remove suggestion");
      }
    },
    [
      ignoreInline,
      report.id,
      setComments,
    ]
  );

  return {
    applySuggestion,
    ignoreSuggestion,
    deleteAiSuggestion,
    pendingId: pendingSuggestionId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct-mutation helpers
// ─────────────────────────────────────────────────────────────────────────────

function applyFieldsDirect(
  section: SectionType,
  ops: FieldOp[],
  sections: Record<string, unknown>,
  replaceSection: (section: SectionType, next: unknown) => void
): boolean {
  const current = sections[section];
  if (!current || typeof current !== "object") return false;

  const { next, anyApplied } = applyFieldOps(current as Record<string, unknown>, ops);
  if (!anyApplied) return false;
  replaceSection(section, next);
  return true;
}

/** Apply a patch-shape suggestion to the section's narrative. Used only as a
 *  fallback when inline marks are not present in the editor (race / not-yet-
 *  mounted). For analyze/improve/control structured fields, the model should
 *  emit kind:"fields" instead. */
function applyPatchDirect(
  section: SectionType,
  fix: PatchFix,
  sections: Record<string, unknown>,
  replaceSection: (section: SectionType, next: unknown) => void
): boolean {
  const current = sections[section];
  if (!current || typeof current !== "object") return false;
  if (!("narrative" in current)) return false;
  const { anchorText, replacementText } = fix;
  if (!replacementText.trim()) return false;

  const withNarrative = current as { narrative: JSONContent };
  const cloned: JSONContent = JSON.parse(
    JSON.stringify(withNarrative.narrative)
  );
  let nextDoc = cloned;
  if (anchorText && anchorText.trim()) {
    const { doc, replaced } = replaceTextInDoc(
      cloned,
      anchorText,
      replacementText
    );
    nextDoc = replaced ? doc : appendParagraphsToDoc(cloned, replacementText);
  } else {
    nextDoc = appendParagraphsToDoc(cloned, replacementText);
  }
  replaceSection(section, {
    ...(current as object),
    narrative: nextDoc,
  });
  return true;
}
