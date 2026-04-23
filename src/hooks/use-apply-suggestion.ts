"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { createId } from "@paralleldrive/cuid2";
import type { JSONContent } from "@tiptap/core";
import { useReport } from "@/providers/report-provider";
import {
  appendParagraphsToDoc,
  replaceTextInDoc,
} from "@/lib/tiptap/rich-text";
import { findAnchorRangeInDoc } from "@/lib/tiptap/find-anchor";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import type { EvaluationRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const TIPTAP_NARRATIVE_SECTIONS = new Set<SectionType>([
  "define",
  "measure",
  "improve",
  "control",
]);

type ApplyOptions = {
  /**
   * Mark the evaluation as `fixApplied` and persist. When applying via track-changes
   * marks, callers may want to defer this until the human accepts the resulting
   * suggestion in the editor.
   */
  markFixApplied?: boolean;
};

export type ApplySuggestionState = {
  applySuggestion: (evaluation: EvaluationRecord) => Promise<void>;
  ignoreSuggestion: (evaluation: EvaluationRecord) => Promise<void>;
  pendingId: string | null;
};

/**
 * Encapsulates AI suggestion Apply / Ignore. When the workspace's
 * `trackChangesMode` is on AND the section is a Tiptap narrative, the fix is
 * inserted as suggestion marks (`suggestionDelete` over the original anchor +
 * `suggestionInsert` for the replacement) instead of mutating text. The
 * evaluation is NOT marked as `fixApplied` in TC mode — the human reviewer
 * must accept the inline suggestion first.
 */
export function useApplySuggestion(): ApplySuggestionState {
  const {
    report,
    sections,
    replaceSection,
    setEvaluations,
    trackChangesMode,
    getEditor,
  } = useReport();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const ignoreSuggestion = useCallback(
    async (evaluation: EvaluationRecord) => {
      setPendingId(evaluation.id);
      try {
        const res = await fetch(
          `/api/reports/${report.id}/evaluations/${evaluation.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bypassed: true }),
          }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setEvaluations((prev) =>
          prev.map((e) => (e.id === evaluation.id ? data.evaluation : e))
        );
        toast.success("Suggestion dismissed");
      } catch {
        toast.error("Failed to dismiss suggestion");
      } finally {
        setPendingId(null);
      }
    },
    [report.id, setEvaluations]
  );

  const applySuggestion = useCallback(
    async (evaluation: EvaluationRecord) => {
      const fix = evaluation.suggestedFix;
      if (!fix?.replacementText?.trim()) return;
      setPendingId(evaluation.id);
      try {
        const sectionKey = evaluation.section as SectionType;
        const tc = trackChangesMode === true;
        const useTcMarks = tc && TIPTAP_NARRATIVE_SECTIONS.has(sectionKey);

        let appliedViaTc = false;
        if (useTcMarks) {
          appliedViaTc = applyViaSuggestionMarks(sectionKey, fix);
        }

        if (!appliedViaTc) {
          applyDirect(
            sectionKey,
            fix,
            sections,
            replaceSection as never
          );
        }

        const shouldMarkApplied: ApplyOptions["markFixApplied"] = !useTcMarks;

        if (shouldMarkApplied) {
          const res = await fetch(
            `/api/reports/${report.id}/evaluations/${evaluation.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fixApplied: true }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            setEvaluations((prev) =>
              prev.map((e) => (e.id === evaluation.id ? data.evaluation : e))
            );
          }
          toast.success("Fix applied");
        } else {
          toast.success(
            appliedViaTc
              ? "Inserted as tracked suggestion — accept it inline to commit."
              : "Fix applied"
          );
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to apply suggestion");
      } finally {
        setPendingId(null);
      }
    },
    [
      report.id,
      sections,
      replaceSection,
      setEvaluations,
      trackChangesMode,
      // getEditor accessed via closure on each call
    ]
  );

  /**
   * Returns true when the editor was found and marks were applied; returns
   * false to let the caller fall back to the direct content-mutation path.
   */
  function applyViaSuggestionMarks(
    section: SectionType,
    fix: { anchorText: string; replacementText: string }
  ): boolean {
    const editor = getEditor(section, "narrative");
    if (!editor) return false;
    const view = editor.view;
    const schema = view.state.schema;
    const insertType = schema.marks[suggestionInsertMarkName];
    const deleteType = schema.marks[suggestionDeleteMarkName];
    if (!insertType || !deleteType) return false;

    const baseAttrs = {
      id: createId(),
      authorId: "ai",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };

    const range = fix.anchorText.trim()
      ? findAnchorRangeInDoc(view.state.doc, fix.anchorText)
      : null;

    let tr = view.state.tr.setMeta("skipTrackChanges", true);

    if (range) {
      // 1. Mark original range as suggestionDelete (strikethrough until accepted).
      tr = tr.addMark(
        range.from,
        range.to,
        deleteType.create(baseAttrs)
      );
      // 2. Insert replacement text right after the deletion, marked as suggestionInsert.
      const insertPos = range.to;
      const node = schema.text(fix.replacementText, [
        insertType.create(baseAttrs),
      ]);
      tr = tr.insert(insertPos, node);
    } else {
      // No anchor / not found: append to end as a green insert.
      const endPos = view.state.doc.content.size;
      const para = schema.nodes.paragraph?.create(
        null,
        schema.text(fix.replacementText, [insertType.create(baseAttrs)])
      );
      if (!para) return false;
      tr = tr.insert(endPos, para);
    }

    view.dispatch(tr);
    return true;
  }

  return { applySuggestion, ignoreSuggestion, pendingId };
}

/**
 * Direct content mutation (replace text or append). Used when track changes is
 * off, or for non-Tiptap sections (Analyze).
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
