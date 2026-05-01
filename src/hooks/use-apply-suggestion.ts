"use client";

import { useCallback, useState } from "react";
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
import type { EvaluationRecord, CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const NARRATIVE_SECTIONS = new Set<SectionType>([
  "define",
  "measure",
  "improve",
  "control",
]);

export type ApplySuggestionState = {
  /** Accept: commit the inline suggestion. Marks are removed; doc keeps the new text. */
  applySuggestion: (evaluation: EvaluationRecord) => Promise<void>;
  /** Ignore: revert the inline suggestion. Original text returns; new text is dropped. */
  ignoreSuggestion: (evaluation: EvaluationRecord) => Promise<void>;
  pendingId: string | null;
};

/**
 * Accept / Ignore for AI suggestions. Server-side, the suggestion is already
 * materialized in the document as a `suggestionDelete` over the original
 * anchor + a `suggestionInsert` for the replacement, both carrying
 * `attrs.id === evaluation.id`. This hook walks the editor to locate those
 * marks, then commits or reverts them, updates the linked AI comment, and
 * triggers a post-action eval so the criterion immediately reflects the change.
 *
 * Non-narrative sections (analyze) have no inline marks — they fall back to
 * the direct content-mutation path for Accept and just dismiss the comment +
 * bypass the eval for Ignore.
 */
export function useApplySuggestion(): ApplySuggestionState {
  const { report } = useReportData();
  const { sections, replaceSection } = useReportSections();
  const { comments, setComments } = useReportComments();
  const { getEditor } = useReportEditors();
  const { setEvaluations, scheduleEvaluation } = useReportEvaluations();
  const [pendingId, setPendingId] = useState<string | null>(null);

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
      const insertType = schema.marks[suggestionInsertMarkName];
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
      setPendingId(evaluation.id);
      try {
        const sectionKey = evaluation.section as SectionType;
        const linkedComment = findLinkedComment(evaluation.id);
        let mutated = false;

        if (NARRATIVE_SECTIONS.has(sectionKey)) {
          mutated = acceptInline(sectionKey, evaluation.id);
          // If marks weren't found in the editor (race / not yet rendered), fall
          // back to direct content mutation so the user always sees a result.
          if (!mutated && evaluation.suggestedFix?.replacementText?.trim()) {
            applyDirect(sectionKey, evaluation.suggestedFix, sections, replaceSection as never);
            mutated = true;
          }
        } else {
          // Non-narrative (analyze): no inline marks. Use direct mutation.
          if (evaluation.suggestedFix?.replacementText?.trim()) {
            applyDirect(sectionKey, evaluation.suggestedFix, sections, replaceSection as never);
            mutated = true;
          }
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
        setPendingId(null);
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
    ]
  );

  const ignoreSuggestion = useCallback(
    async (evaluation: EvaluationRecord) => {
      setPendingId(evaluation.id);
      try {
        const sectionKey = evaluation.section as SectionType;
        const linkedComment = findLinkedComment(evaluation.id);

        if (NARRATIVE_SECTIONS.has(sectionKey)) {
          ignoreInline(sectionKey, evaluation.id);
        }
        // Analyze has no inline marks to revert; bypassing the eval +
        // dismissing the comment is the entire revert.

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
        setPendingId(null);
      }
    },
    [
      findLinkedComment,
      ignoreInline,
      patchComment,
      patchEvaluation,
      scheduleEvaluation,
    ]
  );

  return { applySuggestion, ignoreSuggestion, pendingId };
}

/**
 * Direct content mutation (for analyze section, or as a fallback when the
 * inline marks aren't present in the editor anymore).
 */
function applyDirect(
  section: SectionType,
  fix: { anchorText: string; replacementText: string },
  sections: Record<string, unknown>,
  replaceSection: (section: SectionType, next: unknown) => void
) {
  const current = sections[section];
  if (!current) return;
  const { anchorText, replacementText } = fix;
  if (!replacementText.trim()) return;

  switch (section) {
    case "define":
    case "measure":
    case "improve":
    case "control": {
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
      break;
    }
    case "analyze": {
      const ana = current as { investigationOutcome: string };
      const existing = ana.investigationOutcome ?? "";
      let next: string;
      if (anchorText && anchorText.trim() && existing.includes(anchorText)) {
        next = existing.replace(anchorText, replacementText);
      } else if (
        anchorText &&
        anchorText.trim() &&
        collapse(existing).includes(collapse(anchorText))
      ) {
        const re = new RegExp(
          anchorText
            .replace(/\s+/g, "WHITESPACE_PLACEHOLDER")
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/WHITESPACE_PLACEHOLDER/g, "\\s+")
        );
        next = existing.replace(re, replacementText);
      } else {
        next = existing.trim()
          ? `${existing.trim()}\n\n${replacementText}`
          : replacementText;
      }
      replaceSection("analyze", {
        ...(current as object),
        investigationOutcome: next,
      });
      break;
    }
  }
}
