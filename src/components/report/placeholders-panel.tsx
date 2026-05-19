import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useReportData,
  useReportEditors,
  useReportPlaceholders,
  useReportSections,
} from "@/providers/report-provider";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { SectionAccordion, useSectionAccordionState } from "./section-accordion";
import type { Placeholder } from "@/lib/placeholders/find";
import { fillPlaceholder } from "@/lib/placeholders/fill";
import { extractPlaceholderLabel } from "@/lib/placeholders/label";
import { fillPlainTextPlaceholder } from "@/lib/placeholders/fill-plain-text";
import { isPlainTextPlaceholderField } from "@/lib/placeholders/plain-text-fields";
import { plainTextPlaceholderContext } from "@/lib/placeholders/plain-text-segments";
import {
  setPlainTextFieldValue,
} from "@/lib/placeholders/plain-text-fields";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import {
  getPlaceholderSurroundingText,
  placeholderPanelContext,
  resolvePlaceholderInPmDoc,
} from "@/lib/placeholders/resolve-in-doc";
import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";

/* ------------------------------------------------------------------ */
/*  Individual placeholder card                                        */
/* ------------------------------------------------------------------ */

function PlaceholderCard({
  placeholder,
  fillValue,
  onFillValueChange,
  onFill,
  onJump,
  beforeCtx,
  afterCtx,
}: {
  placeholder: Placeholder;
  fillValue: string;
  onFillValueChange: (value: string) => void;
  onFill: () => void;
  onJump: () => void;
  beforeCtx: string;
  afterCtx: string;
}) {
  const label = extractPlaceholderLabel(placeholder.text);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* Header: field label + jump button */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
        <PenLine className="size-3.5 text-amber-600 shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-medium text-amber-800 truncate">
          {label}
        </span>
        <button
          type="button"
          onClick={onJump}
          className="text-[10px] font-medium text-amber-600 hover:text-amber-800 flex items-center gap-0.5 shrink-0 transition-colors"
          title="Jump to placeholder in editor"
        >
          Jump
          <ArrowRight className="size-3" />
        </button>
      </div>

      {/* Context: surrounding text with placeholder highlighted */}
      <div className="px-3 py-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
        {beforeCtx && <span>{beforeCtx}</span>}
        <span className="inline-block px-1 mx-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
          {placeholder.text}
        </span>
        {afterCtx && <span>{afterCtx}</span>}
      </div>

      {/* Fill input */}
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <Input
          value={fillValue}
          onChange={(e) => onFillValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onFill();
            }
          }}
          placeholder={"Enter value\u2026"}
          className="h-7 text-xs flex-1"
        />
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs px-3"
          disabled={!fillValue.trim()}
          onClick={onFill}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

type ExitingSnapshot = {
  id: string;
  placeholder: Placeholder;
  beforeCtx: string;
  afterCtx: string;
};

const SWIPE_OUT_MS = 320;

/** Renders a frozen snapshot of the card and swipes it out to the right after mount. */
function ExitingPlaceholderCard({
  snapshot,
  onDone,
}: {
  snapshot: ExitingSnapshot;
  onDone: () => void;
}) {
  const { placeholder, beforeCtx, afterCtx } = snapshot;
  const label = extractPlaceholderLabel(placeholder.text);
  const [phase, setPhase] = useState<"enter" | "exit">("enter");
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  useLayoutEffect(() => {
    const id2Ref = { current: null as number | null };
    const id1 = requestAnimationFrame(() => {
      id2Ref.current = requestAnimationFrame(() => setPhase("exit"));
    });
    const fallback = window.setTimeout(finish, SWIPE_OUT_MS + 120);
    return () => {
      cancelAnimationFrame(id1);
      if (id2Ref.current != null) cancelAnimationFrame(id2Ref.current);
      window.clearTimeout(fallback);
    };
  }, [finish]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform" && e.propertyName !== "opacity") return;
    finish();
  };

  return (
    <div
      aria-hidden
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden pointer-events-none select-none will-change-[transform,opacity]"
      style={{
        transitionProperty: "transform, opacity",
        transitionDuration: `${SWIPE_OUT_MS}ms`,
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        transform:
          phase === "exit"
            ? "translate3d(115%, 0, 0)"
            : "translate3d(0, 0, 0)",
        opacity: phase === "exit" ? 0 : 1,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
        <PenLine className="size-3.5 text-amber-600 shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-medium text-amber-800 truncate">
          {label}
        </span>
        <span className="text-[10px] font-medium text-amber-600/70 shrink-0">
          Filled
        </span>
      </div>
      <div className="px-3 py-2 text-xs text-[var(--muted-foreground)] leading-relaxed pb-2.5">
        {beforeCtx && <span>{beforeCtx}</span>}
        <span className="inline-block px-1 mx-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
          {placeholder.text}
        </span>
        {afterCtx && <span>{afterCtx}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Placeholders panel content                                         */
/* ------------------------------------------------------------------ */

export function PlaceholdersPanelContent({
  onJumpToPlaceholder,
}: {
  onJumpToPlaceholder: (p: Placeholder) => void;
}) {
  const { report } = useReportData();
  const { pendingPlaceholders } = useReportPlaceholders();
  const { sections, replaceSection } = useReportSections();
  const { getEditor } = useReportEditors();
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [exiting, setExiting] = useState<ExitingSnapshot[]>([]);
  const { openSections, toggle } = useSectionAccordionState();

  const grouped = pendingPlaceholders.reduce(
    (acc, p) => {
      if (!acc[p.section]) acc[p.section] = [];
      acc[p.section].push(p);
      return acc;
    },
    {} as Record<string, Placeholder[]>,
  );

  const handleFill = async (p: Placeholder) => {
    const value = fillValues[p.id]?.trim();
    if (!value) return;

    if (isPlainTextPlaceholderField(p.contentPath)) {
      const section = p.section as SectionType;
      const sectionContent = sections[section] as SectionContentMap[typeof section];
      const fieldText = getPlainTextFieldValue(
        sectionContent as Record<string, unknown>,
        p.contentPath
      );
      const nextText = fillPlainTextPlaceholder(fieldText, p, value);
      if (!nextText) return;

      const { beforeCtx, afterCtx } = plainTextPlaceholderContext(fieldText, p);
      const nextSection = setPlainTextFieldValue(sectionContent, p.contentPath, nextText);
      replaceSection(section, nextSection);

      const res = await fetch(`/api/reports/${report.id}/sections/${section}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextSection }),
      });
      if (!res.ok) return;

      setExiting((prev) => [
        ...prev.filter((x) => x.id !== p.id),
        { id: p.id, placeholder: p, beforeCtx, afterCtx },
      ]);
      setFillValues((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      return;
    }

    const editor = getEditor(p.section, p.contentPath);
    if (!editor) return;

    const doc = editor.state.doc;
    const live = resolvePlaceholderInPmDoc(doc, p);
    if (!live) return;

    const { beforeCtx, afterCtx } = getPlaceholderSurroundingText(
      doc,
      live.fromPos,
      live.toPos
    );

    const success = fillPlaceholder(editor, live, value);
    if (success) {
      setExiting((prev) => [
        ...prev.filter((x) => x.id !== p.id),
        { id: p.id, placeholder: p, beforeCtx, afterCtx },
      ]);
      setFillValues((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    }
  };

  if (pendingPlaceholders.length === 0 && exiting.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="size-12 rounded-full bg-green-50 flex items-center justify-center mb-4">
          <CheckCircle2 className="size-6 text-green-600" />
        </div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          You&apos;re all caught up!
        </p>
        <p className="text-xs text-[var(--muted-foreground)] mt-1 max-w-[250px]">
          No placeholders found in the document.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--muted-foreground)] mb-2">
        {pendingPlaceholders.length} placeholder{pendingPlaceholders.length === 1 ? "" : "s"}{" "}
        left to fill.
      </p>
      {EVALUATABLE_SECTIONS.map((section) => {
        const list = grouped[section] ?? [];
        const exitingForSection = exiting.filter(
          (e) => e.placeholder.section === section,
        );
        const sectionCount = list.length + exitingForSection.length;
        return (
          <SectionAccordion
            key={section}
            section={section}
            count={sectionCount}
            isOpen={openSections.has(section)}
            onToggle={() => toggle(section)}
          >
            <div className="space-y-2 overflow-x-hidden">
              {list.map((p) => {
                const { beforeCtx, afterCtx } = isPlainTextPlaceholderField(
                  p.contentPath
                )
                  ? plainTextPlaceholderContext(
                      getPlainTextFieldValue(
                        sections[p.section] as Record<string, unknown>,
                        p.contentPath
                      ),
                      p
                    )
                  : (() => {
                      const editor = getEditor(p.section, p.contentPath);
                      return editor
                        ? placeholderPanelContext(editor.state.doc, p)
                        : { beforeCtx: "", afterCtx: "" };
                    })();

                return (
                  <PlaceholderCard
                    key={p.id}
                    placeholder={p}
                    fillValue={fillValues[p.id] ?? ""}
                    onFillValueChange={(v) =>
                      setFillValues((prev) => ({ ...prev, [p.id]: v }))
                    }
                    onFill={() => handleFill(p)}
                    onJump={() => onJumpToPlaceholder(p)}
                    beforeCtx={beforeCtx}
                    afterCtx={afterCtx}
                  />
                );
              })}
              {exitingForSection.map((snap) => (
                <ExitingPlaceholderCard
                  key={`exiting-${snap.id}`}
                  snapshot={snap}
                  onDone={() =>
                    setExiting((prev) => prev.filter((x) => x.id !== snap.id))
                  }
                />
              ))}
            </div>
          </SectionAccordion>
        );
      })}
    </div>
  );
}
